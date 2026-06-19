'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast, Toaster } from 'react-hot-toast'
import { useWebinarHealth } from '@/hooks/useWebinarHealth'

interface WebinarData {
  id: string
  name: string
  slug: string
  status: string
  video_url: string | null
  waiting_room_enabled: boolean
  waiting_delay_seconds: number
  theme?: 'dark' | 'light' | 'youtube'
  tracking_head_code?: string
  tracking_body_code?: string
  webhook_url?: string
  whatsapp_api_url?: string
  whatsapp_api_key?: string
  whatsapp_welcome_message?: string
  whatsapp_pitch_message?: string
  custom_background_url?: string | null
  video_orientation?: 'horizontal' | 'vertical'
  is_evergreen?: boolean
  analytics_pitch_minute?: number | null
  landing_headline?: string | null
  landing_button_text?: string | null
  current_run_id?: string | null
}

// ── Collapsible section for Integrations ──────────────────────────────────────
function Section({
  icon, title, subtitle, badge, defaultOpen = true, children,
}: {
  icon: string
  title: string
  subtitle?: string
  badge?: { label: string; ok: boolean }
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 24px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
            background: badge.ok ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
            color: badge.ok ? '#10b981' : '#f59e0b',
            marginRight: 12,
          }}>
            {badge.label}
          </span>
        )}
        <span style={{
          color: 'var(--text-muted)', fontSize: 18, fontWeight: 300,
          transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s',
        }}>⌄</span>
      </button>

      {open && (
        <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: 20 }}>{children}</div>
        </div>
      )}
    </div>
  )
}

function SectionSaveBtn({ saving, label = 'Salvar' }: { saving: boolean; label?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '8px 20px' }}>
        {saving ? '⏳ Salvando...' : `💾 ${label}`}
      </button>
    </div>
  )
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{children}</label>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

export default function WebinarOverviewPage() {
  const { id: projectId, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const router = useRouter()
  const health = useWebinarHealth(wid)

  const [loading, setLoading] = useState(true)
  const [webinar, setWebinar] = useState<WebinarData | null>(null)
  const [pitchConfigured, setPitchConfigured] = useState(false)
  const [testDone, setTestDone] = useState(false)
  
  // Advanced integrations form state
  const [integrations, setIntegrations] = useState({
    tracking_head_code: '',
    tracking_body_code: '',
    webhook_url: '',
    whatsapp_api_url: '',
    whatsapp_api_key: '',
    whatsapp_welcome_message: '',
    whatsapp_pitch_message: '',
  })
  const [savingInt, setSavingInt] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [focusParam, setFocusParam] = useState<string | null>(null)

  interface WebhookLog {
    id: string
    event_type: string
    webhook_url: string
    payload: any
    response_status: number
    response_body: string
    created_at: string
  }

  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const focus = params.get('focus')
      if (focus) setFocusParam(focus)

      // Load test done state from localStorage
      setTestDone(localStorage.getItem(`webinar_test_done_${wid}`) === 'true')
    }
  }, [wid])

  useEffect(() => {
    if (loading || !focusParam) return
    const timer = setTimeout(() => {
      const el = document.getElementById(`${focusParam}_input`) || document.getElementById(`${focusParam}_btn`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus?.()
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [loading, focusParam])

  // Load webinar details
  async function loadWebinar() {
    const { data: w } = await supabase.from('webi_webinars').select('*').eq('id', wid).single()
    if (w) {
      setWebinar(w as WebinarData)
      setIntegrations({
        tracking_head_code: w.tracking_head_code || '',
        tracking_body_code: w.tracking_body_code || '',
        webhook_url: w.webhook_url || '',
        whatsapp_api_url: w.whatsapp_api_url || '',
        whatsapp_api_key: w.whatsapp_api_key || '',
        whatsapp_welcome_message: w.whatsapp_welcome_message || '',
        whatsapp_pitch_message: w.whatsapp_pitch_message || '',
      })
    }

    // Verify if pitch button event exists
    const { count } = await supabase
      .from('webi_events')
      .select('id', { count: 'exact', head: true })
      .eq('webinar_id', wid)
      .eq('type', 'pitch_button')

    setPitchConfigured((count ?? 0) > 0)

    // Load Webhook logs
    try {
      const { data: logs } = await supabase
        .from('webi_webhook_logs')
        .select('*')
        .eq('webinar_id', wid)
        .order('created_at', { ascending: false })
        .limit(20)
      setWebhookLogs((logs || []) as WebhookLog[])
    } catch (err) {
      console.error('Failed to load webhook logs:', err)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadWebinar()
  }, [wid])

  // Save integrations
  async function saveIntegrations(e: React.FormEvent) {
    e.preventDefault()
    setSavingInt(true)
    const { error } = await supabase.from('webi_webinars').update({
      tracking_head_code: integrations.tracking_head_code,
      tracking_body_code: integrations.tracking_body_code,
      webhook_url: integrations.webhook_url,
      whatsapp_api_url: integrations.whatsapp_api_url,
      whatsapp_api_key: integrations.whatsapp_api_key,
      whatsapp_welcome_message: integrations.whatsapp_welcome_message,
      whatsapp_pitch_message: integrations.whatsapp_pitch_message,
    }).eq('id', wid)
    setSavingInt(false)
    if (error) toast.error('Erro ao salvar integrações.')
    else toast.success('Integrações salvas!')
  }

  // Toggle webinar status (Publish / Pause)
  async function toggleStatus() {
    if (!webinar) return
    const newStatus = webinar.status === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('webi_webinars').update({ status: newStatus }).eq('id', wid)
    if (!error) {
      setWebinar({ ...webinar, status: newStatus })
      toast.success(newStatus === 'active' ? 'Webinar publicado com sucesso!' : 'Webinar pausado.')
      router.refresh()
    }
  }

  // Copy link helper
  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado!`)
  }

  // Start/Stop Run (API endpoints)
  async function handleRunAction(action: 'start' | 'stop') {
    if (!webinar) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/webinar-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webinar_id: wid,
          action,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro operacional')
      
      toast.success(action === 'start' ? 'Transmissão iniciada!' : 'Transmissão finalizada.')
      loadWebinar()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Trigger dev participant test
  function runTest() {
    if (!webinar) return
    localStorage.setItem(`webinar_test_done_${wid}`, 'true')
    setTestDone(true)
    window.open(`/w/${webinar.slug}?t=1`, '_blank')
  }

  if (loading || !webinar) return <div className="loading-screen"><div className="spinner" /></div>

  const isActive = webinar.status === 'active'
  const isRunning = !!webinar.current_run_id
  const base = `/admin/projects/${projectId}/webinars/${wid}`
  
  // Checklist verification calculations
  const checklist = [
    {
      title: 'Vídeo configurado',
      desc: 'Insira a URL do vídeo de transmissão principal.',
      ok: !!webinar.video_url,
      href: `${base}/video-pitch`,
    },
    {
      title: 'Página de captura pronta',
      desc: 'Insira a headline e subheadline da landing page.',
      ok: !!webinar.landing_headline,
      href: `${base}/registration`,
    },
    {
      title: 'Pitch configurado',
      desc: 'Defina o minuto do pitch para monitoramento de retenção.',
      ok: webinar.analytics_pitch_minute !== null,
      href: `${base}/video-pitch`,
    },
    {
      title: 'Chat configurado',
      desc: 'Garanta mensagens simuladas ou CPM na timeline do chat.',
      ok: health.chat === 'ok',
      href: `${base}/chat`,
    },
    {
      title: 'Oferta configurada',
      desc: 'Insira pelo menos um botão de CTA de vendas na timeline.',
      ok: pitchConfigured,
      href: `${base}/video-pitch`,
    },
    {
      title: 'Execução / Agendamento pronto',
      desc: 'Habilite o modo Evergreen ou inicie uma transmissão.',
      ok: !!webinar.is_evergreen || isRunning,
      href: `${base}/runs`,
    },
    {
      title: 'Teste de participante realizado',
      desc: 'Abra a sala em modo de teste para validar o player e oferta.',
      ok: testDone,
      action: runTest,
      actionLabel: 'Testar agora',
    },
  ]

  const doneCount = checklist.filter(item => item.ok).length
  const totalCount = checklist.length
  const pct = Math.round((doneCount / totalCount) * 100)
  const isIntegrationsActive = !!(integrations.tracking_head_code || integrations.webhook_url || integrations.whatsapp_api_url)

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px' }}>
      <Toaster position="top-right" />

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            ⚡ Painel de Pré-lançamento
            <span className={`badge badge-${webinar.status}`} style={{ fontSize: 12, fontWeight: 600 }}>
              {isActive ? '● Publicado' : webinar.status === 'paused' ? '⏸ Pausado' : '○ Rascunho'}
            </span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Gerencie os acessos, valide o setup e controle as execuções da sala.
          </p>
        </div>
        <button
          id="status_btn"
          onClick={toggleStatus}
          className={isActive ? 'btn btn-ghost' : 'btn btn-primary'}
          style={{ padding: '8px 18px', fontWeight: 700 }}
        >
          {isActive ? '⏸ Pausar Webinar' : '🚀 Publicar Webinar'}
        </button>
      </div>

      {/* ── WIZARD CALLOUT BANNER ── */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>🧙‍♂️ Prefere configurar em etapas?</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Use o nosso Assistente Passo a Passo para criar seu webinar de forma estruturada.</div>
        </div>
        <Link href={`${base}/setup-wizard`} className="btn btn-primary btn-sm" style={{ background: 'var(--brand)' }}>
          Abrir Setup Wizard
        </Link>
      </div>

      {/* ── GRID LAYOUT ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start', marginBottom: 28 }}>
        
        {/* LEFT COLUMN: LINKS & CHECKLIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* ACCESS LINKS CARD */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              🔗 Links de Acesso
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Página de Inscrição</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input
                    type="text"
                    readOnly
                    className="form-input"
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/r/${webinar.slug}`}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => copyToClipboard(`${window.location.origin}/r/${webinar.slug}`, 'Link de inscrição')}
                  >
                    Copiar
                  </button>
                  <a
                    href={`/r/${webinar.slug}`}
                    target="_blank"
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    Abrir
                  </a>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sala do Webinar (Acesso Direto)</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input
                    type="text"
                    readOnly
                    className="form-input"
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/w/${webinar.slug}`}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => copyToClipboard(`${window.location.origin}/w/${webinar.slug}`, 'Link da sala')}
                  >
                    Copiar
                  </button>
                  <a
                    href={`/w/${webinar.slug}`}
                    target="_blank"
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    Abrir
                  </a>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                className="btn btn-primary"
                onClick={runTest}
                style={{ flex: 1, justifyContent: 'center', fontWeight: 700 }}
              >
                👁️ Testar como Participante
              </button>
            </div>
          </div>

          {/* SMART CHECKLIST CARD */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>📋 Checklist Inteligente</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? '#10b981' : '#f59e0b' }}>
                {doneCount} / {totalCount} concluídos ({pct}%)
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {checklist.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${item.ok ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'}`,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: item.ok ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                      color: item.ok ? '#10b981' : '#f59e0b',
                      fontSize: 11, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {item.ok ? '✓' : '!'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
                    </div>
                  </div>

                  {item.ok ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>✓ Concluído</span>
                  ) : item.action ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={item.action}
                      style={{ padding: '4px 10px', fontSize: 11 }}
                    >
                      {item.actionLabel}
                    </button>
                  ) : (
                    <Link
                      href={item.href || '#'}
                      className="btn btn-primary btn-sm"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                    >
                      Configurar agora
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: RUN STATUS & CONTROL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* RUN CONTROL PANEL */}
          {webinar.is_evergreen ? (
            <div className="card" style={{ border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.02)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 6 }}>
                🔄 Transmissão Evergreen
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Este webinar está rodando no modo perpétuo (evergreen). Cada visitante assiste à transmissão de forma cronologicamente simulada individualmente.
              </p>
              <Link href={`${base}/runs`} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                Histórico de Execuções
              </Link>
            </div>
          ) : isRunning ? (
            <div className="card" style={{ border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.02)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                Execução em Andamento
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                A sala está ativa e transmitindo ao vivo para os participantes que acessarem o link.
              </p>
              <button
                className="btn btn-danger"
                style={{ width: '100%', padding: '10px' }}
                disabled={actionLoading}
                onClick={() => handleRunAction('stop')}
              >
                Encerrar Sessão
              </button>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-muted)' }}>
                ⏸ Execução Inativa
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                O webinar está configurado no modo Agendado e não possui nenhuma transmissão ativa no momento.
              </p>
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px' }}
                disabled={actionLoading}
                onClick={() => handleRunAction('start')}
              >
                Iniciar Sessão Agora
              </button>
            </div>
          )}

          {/* QUICK ANALYTICS METRICS */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              📊 Resumo de Métricas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Leads Cadastrados:</span>
                <b style={{ color: 'var(--text-primary)' }}>{health.leadsCount}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Gatilhos / Eventos:</span>
                <b style={{ color: 'var(--text-primary)' }}>{health.eventsCount}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Materiais da Aula:</span>
                <b style={{ color: 'var(--text-primary)' }}>{health.materialsCount}</b>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── ADVANCED INTEGRATIONS FORM ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Section
          icon="🔗"
          title="Integrações Avançadas"
          subtitle="Pixel de rastreamento, Webhook & WhatsApp — configure para automações externas"
          badge={isIntegrationsActive ? { label: '✅ Ativas', ok: true } : undefined}
          defaultOpen={focusParam === 'webhook_url' || focusParam === 'whatsapp_api_url'}
        >
          <form onSubmit={saveIntegrations}>
            {/* PIXELS */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>📊 Pixel & Rastreamento</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Cole seus scripts (FB Pixel, Tag Manager). Use esse público para remarketing e automação de funil.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <FieldLabel>Scripts no &lt;head&gt;</FieldLabel>
                  <textarea
                    id="tracking_head_code_input"
                    className="form-input form-textarea"
                    style={{ width: '100%', minHeight: 100, fontFamily: 'monospace', fontSize: 12 }}
                    value={integrations.tracking_head_code}
                    onChange={e => setIntegrations(f => ({ ...f, tracking_head_code: e.target.value }))}
                    placeholder="<!-- Facebook Pixel Code -->..."
                  />
                </div>
                <div>
                  <FieldLabel>Scripts no final do &lt;body&gt;</FieldLabel>
                  <textarea
                    className="form-input form-textarea"
                    style={{ width: '100%', minHeight: 100, fontFamily: 'monospace', fontSize: 12 }}
                    value={integrations.tracking_body_code}
                    onChange={e => setIntegrations(f => ({ ...f, tracking_body_code: e.target.value }))}
                    placeholder="<!-- Scripts adicionais -->..."
                  />
                </div>
              </div>
            </div>

            {/* WEBHOOK */}
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>🚀 Webhook (Make / n8n / Zapier)</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Recuperação de Vendas: Envia um POST com os dados de leads que clicam na oferta mas não completam a compra.
              </div>
              <FieldLabel hint={`POST enviado com: { event: "pitch_clicked", lead: { name, email, phone } }`}>
                Webhook URL
              </FieldLabel>
              <input
                id="webhook_url_input"
                type="text" className="form-input" style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                value={integrations.webhook_url}
                onChange={e => setIntegrations(f => ({ ...f, webhook_url: e.target.value }))}
                placeholder="https://hook.us1.make.com/... (opcional)"
              />

              {/* WEBHOOK LOGS SECTION */}
              <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>📊 Histórico de Envios (Logs)</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      setLoadingLogs(true)
                      const { data: logs } = await supabase
                        .from('webi_webhook_logs')
                        .select('*')
                        .eq('webinar_id', wid)
                        .order('created_at', { ascending: false })
                        .limit(20)
                      setWebhookLogs((logs || []) as WebhookLog[])
                      setLoadingLogs(false)
                      toast.success('Logs atualizados!')
                    }}
                    disabled={loadingLogs}
                    style={{ fontSize: 11, padding: '4px 8px' }}
                  >
                    {loadingLogs ? '⏳' : '🔄 Atualizar'}
                  </button>
                </div>

                {webhookLogs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                    Nenhum disparo de webhook registrado ainda.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                    {webhookLogs.map(log => {
                      const isSuccess = log.response_status >= 200 && log.response_status < 300
                      const statusColor = isSuccess ? '#10b981' : '#ef4444'
                      const statusBg = isSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
                      
                      return (
                        <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                padding: '2px 6px', borderRadius: 4, background: statusBg, color: statusColor, fontWeight: 700, fontSize: 11
                              }}>
                                {log.response_status || 'ERR'}
                              </span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {log.event_type === 'lead_registered' ? '📥 Cadastro' : '🛒 Clique CTA'}
                              </span>
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {new Date(log.created_at).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: 4 }}>
                            <strong>URL:</strong> {log.webhook_url}
                            <br />
                            <strong>Response:</strong> {log.response_body || '(sem corpo de resposta)'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* WHATSAPP */}
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>💬 WhatsApp Nativo (Evolution / Z-API)</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Envie mensagens automáticas de confirmação e ofertas diretamente para os participantes no WhatsApp.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel>Endpoint URL</FieldLabel>
                  <input
                    id="whatsapp_api_url_input"
                    type="text" className="form-input"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
                    value={integrations.whatsapp_api_url}
                    onChange={e => setIntegrations(f => ({ ...f, whatsapp_api_url: e.target.value }))}
                    placeholder="https://api.evolution.com/message/sendText/{{instance}}"
                  />
                </div>
                <div>
                  <FieldLabel>API Key / Token</FieldLabel>
                  <input
                    type="password" className="form-input"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
                    value={integrations.whatsapp_api_key}
                    onChange={e => setIntegrations(f => ({ ...f, whatsapp_api_key: e.target.value }))}
                    placeholder="Token de autenticação"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FieldLabel hint="Use [NOME] para personalizar.">
                    Mensagem de Boas-vindas (Confirmação)
                  </FieldLabel>
                  <textarea
                    className="form-input form-textarea"
                    style={{ width: '100%', minHeight: 90, fontSize: 13 }}
                    value={integrations.whatsapp_welcome_message}
                    onChange={e => setIntegrations(f => ({ ...f, whatsapp_welcome_message: e.target.value }))}
                    placeholder="Olá [NOME]! Seu acesso está confirmado..."
                  />
                </div>
                <div>
                  <FieldLabel hint="Enviada quando o lead clica na oferta de checkout.">
                    Mensagem de Recuperação (Clique no Pitch)
                  </FieldLabel>
                  <textarea
                    className="form-input form-textarea"
                    style={{ width: '100%', minHeight: 90, fontSize: 13 }}
                    value={integrations.whatsapp_pitch_message}
                    onChange={e => setIntegrations(f => ({ ...f, whatsapp_pitch_message: e.target.value }))}
                    placeholder="Vi que você se interessou pela oferta, [NOME]..."
                  />
                </div>
              </div>
            </div>

            <SectionSaveBtn saving={savingInt} label="Salvar Integrações" />
          </form>
        </Section>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
