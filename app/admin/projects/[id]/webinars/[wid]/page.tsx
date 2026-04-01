'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface WebinarData {
  id: string
  name: string
  slug: string
  status: string
  video_url: string | null
  chat_cpm: number
  chat_names: string[] | null
  waiting_room_enabled: boolean
  ai_enabled: boolean
  session_started_at: string | null
  form_fields: unknown[]
  theme?: 'dark' | 'light' | 'youtube'
}

interface Counts {
  events: number
  materials: number
  emailTemplates: number
}

type AreaStatus = 'done' | 'warn' | 'empty'

interface Area {
  id: string
  icon: string
  label: string
  description: string
  href: string
  status: AreaStatus
  hint: string
  priority: 'required' | 'recommended' | 'optional'
}

function statusDot(s: AreaStatus) {
  if (s === 'done') return { bg: '#22c55e', label: 'Configurado' }
  if (s === 'warn') return { bg: '#f59e0b', label: 'Incompleto' }
  return { bg: 'var(--border)', label: 'Não configurado' }
}

export default function WebinarHubPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [webinar, setWebinar] = useState<WebinarData | null>(null)
  const [counts, setCounts] = useState<Counts>({ events: 0, materials: 0, emailTemplates: 0 })
  const [publishing, setPublishing] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishSaved, setPublishSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: w }, { count: evCount }, { count: matCount }, { count: emailCount }] =
        await Promise.all([
          supabase.from('webi_webinars').select('*').eq('id', wid).single(),
          supabase.from('webi_events').select('id', { count: 'exact', head: true }).eq('webinar_id', wid),
          supabase.from('webi_materials').select('id', { count: 'exact', head: true }).eq('webinar_id', wid),
          supabase.from('webi_email_templates').select('id', { count: 'exact', head: true }).eq('webinar_id', wid).eq('enabled', true),
        ])
      if (w) setWebinar(w as WebinarData)
      setCounts({ events: evCount || 0, materials: matCount || 0, emailTemplates: emailCount || 0 })
      setLoading(false)
    }
    load()
  }, [wid])

  async function publishWebinar() {
    setPublishing(true)
    await supabase.from('webi_webinars').update({ status: 'active' }).eq('id', wid)
    setWebinar(w => w ? { ...w, status: 'active' } : w)
    setPublishing(false)
    setPublishSaved(true)
    setTimeout(() => { setShowPublishModal(false); setPublishSaved(false) }, 1200)
  }

  async function pauseWebinar() {
    await supabase.from('webi_webinars').update({ status: 'paused' }).eq('id', wid)
    setWebinar(w => w ? { ...w, status: 'paused' } : w)
  }

  if (loading || !webinar) return <div className="loading-screen"><div className="spinner" /></div>

  const isActive = webinar.status === 'active'
  const isPaused = webinar.status === 'paused'

  // Completeness checks
  const areas: Area[] = [
    {
      id: 'video',
      icon: '🎬',
      label: 'Vídeo',
      description: 'URL do vídeo MP4 ou YouTube',
      href: `/admin/projects/${id}/webinars/${wid}/events`,
      status: webinar.video_url ? 'done' : 'empty',
      hint: webinar.video_url ? 'Vídeo configurado' : 'Sem vídeo — edite o webinar',
      priority: 'required',
    },
    {
      id: 'events',
      icon: '⚡',
      label: 'Eventos',
      description: 'Timeline de mensagens, popups e pitch',
      href: `/admin/projects/${id}/webinars/${wid}/events`,
      status: counts.events >= 3 ? 'done' : counts.events > 0 ? 'warn' : 'empty',
      hint: counts.events === 0 ? 'Nenhum evento criado' : `${counts.events} evento${counts.events > 1 ? 's' : ''} na timeline`,
      priority: 'required',
    },
    {
      id: 'chat',
      icon: '💬',
      label: 'Chat',
      description: 'Simulação de mensagens e participantes',
      href: `/admin/projects/${id}/webinars/${wid}/chat`,
      status: (webinar.chat_cpm ?? 0) > 0 || (webinar.chat_names?.length ?? 0) > 0 ? 'done' : 'warn',
      hint: (webinar.chat_cpm ?? 0) > 0 ? `${webinar.chat_cpm} msg/min simuladas` : 'CPM = 0 — chat sem simulação',
      priority: 'recommended',
    },
    {
      id: 'waiting-room',
      icon: '⏳',
      label: 'Sala de Espera',
      description: 'Timer antes de entrar na sala',
      href: `/admin/projects/${id}/webinars/${wid}/waiting-room`,
      status: webinar.waiting_room_enabled ? 'done' : 'warn',
      hint: webinar.waiting_room_enabled ? 'Sala de espera ativa' : 'Desativada — participante entra direto',
      priority: 'recommended',
    },
    {
      id: 'live',
      icon: '📡',
      label: 'Ao Vivo',
      description: 'Curva de audiência e relógio da sessão',
      href: `/admin/projects/${id}/webinars/${wid}/live`,
      status: webinar.session_started_at ? 'done' : 'warn',
      hint: webinar.session_started_at ? 'Sessão iniciada' : 'Sem sessão — viewers não sincronizados',
      priority: 'recommended',
    },
    {
      id: 'emails',
      icon: '✉️',
      label: 'E-mails',
      description: 'Sequência automática de lembretes',
      href: `/admin/emails`,
      status: counts.emailTemplates > 0 ? 'done' : 'warn',
      hint: counts.emailTemplates > 0 ? `${counts.emailTemplates} templates ativos` : 'Nenhum e-mail ativo',
      priority: 'recommended',
    },
    {
      id: 'materials',
      icon: '📂',
      label: 'Materiais',
      description: 'PDFs e recursos liberados durante a live',
      href: `/admin/projects/${id}/webinars/${wid}/materials`,
      status: counts.materials > 0 ? 'done' : 'empty',
      hint: counts.materials > 0 ? `${counts.materials} material(is)` : 'Sem materiais',
      priority: 'optional',
    },
    {
      id: 'ai-config',
      icon: '🤖',
      label: 'IA no Chat',
      description: 'Assistente que responde perguntas',
      href: `/admin/projects/${id}/webinars/${wid}/ai-config`,
      status: webinar.ai_enabled ? 'done' : 'empty',
      hint: webinar.ai_enabled ? 'IA ativada' : 'Desativada',
      priority: 'optional',
    },
    {
      id: 'quiz',
      icon: '📝',
      label: 'Quiz',
      description: 'Perguntas interativas',
      href: `/admin/projects/${id}/webinars/${wid}/quiz`,
      status: 'empty',
      hint: 'Opcional',
      priority: 'optional',
    },
  ]

  const required = areas.filter(a => a.priority === 'required')
  const recommended = areas.filter(a => a.priority === 'recommended')
  const optional = areas.filter(a => a.priority === 'optional')

  const doneCount = areas.filter(a => a.status === 'done').length
  const totalCount = areas.length
  const readyToPublish = required.every(a => a.status === 'done')

  // Publish modal checklist
  const publishChecks = [
    { label: 'Vídeo configurado', ok: !!webinar.video_url },
    { label: 'Pelo menos 1 evento na timeline', ok: counts.events > 0 },
    { label: 'Chat com participantes fictícios', ok: (webinar.chat_names?.length ?? 0) > 0 },
    { label: 'E-mail de confirmação ativo', ok: counts.emailTemplates > 0 },
  ]

  return (
    <>
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>
              ← Webinars
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="page-title" style={{ margin: 0 }}>{webinar.name}</h1>
            <span className={`badge badge-${webinar.status}`} style={{ fontSize: 12 }}>
              {isActive ? '● Ativo' : isPaused ? '⏸ Pausado' : '○ Rascunho'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            /w/<strong>{webinar.slug}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isActive && (
            <button className="btn btn-ghost btn-sm" onClick={pauseWebinar}>
              ⏸ Pausar
            </button>
          )}
          {!isActive && (
            <button
              className="btn btn-primary"
              onClick={() => setShowPublishModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              🚀 Publicar
            </button>
          )}
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* PROGRESS BAR */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Setup do webinar</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{doneCount}/{totalCount} áreas configuradas</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(doneCount / totalCount) * 100}%`,
              background: 'linear-gradient(90deg, #6366f1, #818cf8)',
              borderRadius: 99, transition: 'width 0.4s ease',
            }} />
          </div>
          {!readyToPublish && (
            <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8 }}>
              ⚠️ Configure as áreas obrigatórias antes de publicar
            </div>
          )}
          {readyToPublish && !isActive && (
            <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 8 }}>
              ✅ Pronto para publicar
            </div>
          )}
        </div>

        {/* QUICK ACTIONS */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href={`/admin/projects/${id}/webinars/${wid}/live`}
            className="btn btn-primary" style={{ flex: 1, minWidth: 160, justifyContent: 'center' }}>
            🎬 Ao Vivo
          </Link>
          <Link href={`/admin/projects/${id}/webinars/${wid}/events`}
            className="btn btn-secondary" style={{ flex: 1, minWidth: 160, justifyContent: 'center' }}>
            ⚡ Eventos
          </Link>
          <a href={`/w/${webinar.slug}?test=1`} target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost" style={{ flex: 1, minWidth: 160, justifyContent: 'center' }}>
            👁 Preview sala
          </a>
          <Link href={`/admin/projects/${id}/analytics`}
            className="btn btn-ghost" style={{ flex: 1, minWidth: 160, justifyContent: 'center' }}>
            📊 Analytics
          </Link>
        </div>

        {/* THEME SELECTOR */}
        <ThemeSelector webinarId={wid} currentTheme={webinar.theme || 'dark'} />

        {/* REQUIRED */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Obrigatório
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {required.map(a => <AreaCard key={a.id} area={a} />)}
          </div>
        </section>

        {/* RECOMMENDED */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Recomendado
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {recommended.map(a => <AreaCard key={a.id} area={a} />)}
          </div>
        </section>

        {/* OPTIONAL */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Opcional
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {optional.map(a => <AreaCard key={a.id} area={a} />)}
          </div>
        </section>
      </div>

      {/* PUBLISH MODAL */}
      {showPublishModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPublishModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">🚀 Publicar Webinar</h2>
              <button className="modal-close" onClick={() => setShowPublishModal(false)}>✕</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Ao publicar, o webinar fica acessível para quem tiver o link de registro.
                Revise os itens abaixo antes de confirmar.
              </p>

              {/* Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {publishChecks.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: c.ok ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.1)',
                      border: `1px solid ${c.ok ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.3)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11,
                    }}>
                      {c.ok ? '✓' : '!'}
                    </div>
                    <span style={{ fontSize: 13, color: c.ok ? 'var(--text-secondary)' : 'var(--warning)' }}>
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Preview link */}
              <div style={{
                background: 'var(--bg)', borderRadius: 10, padding: '10px 14px',
                fontSize: 12, color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <span>Revise a sala antes de publicar</span>
                <a href={`/w/${webinar.slug}?test=1`} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
                  👁 Abrir preview →
                </a>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowPublishModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={publishWebinar}
                  disabled={publishing}
                  style={{ minWidth: 140 }}
                >
                  {publishSaved ? '✅ Publicado!' : publishing ? '⏳ Publicando...' : '🚀 Confirmar Publicação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const THEMES = [
  {
    id: 'dark' as const,
    label: 'Dark',
    desc: 'Padrão — fundo escuro profissional',
    preview: { bg: '#0a0a0f', header: '#111118', chat: '#111118', accent: '#6366f1', text: '#f0f0ff', chatText: '#8b8ba7' },
  },
  {
    id: 'light' as const,
    label: 'Branco',
    desc: 'Fundo claro, texto escuro',
    preview: { bg: '#f0f0f5', header: '#ffffff', chat: '#ffffff', accent: '#6366f1', text: '#111118', chatText: '#44444f' },
  },
  {
    id: 'youtube' as const,
    label: 'YouTube',
    desc: 'Clone do YouTube Live',
    preview: { bg: '#0f0f0f', header: '#0f0f0f', chat: '#212121', accent: '#cc0000', text: '#ffffff', chatText: '#aaaaaa' },
  },
]

function ThemeSelector({ webinarId, currentTheme }: { webinarId: string; currentTheme: 'dark' | 'light' | 'youtube' }) {
  const supabase = createClient()
  const [theme, setTheme] = useState(currentTheme)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function applyTheme(t: 'dark' | 'light' | 'youtube') {
    setTheme(t)
    setSaving(true)
    await supabase.from('webi_webinars').update({ theme: t }).eq('id', webinarId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>🎨 Tema da Sala</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Aparência da sala de webinar para os participantes</div>
        </div>
        {saving && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Salvando...</span>}
        {saved && <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Salvo</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {THEMES.map(t => {
          const p = t.preview
          const active = theme === t.id
          return (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              style={{
                background: 'none', border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 12, padding: 0, cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s',
                boxShadow: active ? '0 0 0 3px var(--brand-glow)' : 'none',
                overflow: 'hidden',
              }}
            >
              {/* Mini preview */}
              <div style={{ background: p.bg, padding: 8, display: 'flex', gap: 4, height: 72, position: 'relative' }}>
                {/* Video area */}
                <div style={{ flex: 1, background: '#000', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ background: p.header, height: 10, borderBottom: `1px solid rgba(255,255,255,0.08)` }} />
                  <div style={{ flex: 1, background: '#000' }} />
                </div>
                {/* Chat sidebar */}
                <div style={{ width: 40, background: p.chat, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 3, padding: 4, overflow: 'hidden' }}>
                  {[1,2,3].map(i => (
                    <div key={i} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.accent, flexShrink: 0 }} />
                      <div style={{ flex: 1, height: 3, background: p.chatText, borderRadius: 2, opacity: 0.6 }} />
                    </div>
                  ))}
                </div>
                {/* Active checkmark */}
                {active && (
                  <div style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 16, height: 16, borderRadius: '50%',
                    background: 'var(--brand)', color: '#fff',
                    fontSize: 9, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✓</div>
                )}
              </div>
              {/* Label */}
              <div style={{ padding: '8px 10px', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 1 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AreaCard({ area }: { area: Area }) {
  const dot = statusDot(area.status)
  return (
    <Link
      href={area.href}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '14px 16px',
        textDecoration: 'none', transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.borderColor = 'rgba(99,102,241,0.4)'
        el.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.borderColor = 'var(--border)'
        el.style.background = 'var(--bg-card)'
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: 'var(--bg-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>
        {area.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
          {area.label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {area.hint}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dot.bg,
          boxShadow: area.status === 'done' ? `0 0 6px ${dot.bg}` : 'none',
        }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→</span>
      </div>
    </Link>
  )
}
