'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

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
}

// ── Collapsible section ────────────────────────────────────────────────────────
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
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
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

      {/* Body */}
      {open && (
        <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: 20 }}>{children}</div>
        </div>
      )}
    </div>
  )
}

// ── Mini save button inside a section ─────────────────────────────────────────
function SectionSaveBtn({ saving, label = 'Salvar' }: { saving: boolean; label?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '8px 20px' }}>
        {saving ? '⏳ Salvando...' : `💾 ${label}`}
      </button>
    </div>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ cursor: 'pointer', position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: 99, transition: '0.3s', background: checked ? '#6366f1' : 'var(--border)' }}>
        <span style={{ position: 'absolute', height: 18, width: 18, left: checked ? 22 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
      </span>
    </label>
  )
}

// ── Label helper ──────────────────────────────────────────────────────────────
function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{children}</label>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function WebinarOverviewPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [webinar, setWebinar] = useState<WebinarData | null>(null)

  // ── form fields per-section ─────────────────────────────────────────────
  const [essentials, setEssentials] = useState({ name: '', video_url: '' })
  const [experience, setExperience] = useState({
    waiting_room_enabled: false,
    waiting_delay_seconds: 120,
    custom_background_url: '',
  })
  const [integrations, setIntegrations] = useState({
    tracking_head_code: '',
    tracking_body_code: '',
    webhook_url: '',
    whatsapp_api_url: '',
    whatsapp_api_key: '',
    whatsapp_welcome_message: '',
    whatsapp_pitch_message: '',
  })

  const [savingEss, setSavingEss] = useState(false)
  const [savingExp, setSavingExp] = useState(false)
  const [savingInt, setSavingInt] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: w } = await supabase.from('webi_webinars').select('*').eq('id', wid).single()
      if (w) {
        setWebinar(w as WebinarData)
        setEssentials({ name: w.name || '', video_url: w.video_url || '' })
        setExperience({
          waiting_room_enabled: w.waiting_room_enabled || false,
          waiting_delay_seconds: w.waiting_delay_seconds ?? 120,
          custom_background_url: w.custom_background_url || '',
        })
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
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid])

  // ── Save handlers ────────────────────────────────────────────────────────
  async function saveEssentials(e: React.FormEvent) {
    e.preventDefault()
    setSavingEss(true)
    const { error } = await supabase.from('webi_webinars').update({
      name: essentials.name,
      video_url: essentials.video_url,
    }).eq('id', wid)
    setSavingEss(false)
    if (error) toast.error('Erro ao salvar.')
    else { toast.success('Informações salvas!'); router.refresh() }
  }

  async function saveExperience(e: React.FormEvent) {
    e.preventDefault()
    setSavingExp(true)
    const { error } = await supabase.from('webi_webinars').update({
      waiting_room_enabled: experience.waiting_room_enabled,
      waiting_delay_seconds: experience.waiting_delay_seconds,
      custom_background_url: experience.custom_background_url || null,
    }).eq('id', wid)
    setSavingExp(false)
    if (error) toast.error('Erro ao salvar.')
    else toast.success('Experiência salva!')
  }

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
    if (error) toast.error('Erro ao salvar.')
    else toast.success('Integrações salvas!')
  }

  async function toggleStatus() {
    if (!webinar) return
    const newStatus = webinar.status === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('webi_webinars').update({ status: newStatus }).eq('id', wid)
    if (!error) {
      setWebinar({ ...webinar, status: newStatus })
      toast.success(newStatus === 'active' ? 'Webinar publicado!' : 'Webinar pausado.')
      router.refresh()
    }
  }

  async function uploadImage(file: File): Promise<string | null> {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `webinar-backgrounds/${wid}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('webinar-images')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: pub } = supabase.storage.from('webinar-images').getPublicUrl(path)
      return pub?.publicUrl || null
    } catch {
      return null
    } finally {
      setUploading(false)
    }
  }

  if (loading || !webinar) return <div className="loading-screen"><div className="spinner" /></div>

  const isActive = webinar.status === 'active'
  const hasVideo = !!essentials.video_url
  const hasIntegrations = !!(integrations.tracking_head_code || integrations.webhook_url || integrations.whatsapp_api_url)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            ⚙️ Visão Geral
            <span className={`badge badge-${webinar.status}`} style={{ fontSize: 12, fontWeight: 600 }}>
              {isActive ? '● Ativo' : webinar.status === 'paused' ? '⏸ Pausado' : '○ Rascunho'}
            </span>
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Link público:{' '}
            <a href={`/w/${webinar.slug}`} target="_blank" style={{ color: 'var(--brand)' }}>
              /w/{webinar.slug}
            </a>
          </div>
        </div>
        <button
          onClick={toggleStatus}
          className={isActive ? 'btn btn-ghost' : 'btn btn-primary'}
          style={{ padding: '8px 16px' }}
        >
          {isActive ? '⏸ Pausar Webinar' : '🚀 Publicar Webinar'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 1 — ESSENCIAIS (sempre aberta)                           */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Section
          icon="🎬"
          title="Essenciais"
          subtitle="Nome do webinar e vídeo — configure isso primeiro!"
          badge={{ label: hasVideo ? '✅ Completo' : '⚠️ Pendente', ok: hasVideo }}
          defaultOpen={true}
        >
          <form onSubmit={saveEssentials}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div>
                <FieldLabel>Nome do Webinar</FieldLabel>
                <input
                  type="text" required className="form-input"
                  style={{ width: '100%', maxWidth: 440 }}
                  value={essentials.name}
                  onChange={e => setEssentials(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Masterclass Vendas em Dobro"
                />
              </div>

              <div>
                <FieldLabel hint="Aceita YouTube, Vimeo, VTurb (.js) ou link direto de .mp4. Se colar o script do VTurb, extrairemos a URL automaticamente.">
                  URL do Vídeo
                </FieldLabel>
                <input
                  type="text" className="form-input" style={{ width: '100%' }}
                  value={essentials.video_url}
                  onChange={e => {
                    let val = e.target.value
                    if (val.includes('<script') && val.includes('converteai.net')) {
                      const match = val.match(/s\.src\s*=\s*["']([^"']+)["']/) || val.match(/src=["']([^"']+)["']/)
                      if (match?.[1]) {
                        val = match[1]
                        toast.success('Script detectado! URL extraída com sucesso.')
                      }
                    }
                    setEssentials(f => ({ ...f, video_url: val }))
                  }}
                  placeholder="https://vimeo.com/... ou cole o script VTurb..."
                />
                {essentials.video_url && (
                  <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>✓ Vídeo configurado</div>
                )}
              </div>

            </div>
            <SectionSaveBtn saving={savingEss} label="Salvar Essenciais" />
          </form>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 2 — TEMA VISUAL                                          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Section
          icon="🎨"
          title="Tema Visual"
          subtitle="Aparência da sala — dark, branco ou YouTube"
          defaultOpen={true}
        >
          <ThemeSelector webinarId={wid} currentTheme={webinar.theme || 'dark'} />
        </Section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 3 — EXPERIÊNCIA DO ESPECTADOR (colapsável)               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Section
          icon="⏳"
          title="Experiência do Espectador"
          subtitle="Sala de espera e imagem de fundo personalizados"
          badge={experience.waiting_room_enabled ? { label: '✅ Ativa', ok: true } : undefined}
          defaultOpen={false}
        >
          <form onSubmit={saveExperience}>
            {/* Sala de espera */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🚪 Sala de Espera</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>💡 Estratégia de Retenção:</span>{' '}
                  Em vez de abrir o vídeo imediatamente, os convidados ficam em um lobby com timer, elevando o engajamento e a percepção de evento ao vivo.
                </div>
              </div>
              <Toggle
                checked={experience.waiting_room_enabled}
                onChange={v => setExperience(f => ({ ...f, waiting_room_enabled: v }))}
              />
            </div>

            {experience.waiting_room_enabled && (
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Atraso para iniciar o vídeo</span>
                <input
                  type="number" min={0} max={3600}
                  className="form-input" style={{ width: 90 }}
                  value={experience.waiting_delay_seconds}
                  onChange={e => setExperience(f => ({ ...f, waiting_delay_seconds: +e.target.value }))}
                />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>segundos</span>
              </div>
            )}

            {/* Background */}
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
            <div>
              <FieldLabel hint="Substitui o fundo blur do vídeo por uma imagem. Deixe vazio para usar o padrão (fundo escurecido do vídeo).">
                🖼️ Imagem de Fundo
              </FieldLabel>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text" className="form-input" style={{ flex: 1 }}
                  value={experience.custom_background_url}
                  onChange={e => setExperience(f => ({ ...f, custom_background_url: e.target.value }))}
                  placeholder="https://sua-imagem.com/fundo.jpg"
                  disabled={uploading}
                />
                <input
                  type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const url = await uploadImage(file)
                    if (url) {
                      setExperience(f => ({ ...f, custom_background_url: url }))
                      toast.success('Imagem enviada!')
                    } else {
                      toast.error('Erro ao enviar imagem.')
                    }
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                />
                <button type="button" className="btn btn-ghost" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? '⏳' : '📁 Upload'}
                </button>
              </div>
            </div>

            <SectionSaveBtn saving={savingExp} label="Salvar Experiência" />
          </form>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 4 — INTEGRAÇÕES AVANÇADAS (colapsável, fechada)          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Section
          icon="🔗"
          title="Integrações Avançadas"
          subtitle="Pixel de rastreamento, Webhook & WhatsApp — configure por último"
          badge={hasIntegrations ? { label: '✅ Ativas', ok: true } : undefined}
          defaultOpen={false}
        >
          <form onSubmit={saveIntegrations}>
            {/* PIXELS */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>📊 Pixel & Rastreamento</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>💡 Remarketing Poderoso:</span>{' '}
                Cole seus scripts (FB Pixel, Tag Manager). Use esse público para campanhas de abandono: &quot;assistiu e não comprou&quot; e reduza drasticamente seu custo por aquisição.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <FieldLabel>Scripts no &lt;head&gt;</FieldLabel>
                  <textarea
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
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Automação de Abandono:</span>{' '}
                Quando o lead clica no botão de compra mas não converte, enviamos um POST com os dados dele para você recuperar via automação ou SDR.
              </div>
              <FieldLabel hint={`POST enviado com: { event: "pitch_clicked", lead: { name, email, phone } }`}>
                Webhook URL
              </FieldLabel>
              <input
                type="text" className="form-input" style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                value={integrations.webhook_url}
                onChange={e => setIntegrations(f => ({ ...f, webhook_url: e.target.value }))}
                placeholder="https://hook.us1.make.com/... (opcional)"
              />
            </div>

            {/* WHATSAPP */}
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>💬 WhatsApp Nativo (Evolution / Z-API)</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Envie mensagens automáticas de boas-vindas e recuperação diretamente via API do WhatsApp.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel>Endpoint URL</FieldLabel>
                  <input
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
                  <FieldLabel hint="Use [NOME] para personalizar. Deixe vazio para não enviar.">
                    Mensagem de Boas-vindas (Squeeze)
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
                  <FieldLabel hint="Enviada quando o lead clica no pitch. Deixe vazio para não enviar.">
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
    </div>
  )
}

// ── Theme Selector (unchanged) ────────────────────────────────────────────────
const THEMES = [
  {
    id: 'dark' as const,
    label: 'Dark',
    desc: 'Padrão — escuro profissional',
    preview: { bg: '#0a0a0f', header: '#111118', chat: '#111118', accent: '#6366f1', text: '#f0f0ff', chatText: '#8b8ba7' },
  },
  {
    id: 'light' as const,
    label: 'Branco',
    desc: 'Fundo claro, visual leve',
    preview: { bg: '#f0f0f5', header: '#ffffff', chat: '#ffffff', accent: '#6366f1', text: '#111118', chatText: '#44444f' },
  },
  {
    id: 'youtube' as const,
    label: 'YouTube',
    desc: 'Semelhante a um vídeo público',
    preview: { bg: '#0f0f0f', header: '#0f0f0f', chat: '#212121', accent: '#cc0000', text: '#ffffff', chatText: '#aaaaaa' },
  },
]

function ThemeSelector({ webinarId, currentTheme }: { webinarId: string; currentTheme: 'dark' | 'light' | 'youtube' }) {
  const supabase = createClient()
  const [theme, setTheme] = useState(currentTheme)
  const [saving, setSaving] = useState(false)

  async function applyTheme(t: 'dark' | 'light' | 'youtube') {
    const prev = theme
    setTheme(t)
    setSaving(true)
    const { error } = await supabase.from('webi_webinars').update({ theme: t }).eq('id', webinarId)
    setSaving(false)
    if (error) { setTheme(prev); toast.error('Erro ao salvar tema.') }
    else toast.success('Tema atualizado!')
  }

  return (
    <div>
      {saving && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Salvando tema…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {THEMES.map(t => {
          const p = t.preview
          const active = theme === t.id
          return (
            <button
              key={t.id} type="button" onClick={() => applyTheme(t.id)}
              style={{
                background: 'none',
                border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 12, padding: 0, cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s',
                boxShadow: active ? '0 0 0 3px var(--brand-glow)' : 'none',
                overflow: 'hidden',
              }}
            >
              <div style={{ background: p.bg, padding: 8, display: 'flex', gap: 4, height: 72, position: 'relative' }}>
                <div style={{ flex: 1, background: '#000', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ background: p.header, height: 10, borderBottom: `1px solid rgba(255,255,255,0.08)` }} />
                  <div style={{ flex: 1, background: '#000' }} />
                </div>
                <div style={{ width: 40, background: p.chat, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 3, padding: 4, overflow: 'hidden' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.accent, flexShrink: 0 }} />
                      <div style={{ flex: 1, height: 3, background: p.chatText, borderRadius: 2, opacity: 0.6 }} />
                    </div>
                  ))}
                </div>
                {active && (
                  <div style={{
                    position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%',
                    background: 'var(--brand)', color: '#fff', fontSize: 9, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✓</div>
                )}
              </div>
              <div style={{ padding: '8px 10px', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
