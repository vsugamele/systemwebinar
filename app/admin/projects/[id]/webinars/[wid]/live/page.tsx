'use client'

import { useEffect, useState, useRef, startTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'

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

export default function LivePage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const tickRef = useRef<NodeJS.Timeout | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [webinarName, setWebinarName] = useState('')
  const [webinarSlug, setWebinarSlug] = useState('')
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null)
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
  interface RealtimeStats {
    online_now: number
    peak_simultaneous: number
    total_joined: number
    recent_dropoffs: number
    recent_cta_clicks: number
    updated_at: string
  }
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null)
  const [realtimeLoading, setRealtimeLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('webi_webinars')
      .select('name, slug, display_name, session_started_at, scheduled_start_at, schedule_recurrence, schedule_time, schedule_days, fake_viewers_start, fake_viewers_peak, fake_viewers_end, fake_viewers_peak_at_pct, is_panic_active, fallback_url, webi_projects(timezone)')
      .eq('id', wid)
      .single()
      .then(({ data, error }) => {
        if (error) { toast.error('Erro ao carregar dados da sessão.'); setLoading(false); return }
        if (data) {
          setWebinarName(data.name)
          setWebinarSlug(data.slug)
          setDisplayName(data.display_name || '')
          setSessionStartedAt(data.session_started_at ?? null)
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
            setProjectTimezone((data.webi_projects as any).timezone || 'America/Sao_Paulo')
          }
        }
        setLoading(false)
      })
  }, [wid])

  // Poll realtime stats every 30s
  useEffect(() => {
    async function fetchRealtime() {
      setRealtimeLoading(true)
      try {
        const res = await fetch(`/api/analytics/realtime?webinar_id=${wid}`)
        if (res.ok) {
          const data = await res.json()
          setRealtime(data)
        }
      } catch {}
      setRealtimeLoading(false)
    }
    fetchRealtime()
    const interval = setInterval(fetchRealtime, 30_000)
    return () => clearInterval(interval)
  }, [wid])

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
      }).eq('id', wid)
      if (error) throw error
      setSessionStartedAt(null)
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
      const now = new Date().toISOString()
      const { error } = await supabase.from('webi_webinars').update({ session_started_at: now }).eq('id', wid)
      if (error) throw error
      setSessionStartedAt(now)
    } catch {
      toast.error('Erro ao iniciar sessão.')
    } finally {
      setRestarting(false)
    }
  }

  async function stopSession() {
    try {
      const { error } = await supabase.from('webi_webinars').update({ session_started_at: null }).eq('id', wid)
      if (error) throw error
      setSessionStartedAt(null)
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
          <h1 className="page-title">🎬 Ao Vivo</h1>
          <p className="page-subtitle">Controle a sessão e a audiência da sua live</p>
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

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>

        {/* SESSION CLOCK — primary action */}
        <div className="card" style={{
          border: isLive ? '1px solid rgba(34,197,94,0.4)' : '1px solid var(--border)',
          background: isLive ? 'rgba(34,197,94,0.04)' : 'var(--bg-card)',
        }}>
          {scheduleRecurrence === 'once' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: isLive ? '#22c55e' : 'var(--border)',
                      boxShadow: isLive ? '0 0 8px #22c55e' : 'none',
                      animation: isLive ? 'livePulse 1.5s ease-in-out infinite' : 'none',
                    }} />
                    <span style={{ fontWeight: 700, fontSize: 16 }}>
                      {isLive ? 'Sessão em andamento' : 'Sessão não iniciada'}
                    </span>
                  </div>
                  {isLive && (
                    <div style={{ fontSize: 13, color: 'var(--success)', fontFamily: 'monospace', marginBottom: 4 }}>
                      ⏱ {elapsed}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 420 }}>
                    {isLive
                      ? `Todos os participantes que entrarem verão o vídeo a partir do segundo correto. Reiniciar zerou o clock.`
                      : 'Clique em Iniciar para que todos os participantes vejam o mesmo ponto do vídeo em tempo real.'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <button
                    className="btn btn-primary"
                    style={{ minWidth: 200 }}
                    onClick={startSession}
                    disabled={restarting}
                  >
                    {restarting ? '⏳ Iniciando...' : isLive ? '🔄 Reiniciar Sessão' : '▶ Iniciar Sessão'}
                  </button>
                  {isLive && (
                    <button className="btn btn-ghost btn-sm" onClick={stopSession} style={{ textAlign: 'center' }}>
                      ✕ Parar e remover clock
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: '#3b82f6',
                boxShadow: '0 0 8px #3b82f6',
                animation: 'livePulse 2s ease-in-out infinite',
              }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Piloto Automático (Evergreen)</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  O modo de início manual está desativado pois você configurou um agendamento recorrente. 
                  As sessões iniciarão e desligarão sozinhas nos horários programados.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* REALTIME AUDIENCE WIDGET */}
        <div className="card" style={{
          border: '1px solid rgba(99,102,241,0.3)',
          background: 'rgba(99,102,241,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#6366f1',
                boxShadow: '0 0 8px #6366f1',
                animation: 'livePulse 2s ease-in-out infinite',
              }} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>📡 Audiência em Tempo Real</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {realtimeLoading ? 'Atualizando...' : realtime ? `Atualizado às ${new Date(realtime.updated_at).toLocaleTimeString('pt-BR')}` : 'Carregando...'}
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12,
          }}>
            {/* Online Agora */}
            <div style={{
              background: 'var(--bg-elevated)',
              borderRadius: 12,
              padding: '14px 16px',
              border: '1px solid rgba(34,197,94,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>
                {realtime?.online_now ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>🟢 Online Agora</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>últimos 90s</div>
            </div>

            {/* Pico Simultâneo */}
            <div style={{
              background: 'var(--bg-elevated)',
              borderRadius: 12,
              padding: '14px 16px',
              border: '1px solid rgba(167,139,250,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>
                {realtime?.peak_simultaneous ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>📈 Pico Simultâneo</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>últimos 3 dias</div>
            </div>

            {/* Total que entrou */}
            <div style={{
              background: 'var(--bg-elevated)',
              borderRadius: 12,
              padding: '14px 16px',
              border: '1px solid rgba(59,130,246,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#3b82f6', lineHeight: 1 }}>
                {realtime?.total_joined ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>👥 Total Entraram</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>todas as sessões</div>
            </div>

            {/* Saíram recentemente */}
            <div style={{
              background: 'var(--bg-elevated)',
              borderRadius: 12,
              padding: '14px 16px',
              border: '1px solid rgba(239,68,68,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>
                {realtime?.recent_dropoffs ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>🚪 Saíram</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>últimos 5 min</div>
            </div>

            {/* CTAs recentes */}
            <div style={{
              background: 'var(--bg-elevated)',
              borderRadius: 12,
              padding: '14px 16px',
              border: '1px solid rgba(249,115,22,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f97316', lineHeight: 1 }}>
                {realtime?.recent_cta_clicks ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>🛒 Cliques Pitch</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>últimas 24h</div>
            </div>
          </div>

          {realtime && realtime.online_now > 0 && realtime.total_joined > 0 && (
            <div style={{
              marginTop: 12,
              fontSize: 12,
              color: 'var(--text-muted)',
              background: 'var(--bg-elevated)',
              borderRadius: 8,
              padding: '8px 12px',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
            }}>
              <span>🔁 Retenção atual: <strong style={{ color: '#6366f1' }}>{Math.round((realtime.online_now / realtime.total_joined) * 100)}%</strong></span>
              {realtime.recent_cta_clicks > 0 && realtime.online_now > 0 && (
                <span>💰 Conv. ao vivo: <strong style={{ color: '#f97316' }}>{Math.round((realtime.recent_cta_clicks / realtime.total_joined) * 100)}%</strong></span>
              )}
            </div>
          )}
        </div>

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
                <li><strong>Modo Manual (Uma vez):</strong> O vídeo só começa quando você clica em "Iniciar Sessão". Antes disso, os alunos veem a tela "Fora do Ar".</li>
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
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Configure o nome público da sala e como o contador de espectadores se comporta.
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
        `}</style>
      </div>
    </>
  )
}
