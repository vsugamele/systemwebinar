'use client'
 
import { useEffect, useMemo, useState, useRef, startTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as ChartTooltip } from 'recharts'

function elapsedLabel(iso: string | null): string {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 0) return 'ainda não iniciou'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m rodando`
  if (m > 0) return `${m}m ${s}s rodando`
  return `${s}s rodando`
}

interface RecentClick {
  id: string
  session_id: string
  created_at: string
  lead_name: string
  lead_email: string
}

interface RealtimeStats {
  online_now: number
  peak_simultaneous: number
  total_joined: number
  recent_dropoffs: number
  recent_cta_clicks: number
  recent_clicks_list?: RecentClick[]
  duration_seconds?: number
  elapsed_seconds?: number
  current_video_minute?: number
  current_retention_pct?: number
  audience_delta_pct_2m?: number
  average_watch_seconds?: number
  pitch_at_minute?: number | null
  pitch_viewers?: number
  pitch_seen?: number
  pitch_ctr?: number
  cta_last_5m?: number
  chat_messages_last_5m?: number
  chat_messages_last_60s?: number
  active_chatters_last_5m?: number
  video_timeline?: {
    minute: number
    label: string
    viewers: number
    retention_pct: number
    cta_clicks: number
    chat_messages: number
    is_pitch: boolean
    is_current: boolean
  }[]
  alerts?: string[]
  updated_at: string
}

function formatMetricDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function LivePage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = useMemo(() => createClient(), [])
  const tickRef = useRef<NodeJS.Timeout | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [webinarName, setWebinarName] = useState('')
  const [webinarSlug, setWebinarSlug] = useState('')
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null)
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [elapsed, setElapsed] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduleRecurrence, setScheduleRecurrence] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once')
  const [scheduleTime, setScheduleTime] = useState('20:00')
  const [scheduleDays, setScheduleDays] = useState<number[]>([])
  const [savingScheduled, setSavingScheduled] = useState(false)
  const [scheduleTimeUntil, setScheduleTimeUntil] = useState('')
  const [projectTimezone, setProjectTimezone] = useState('America/Sao_Paulo')
  const [showGuide, setShowGuide] = useState(false)
  const [pitchMinute, setPitchMinute] = useState<number | null>(null)

  // Panic Button states
  const [isPanicActive, setIsPanicActive] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState('')

  const [form, setForm] = useState({
    fake_viewers_start: 50,
    fake_viewers_peak: 500,
    fake_viewers_end: 150,
    fake_viewers_peak_at_pct: 30,
  })

  // Realtime audience stats
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null)
  const [realtimeLoading, setRealtimeLoading] = useState(false)
  const isFirstLoadRef = useRef(true)
  const seenClicksRef = useRef<Set<string>>(new Set())
  const [audienceHistory, setAudienceHistory] = useState<{ time: string; viewers: number }[]>([])
  const [assistantAlerts, setAssistantAlerts] = useState<string[]>([])
  const prevOnlineNowRef = useRef<number | null>(null)
  const ctaAlertTriggeredRef = useRef(false)

  useEffect(() => {
    if (!sessionStartedAt) {
      setAudienceHistory([])
      setAssistantAlerts([])
      ctaAlertTriggeredRef.current = false
      prevOnlineNowRef.current = null
    }
  }, [sessionStartedAt])

  useEffect(() => {
    supabase
      .from('webi_webinars')
      .select('name, slug, display_name, session_started_at, current_run_id, scheduled_start_at, schedule_recurrence, schedule_time, schedule_days, fake_viewers_start, fake_viewers_peak, fake_viewers_end, fake_viewers_peak_at_pct, is_panic_active, fallback_url, analytics_pitch_minute, webi_projects(timezone)')
      .eq('id', wid)
      .single()
      .then(({ data, error }) => {
        if (error) { toast.error('Erro ao carregar dados da sessão.'); setLoading(false); return }
        if (data) {
          setWebinarName(data.name)
          setWebinarSlug(data.slug)
          setDisplayName(data.display_name || '')
          setSessionStartedAt(data.session_started_at ?? null)
          setPitchMinute(data.analytics_pitch_minute ?? null)
          setCurrentRunId(data.current_run_id ?? null)
          setScheduleRecurrence((data.schedule_recurrence as 'once' | 'daily' | 'weekly' | 'monthly') || 'once')
          setScheduleTime(data.schedule_time || '20:00')
          setScheduleDays((data.schedule_days as number[]) || [])
          setIsPanicActive(data.is_panic_active || false)
          setFallbackUrl(data.fallback_url || '')
          if (data.scheduled_start_at) {
            // Convert to local datetime-local format
            const d = new Date(data.scheduled_start_at)
            const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
              .toISOString().slice(0, 16)
            setScheduledAt(local)
          }
          setForm({
            fake_viewers_start: data.fake_viewers_start ?? 50,
            fake_viewers_peak: data.fake_viewers_peak ?? 500,
            fake_viewers_end: data.fake_viewers_end ?? 150,
            fake_viewers_peak_at_pct: data.fake_viewers_peak_at_pct ?? 30,
          })
          if (data.webi_projects && typeof data.webi_projects === 'object') {
            const project = data.webi_projects as { timezone?: string }
            setProjectTimezone(project.timezone || 'America/Sao_Paulo')
          }
        }
        setLoading(false)
      })
  }, [supabase, wid])

  // Poll realtime stats: 15s if live, 30s if offline
  useEffect(() => {
    async function fetchRealtime() {
      setRealtimeLoading(true)
      try {
        const res = await fetch(`/api/analytics/realtime?webinar_id=${wid}`)
        if (res.ok) {
          const data = await res.json() as RealtimeStats
          setRealtime(data)

          const clicks = data.recent_clicks_list || []
          if (isFirstLoadRef.current) {
            // Popula os cliques iniciais sem mostrar toasts
            clicks.forEach((c) => seenClicksRef.current.add(c.id))
            isFirstLoadRef.current = false
          } else {
            // Mostra toast para novos cliques (mais antigos primeiro se houver múltiplos)
            const newClicks = [...clicks].reverse().filter((c) => !seenClicksRef.current.has(c.id))
            newClicks.forEach((c) => {
              seenClicksRef.current.add(c.id)
              toast.success(`🎉 ${c.lead_name} clicou na oferta!`, {
                duration: 8000,
                icon: '💰',
                style: {
                  background: '#1e1b4b',
                  color: '#fff',
                  border: '1px solid #10b981',
                }
              })
            })
          }

          // 1. Audience History (trend sparkline)
          const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          setAudienceHistory(prev => {
            const updated = [...prev, { time: nowStr, viewers: data.online_now }]
            if (updated.length > 10) updated.shift()
            return updated
          })

          // 2. Alert Monitoring
          const alertsList: string[] = [...(data.alerts || [])]

          // Condition A: Retention drop > 20%
          const prevViewers = prevOnlineNowRef.current
          const currentViewers = data.online_now
          if (prevViewers !== null && prevViewers > 5) {
            const dropRatio = (prevViewers - currentViewers) / prevViewers
            if (dropRatio >= 0.20) {
              const dropPct = Math.round(dropRatio * 100)
              const msg = `⚠️ Queda brusca de audiência detectada: queda de ${dropPct}% nos espectadores ativos (${prevViewers} → ${currentViewers}).`
              alertsList.push(msg)
              toast.error(msg, {
                duration: 10000,
                icon: '⚠️',
                style: {
                  background: '#450a0a',
                  color: '#fca5a5',
                  border: '1px solid #ef4444',
                }
              })
            }
          }
          prevOnlineNowRef.current = currentViewers

          // Condition B: No CTA clicks 5 minutes after pitch
          if (sessionStartedAt && pitchMinute !== null) {
            const pitchSeconds = pitchMinute * 60
            const elapsedSeconds = (Date.now() - new Date(sessionStartedAt).getTime()) / 1000
            
            if (elapsedSeconds > pitchSeconds + 300) {
              if (data.recent_cta_clicks === 0) {
                const msg = `🚨 Alerta de Pitch: Nenhum clique na oferta registrado 5 minutos após o pitch. Considere fixar o CTA ou fazer uma chamada extra no chat!`
                alertsList.push(msg)
                
                if (!ctaAlertTriggeredRef.current) {
                  ctaAlertTriggeredRef.current = true
                  toast.error(msg, {
                    duration: 15000,
                    icon: '🚨',
                    style: {
                      background: '#451a03',
                      color: '#fb923c',
                      border: '1px solid #ea580c',
                    }
                  })
                }
              }
            }
          }

          setAssistantAlerts(alertsList)
        }
      } catch {}
      setRealtimeLoading(false)
    }

    const isLive = !!sessionStartedAt
    const pollInterval = isLive ? 15_000 : 30_000

    fetchRealtime()
    const interval = setInterval(fetchRealtime, pollInterval)
    return () => clearInterval(interval)
  }, [wid, sessionStartedAt, pitchMinute])

  // Scheduled countdown ticker
  useEffect(() => {
    function updateLabel() {
      if (!scheduledAt) { setScheduleTimeUntil(''); return }
      const diff = new Date(scheduledAt).getTime() - Date.now()
      if (diff <= 0) { setScheduleTimeUntil(''); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (h > 0) setScheduleTimeUntil(`${h}h ${m}m ${s}s`)
      else if (m > 0) setScheduleTimeUntil(`${m}m ${s}s`)
      else setScheduleTimeUntil(`${s}s`)
    }
    const t = setInterval(updateLabel, 1000)
    updateLabel()
    return () => clearInterval(t)
  }, [scheduledAt])

  async function saveScheduled() {
    setSavingScheduled(true)
    try {
      let updatePayload: Record<string, unknown>
      if (scheduleRecurrence === 'once') {
        const iso = scheduledAt ? new Date(scheduledAt).toISOString() : null
        updatePayload = {
          scheduled_start_at: iso,
          schedule_recurrence: 'once',
          schedule_time: null,
          schedule_days: null,
          // Auto-activate if a date is set — ensures the webinar is publicly accessible
          ...(iso ? { status: 'active' } : {}),
        }
      } else {
        updatePayload = {
          schedule_recurrence: scheduleRecurrence,
          schedule_time: scheduleTime,
          schedule_days: scheduleRecurrence === 'weekly' ? scheduleDays : null,
          // Recurring schedules always need the webinar to be active
          status: 'active',
        }
      }
      const { error } = await supabase.from('webi_webinars').update(updatePayload).eq('id', wid)
      if (error) throw error
      toast.success('Agendamento salvo! Webinar ativado automaticamente.')
    } catch {
      toast.error('Erro ao salvar agendamento. Tente novamente.')
    } finally {
      setSavingScheduled(false)
    }
  }

  async function clearScheduled() {
    try {
      setScheduledAt('')
      setScheduleRecurrence('once')
      setScheduleTime('20:00')
      setScheduleDays([])
      const { error } = await supabase.from('webi_webinars').update({
        scheduled_start_at: null,
        schedule_recurrence: 'once',
        schedule_time: null,
        schedule_days: null,
        session_started_at: null,
        current_run_id: null,
      }).eq('id', wid)
      if (error) throw error
      setSessionStartedAt(null)
      setCurrentRunId(null)
    } catch {
      toast.error('Erro ao limpar agendamento.')
    }
  }

  // Live elapsed ticker
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setElapsed(elapsedLabel(sessionStartedAt))
    }, 1000)
    startTransition(() => setElapsed(elapsedLabel(sessionStartedAt)))
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [sessionStartedAt])

  async function startSession() {
    setRestarting(true)
    try {
      const res = await fetch('/api/webinar-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webinar_id: wid, action: 'start' }),
      })
      if (!res.ok) throw new Error('run_start_failed')
      const data = await res.json()
      setSessionStartedAt(data.session_started_at)
      setCurrentRunId(data.run?.id || null)
      toast.success(isLive ? 'Nova execucao iniciada.' : 'Sessao iniciada.')
    } catch {
      toast.error('Erro ao iniciar sessão.')
    } finally {
      setRestarting(false)
    }
  }

  async function stopSession() {
    try {
      const res = await fetch('/api/webinar-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webinar_id: wid, action: 'stop', run_id: currentRunId }),
      })
      if (!res.ok) throw new Error('run_stop_failed')
      setSessionStartedAt(null)
      setCurrentRunId(null)
      toast.success('Execucao encerrada.')
    } catch {
      toast.error('Erro ao encerrar sessão.')
    }
  }

  async function togglePanic(active: boolean) {
    if (active && (!fallbackUrl || !fallbackUrl.startsWith('http'))) {
      toast.error('Informe uma URL de fallback válida antes de ativar o Pânico.')
      return
    }

    try {
      const { error } = await supabase.from('webi_webinars').update({
        is_panic_active: active,
        fallback_url: fallbackUrl
      }).eq('id', wid)
      if (error) throw error
      setIsPanicActive(active)
      toast.success(active ? 'Botão de Pânico ATIVADO! Usuários serão redirecionados.' : 'Botão de Pânico Desativado.')
    } catch {
      toast.error('Erro ao atualizar Pânico.')
    }
  }

  async function saveViewers(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('webi_webinars').update({
        ...form, display_name: displayName || null,
      }).eq('id', wid)
      if (error) throw error
      toast.success('Curva de audiência salva!')
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const isLive = !!sessionStartedAt

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">🔴 Control Room</h1>
          <p className="page-subtitle">Comando operacional da live, audiência e contingência</p>
        </div>

        <Link
          href={`/w/${webinarSlug}?test=1`}
          target="_blank"
          className="btn btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          👁 Pré-visualizar sala
        </Link>
      </div>

      <div className="page-body live-control-room-v2" style={{ maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Top Control Panel: Session Status + Lifecycle Buttons */}
        <div className="card" style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(255,255,255,0.01) 100%)',
          border: isLive ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: isLive ? '0 10px 30px rgba(16,185,129,0.04)' : 'none',
        }}>
          {scheduleRecurrence === 'once' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                {/* Pulsing indicator */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: isLive ? '#10b981' : 'var(--text-muted)',
                    boxShadow: isLive ? '0 0 12px #10b981' : 'none',
                    zIndex: 2,
                  }} />
                  {isLive && (
                    <div style={{
                      position: 'absolute', width: 26, height: 26, borderRadius: '50%',
                      background: '#10b981', opacity: 0.4,
                      animation: 'livePulse 1.8s ease-in-out infinite',
                      zIndex: 1,
                    }} />
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>
                      {isLive ? 'Sessão em Andamento' : 'Sessão Offline'}
                    </span>
                    {isLive && (
                      <span style={{
                        fontSize: 22,
                        fontFamily: 'monospace',
                        fontWeight: 900,
                        color: '#10b981',
                        letterSpacing: '0.05em',
                        marginLeft: 8,
                        textShadow: '0 0 10px rgba(16,185,129,0.2)',
                      }}>
                        {elapsed.replace(' rodando', '')}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0 0', maxWidth: 500 }}>
                    {isLive
                      ? 'Os participantes estão assistindo ao vídeo de forma sincronizada em tempo real.'
                      : 'Clique em iniciar para colocar a transmissão no ar e ativar o relógio sincronizado.'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{
                    minWidth: 160,
                    padding: '12px 24px',
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 10,
                    background: isLive ? '#059669' : 'var(--brand)',
                    borderColor: isLive ? '#059669' : 'var(--brand)',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.2)',
                  }}
                  onClick={startSession}
                  disabled={restarting}
                >
                  {restarting ? '⏳...' : isLive ? '🔄 Reiniciar Sessão' : '▶ Iniciar Sessão'}
                </button>
                {isLive && (
                  <button
                    className="btn"
                    style={{
                      padding: '12px 20px',
                      fontSize: 14,
                      fontWeight: 700,
                      borderRadius: 10,
                      background: 'rgba(239,68,68,0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239,68,68,0.25)',
                    }}
                    onClick={stopSession}
                  >
                    🛑 Parar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 10px #3b82f6', zIndex: 2 }} />
                <div style={{ position: 'absolute', width: 22, height: 22, borderRadius: '50%', background: '#3b82f6', opacity: 0.3, animation: 'livePulse 2s infinite', zIndex: 1 }} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>🤖 Piloto Automático (Evergreen) Ativo</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  O controle manual está desabilitado porque há um agendamento recorrente ativo. As transmissões iniciam sozinhas.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Realtime Stats Block: operational video KPIs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
        }} className="stats-horizontal-grid">
          {[
            { label: 'Online agora', value: realtime?.online_now ?? 0, icon: '🟢', color: '#10b981', bg: 'rgba(16,185,129,0.03)', border: 'rgba(16,185,129,0.15)', sub: `${realtime?.current_retention_pct ?? 0}% retencao atual` },
            { label: 'Minuto do video', value: realtime?.current_video_minute ?? 0, suffix: 'm', icon: '▶️', color: '#60a5fa', bg: 'rgba(96,165,250,0.03)', border: 'rgba(96,165,250,0.15)', sub: `${formatMetricDuration(realtime?.elapsed_seconds)} de execucao` },
            { label: 'Pitch CTR', value: realtime?.pitch_ctr ?? 0, suffix: '%', icon: '🎯', color: '#f97316', bg: 'rgba(249,115,22,0.03)', border: 'rgba(249,115,22,0.15)', sub: `${realtime?.recent_cta_clicks ?? 0} cliques / ${Math.max(realtime?.pitch_seen ?? 0, realtime?.pitch_viewers ?? 0)} expostos` },
            { label: 'Chat 5m', value: realtime?.chat_messages_last_5m ?? 0, icon: '💬', color: '#a78bfa', bg: 'rgba(167,139,250,0.03)', border: 'rgba(167,139,250,0.15)', sub: `${realtime?.active_chatters_last_5m ?? 0} pessoas ativas` },
            { label: 'Saíram 5m', value: realtime?.recent_dropoffs ?? 0, icon: '🚪', color: '#f87171', bg: 'rgba(248,113,113,0.03)', border: 'rgba(248,113,113,0.15)', sub: `${realtime?.audience_delta_pct_2m ?? 0}% em 2 min` },
          ].map(stat => (
            <div key={stat.label} style={{
              background: stat.bg,
              border: `1px solid ${stat.border}`,
              borderRadius: 14,
              padding: '16px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{stat.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{stat.label}</span>
              </div>
              <div style={{
                fontSize: 32,
                fontWeight: 900,
                color: stat.color,
                lineHeight: 1.1,
                textShadow: `0 4px 12px ${stat.color}15`
              }}>
                {stat.value.toLocaleString('pt-BR')}{'suffix' in stat ? stat.suffix : ''}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{stat.sub}</span>
            </div>
          ))}
        </div>

        {/* Conversion Metric Sub-bar (Inline block) */}
        {realtime && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                🔁 Retenção agora: <strong style={{ color: '#10b981', fontSize: 14 }}>
                  {realtime.current_retention_pct ?? 0}%
                </strong>
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                🎯 Pitch: <strong style={{ color: '#f97316', fontSize: 14 }}>
                  {realtime.pitch_at_minute != null ? `${realtime.pitch_at_minute}m` : 'não definido'}
                </strong>
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ⏱ Tempo médio assistido: <strong style={{ color: '#a78bfa', fontSize: 14 }}>
                  {formatMetricDuration(realtime.average_watch_seconds)}
                </strong>
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                🛒 CTA 5m: <strong style={{ color: '#f97316', fontSize: 14 }}>
                  {realtime.cta_last_5m ?? 0}
                </strong>
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {realtimeLoading ? 'Atualizando dados...' : `Última atualização: ${new Date(realtime.updated_at).toLocaleTimeString('pt-BR')}`}
            </span>
          </div>
        )}

        {/* Live video timeline */}
        {realtime && (
          <div className="card" style={{ padding: 24, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>📍 Timeline do vídeo em tempo real</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Retenção por minuto com marcadores de agora, pitch, cliques no CTA e volume de chat.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '4px 8px' }}>● Agora</span>
                <span style={{ border: '1px solid rgba(249,115,22,0.35)', borderRadius: 999, padding: '4px 8px', color: '#f97316' }}>🎯 Pitch</span>
                <span style={{ border: '1px solid rgba(96,165,250,0.35)', borderRadius: 999, padding: '4px 8px', color: '#60a5fa' }}>🛒 CTA</span>
                <span style={{ border: '1px solid rgba(167,139,250,0.35)', borderRadius: 999, padding: '4px 8px', color: '#a78bfa' }}>💬 Chat</span>
              </div>
            </div>

            {!realtime.video_timeline || realtime.video_timeline.length === 0 ? (
              <div style={{ minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 13 }}>
                Aguardando amostras do player para montar a timeline.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${realtime.video_timeline.length}, minmax(26px, 1fr))`, gap: 6, alignItems: 'end', minHeight: 190 }}>
                {realtime.video_timeline.map(point => {
                  const height = Math.max(8, Math.round((point.retention_pct || 0) * 1.25))
                  const isHot = point.cta_clicks > 0 || point.chat_messages > 0
                  return (
                    <div key={point.minute} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <div style={{ height: 18, display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}>
                        {point.is_pitch && <span title="Pitch">🎯</span>}
                        {point.cta_clicks > 0 && <span title={`${point.cta_clicks} cliques`}>🛒</span>}
                        {point.chat_messages > 0 && <span title={`${point.chat_messages} mensagens`}>💬</span>}
                      </div>
                      <div
                        title={`${point.minute}m: ${point.viewers} viewers, ${point.retention_pct}% retencao, ${point.cta_clicks} CTA, ${point.chat_messages} chat`}
                        style={{
                          width: '100%',
                          height,
                          minHeight: 8,
                          borderRadius: '6px 6px 2px 2px',
                          background: point.is_current
                            ? '#10b981'
                            : point.is_pitch
                              ? '#f97316'
                              : isHot
                                ? '#60a5fa'
                                : 'rgba(148,163,184,0.35)',
                          border: point.is_current ? '2px solid #bbf7d0' : '1px solid rgba(255,255,255,0.08)',
                          boxShadow: point.is_current ? '0 0 18px rgba(16,185,129,0.35)' : 'none',
                          transition: 'height 0.2s ease',
                        }}
                      />
                      <div style={{
                        fontSize: 10,
                        color: point.is_current ? '#10b981' : 'var(--text-muted)',
                        fontWeight: point.is_current ? 800 : 600,
                        whiteSpace: 'nowrap',
                      }}>
                        {point.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 18 }}>
              {[
                { label: 'Viewers no pitch', value: realtime.pitch_viewers ?? 0, sub: realtime.pitch_at_minute != null ? `minuto ${realtime.pitch_at_minute}` : 'sem pitch definido', color: '#f97316' },
                { label: 'Expostos ao pitch', value: realtime.pitch_seen ?? 0, sub: 'popup/CTA visto', color: '#f59e0b' },
                { label: 'CTR do pitch', value: `${realtime.pitch_ctr ?? 0}%`, sub: 'cliques / expostos', color: '#10b981' },
                { label: 'Chat por minuto', value: realtime.chat_messages_last_60s ?? 0, sub: 'últimos 60s', color: '#a78bfa' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Conversions Feed */}
        <div className="card" style={{
          border: '1px solid rgba(16,185,129,0.25)',
          background: 'rgba(16,185,129,0.01)',
          padding: 24,
          borderRadius: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>💰</span>
              <h3 style={{ fontWeight: 800, fontSize: 16, color: '#10b981', margin: 0 }}>Histórico de Cliques na Oferta</h3>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Atualizações em tempo real</span>
          </div>

          {!realtime?.recent_clicks_list || realtime.recent_clicks_list.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-muted)',
              background: 'var(--bg-elevated)', borderRadius: 10, border: '1px dashed var(--border)'
            }}>
              Aguardando cliques na oferta nesta sessão... 🛒
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {realtime.recent_clicks_list.map((c) => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--bg-elevated)', borderRadius: 12, padding: '12px 16px',
                  border: '1px solid rgba(255,255,255,0.03)',
                  animation: 'bounceIn 0.3s ease-out'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', background: '#10b981',
                      boxShadow: '0 0 8px #10b981'
                    }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.lead_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.lead_email}</div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 800, color: '#f97316',
                    background: 'rgba(249,115,22,0.1)', padding: '4px 8px', borderRadius: 6
                  }}>
                    Clicou 🛒
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ASSISTANT ALERTS AND AUDIENCE TREND PANEL */}
        {isLive && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* Audience Trend sparkline */}
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                📈 Histórico & Tendência da Audiência
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Visualização em tempo real das oscilações de espectadores simultâneos nos últimos minutos.
              </p>
              
              {audienceHistory.length < 2 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 10 }}>
                  Coletando primeiras amostras de audiência... 📊
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={audienceHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={9} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={9} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} labelStyle={{ color: '#fff', fontSize: 11 }} itemStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="viewers" name="Espectadores" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Assistant Alerts Dashboard */}
            <div className="card" style={{
              padding: 24,
              border: assistantAlerts.length > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
              background: assistantAlerts.length > 0 ? 'rgba(239,68,68,0.01)' : 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}>
              <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, color: assistantAlerts.length > 0 ? '#ef4444' : '#fff' }}>
                🚨 Alertas do Assistente
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Alertas automáticos para quedas bruscas de atenção ou baixo engajamento com a oferta.
              </p>

              {assistantAlerts.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, fontSize: 12, color: '#10b981', background: 'rgba(16,185,129,0.04)', border: '1px dashed rgba(16,185,129,0.2)', borderRadius: 10, fontWeight: 600 }}>
                  ✅ Tudo normal. Nenhum alerta crítico ativo.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 160 }}>
                  {assistantAlerts.map((alert, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 12, fontSize: 12, color: '#fca5a5', lineHeight: 1.4 }}>
                      {alert}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCHEDULING */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>🗓 Agendamento</div>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => setShowGuide(!showGuide)}
              style={{ fontSize: 12 }}
            >
              {showGuide ? 'Ocultar Guia' : 'Como funciona? 📖'}
            </button>
          </div>
          
          {showGuide && (
            <div style={{ 
              background: 'var(--bg-elevated)', padding: 14, borderRadius: 8, 
              border: '1px solid var(--border)', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' 
            }}>
              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li><strong>Modo Manual (Uma vez):</strong> O vídeo só começa quando você clica em &quot;Iniciar Sessão&quot;. Antes disso, os alunos veem a tela &quot;Fora do Ar&quot;.</li>
                <li><strong>Piloto Automático (Evergreen):</strong> O botão Iniciar some. O sistema calcula automaticamente o tempo de vídeo baseado no horário configurado.</li>
                <li><strong>Sincronização Perfeita:</strong> Quem entra atrasado assiste o vídeo a partir do momento atual (ex: se entrar 10 min atrasado, o vídeo inicia aos 10 min). Os eventos de chat acompanham.</li>
                <li><strong>Fuso Horário:</strong> Os horários são baseados no timezone do Projeto. Todos os alunos assistirão simultaneamente.</li>
              </ul>
            </div>
          )}

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Configure quando a transmissão começa. Fuso atual: <strong style={{ color: 'var(--text-primary)' }}>{projectTimezone}</strong>.
          </div>

          {/* Recurrence mode tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {([
              { id: 'once', label: '📅 Uma vez' },
              { id: 'daily', label: '🔁 Diário' },
              { id: 'weekly', label: '📆 Semanal' },
              { id: 'monthly', label: '🗓 Mensal' },
            ] as const).map(opt => (
              <button
                key={opt.id}
                onClick={() => setScheduleRecurrence(opt.id)}
                style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                  border: `1px solid ${scheduleRecurrence === opt.id ? 'var(--brand)' : 'var(--border)'}`,
                  background: scheduleRecurrence === opt.id ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: scheduleRecurrence === opt.id ? 'var(--brand)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Once: datetime-local */}
          {scheduleRecurrence === 'once' && (
            <input
              type="datetime-local"
              className="form-input"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}
            />
          )}

          {/* Daily: just time */}
          {scheduleRecurrence === 'daily' && (
            <div style={{ marginBottom: 12 }}>
               <label className="form-label">Horário diário</label>
               <input
                 type="time"
                 className="form-input"
                 value={scheduleTime}
                 onChange={e => setScheduleTime(e.target.value)}
                 style={{ width: 160 }}
               />
               <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                 O webinar recomeça do início todos os dias neste horário.
               </div>
            </div>
          )}

          {/* Weekly: day checkboxes + time */}
          {scheduleRecurrence === 'weekly' && (
            <div style={{ marginBottom: 12 }}>
               <label className="form-label">Dias da semana</label>
               <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                 {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => (
                   <button
                     key={i}
                     onClick={() => setScheduleDays(prev =>
                       prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                     )}
                     style={{
                       width: 40, height: 40, borderRadius: 8, fontSize: 11, fontWeight: 700,
                       border: `1px solid ${scheduleDays.includes(i) ? 'var(--brand)' : 'var(--border)'}`,
                       background: scheduleDays.includes(i) ? 'rgba(99,102,241,0.15)' : 'transparent',
                       color: scheduleDays.includes(i) ? 'var(--brand)' : 'var(--text-muted)',
                       cursor: 'pointer', transition: 'all 0.15s',
                     }}
                   >
                     {d}
                   </button>
                 ))}
               </div>
               <label className="form-label">Horário</label>
               <input
                 type="time"
                 className="form-input"
                 value={scheduleTime}
                 onChange={e => setScheduleTime(e.target.value)}
                 style={{ width: 160 }}
               />
            </div>
          )}

          {/* Monthly: day of month + time */}
          {scheduleRecurrence === 'monthly' && (
            <div style={{ marginBottom: 12 }}>
               <label className="form-label">Dia do mês e horário</label>
               <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                 <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Dia</span>
                 <select
                   className="form-input"
                   value={scheduledAt ? new Date(scheduledAt).getDate() : 1}
                   onChange={e => {
                     const d = scheduledAt ? new Date(scheduledAt) : new Date()
                     d.setDate(Number(e.target.value))
                     const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                     setScheduledAt(local)
                   }}
                   style={{ width: 80 }}
                 >
                   {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                     <option key={n} value={n}>{n}</option>
                   ))}
                 </select>
                 <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>às</span>
                 <input
                   type="time"
                   className="form-input"
                   value={scheduleTime}
                   onChange={e => setScheduleTime(e.target.value)}
                   style={{ width: 120 }}
                 />
               </div>
            </div>
          )}

          {scheduleRecurrence === 'once' && scheduledAt && scheduleTimeUntil && (
            <div style={{
              fontSize: 13, color: '#a78bfa', marginBottom: 12,
              background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: 8, padding: '8px 12px',
            }}>
              ⏳ Começa em <strong>{scheduleTimeUntil}</strong>
            </div>
          )}
          {scheduleRecurrence === 'once' && scheduledAt && !scheduleTimeUntil && (
            <div style={{
              fontSize: 13, color: 'var(--success)', marginBottom: 12,
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 8, padding: '8px 12px',
            }}>
              ✅ Agendado para {new Date(scheduledAt).toLocaleString('pt-BR')}
            </div>
          )}
          {scheduleRecurrence !== 'once' && scheduleTime && (
            <div style={{
              fontSize: 13, color: '#a78bfa', marginBottom: 12,
              background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: 8, padding: '8px 12px',
            }}>
              🔁 Recorrência ativa — {scheduleRecurrence === 'daily' ? `Diário às ${scheduleTime}` : scheduleRecurrence === 'weekly' ? `Semanal às ${scheduleTime}` : `Mensal às ${scheduleTime}`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={saveScheduled} disabled={savingScheduled}>
               {savingScheduled ? '⏳...' : '💾 Salvar agendamento'}
            </button>
            {(scheduledAt || scheduleRecurrence !== 'once') && (
              <button className="btn btn-ghost btn-sm" onClick={clearScheduled}>
                ✕ Remover agendamento
              </button>
            )}
          </div>
        </div>

        {/* PANIC BUTTON */}
        <div className="card" style={{ border: isPanicActive ? '1px solid #ef4444' : '1px solid var(--border)', background: isPanicActive ? 'rgba(239,68,68,0.05)' : 'var(--bg-card)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: isPanicActive ? '#ef4444' : 'inherit' }}>🚨 Botão de Pânico</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Em caso de emergência ou queda da transmissão, ative para redirecionar todos os participantes imediatamente para uma URL de suporte ou sala reserva.
          </div>
          
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">URL de Fallback / Redirecionamento</label>
            <input
              type="url"
              className="form-input"
              value={fallbackUrl}
              onChange={e => setFallbackUrl(e.target.value)}
              placeholder="https://..."
              style={{ width: '100%' }}
              disabled={isPanicActive}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {!isPanicActive ? (
              <button className="btn btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={() => togglePanic(true)}>
                🚨 Ativar Pânico
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => togglePanic(false)}>
                ✅ Desativar e Normalizar
              </button>
            )}
            {isPanicActive && (
               <div style={{ fontSize: 12, color: '#ef4444', alignSelf: 'center', fontWeight: 'bold' }}>
                 Redirecionamento Ativo!
               </div>
            )}
          </div>
        </div>

        {/* VIEWER CURVE */}
        <form onSubmit={saveViewers}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👥 Curva de Audiência & Nome da Sala</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Configure o nome público da sala e como o contador de espectadores se comporta.
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', alignSelf: 'center', marginRight: 4 }}>
                Presets Rápidos:
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setForm({ fake_viewers_start: 12, fake_viewers_peak: 45, fake_viewers_end: 18, fake_viewers_peak_at_pct: 35 })}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                🤏 Pequeno (45 max)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setForm({ fake_viewers_start: 75, fake_viewers_peak: 320, fake_viewers_end: 90, fake_viewers_peak_at_pct: 30 })}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                🚀 Médio (320 max)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setForm({ fake_viewers_start: 450, fake_viewers_peak: 2400, fake_viewers_end: 620, fake_viewers_peak_at_pct: 25 })}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                🔥 Mega (2400 max)
              </button>
            </div>

            {/* Display Name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>Nome de Exibição (público)</label>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Como aparece no cabeçalho da sala para os participantes. Deixe vazio para usar o nome interno.</div>
              <input
                className="form-input"
                placeholder={webinarName || 'Ex: Masterclass de Marketing Digital'}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            {/* Visual curve preview */}
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 4, height: 48,
              marginBottom: 20, padding: '0 4px',
            }}>
              {Array.from({ length: 20 }).map((_, i) => {
                const pct = i / 19
                const peakAt = form.fake_viewers_peak_at_pct / 100
                const peakEnd = Math.min(peakAt + 0.15, 0.8)
                const endRatio = form.fake_viewers_peak > 0
                  ? Math.min(1, form.fake_viewers_end / form.fake_viewers_peak)
                  : 0
                let h: number
                if (pct <= peakAt) {
                  h = peakAt > 0 ? pct / peakAt : 1
                } else if (pct <= peakEnd) {
                  h = 1
                } else if (pct <= 0.85) {
                  h = 1 - (1 - endRatio) * (pct - peakEnd) / (0.85 - peakEnd)
                } else {
                  h = endRatio
                }
                const height = Math.max(4, Math.round(h * 44))
                return (
                  <div key={i} style={{
                    flex: 1, height, borderRadius: 3,
                    background: `hsl(252,90%,${45 + h * 20}%)`,
                    opacity: 0.8 + h * 0.2,
                  }} />
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {([
                { key: 'fake_viewers_start', label: 'Início', hint: 'Viewers quando a sala abre (t=0)' },
                { key: 'fake_viewers_peak', label: 'Pico', hint: 'Número máximo exibido' },
                { key: 'fake_viewers_end', label: 'Final', hint: 'Viewers ao fim do vídeo' },
                { key: 'fake_viewers_peak_at_pct', label: 'Pico em % do vídeo', hint: 'Ex: 30 = atingido em 30% do vídeo' },
              ] as const).map(({ key, label, hint }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{label}</label>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{hint}</div>
                  <input
                    type="number"
                    min={0}
                    max={key === 'fake_viewers_peak_at_pct' ? 100 : 100000}
                    className="form-input"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: +e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>

            <div style={{
              fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 16,
            }}>
              📈 {form.fake_viewers_start.toLocaleString('pt-BR')} → pico <strong>{form.fake_viewers_peak.toLocaleString('pt-BR')}</strong> em {form.fake_viewers_peak_at_pct}% → {form.fake_viewers_end.toLocaleString('pt-BR')}
            </div>

            <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? '⏳ Salvando...' : '💾 Salvar curva'}
            </button>
          </div>
        </form>

        <style>{`
          @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
          @keyframes bounceIn {
            0% { transform: scale(0.95); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    </>
  )
}
