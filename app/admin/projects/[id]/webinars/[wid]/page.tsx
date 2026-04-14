'use client'

import { useEffect, useState, useRef } from 'react'
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

export default function WebinarOverviewPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [webinar, setWebinar] = useState<WebinarData | null>(null)

  const [form, setForm] = useState({
    name: '',
    video_url: '',
    waiting_room_enabled: false,
    waiting_delay_seconds: 120,
    tracking_head_code: '',
    tracking_body_code: '',
    webhook_url: '',
    whatsapp_api_url: '',
    whatsapp_api_key: '',
    whatsapp_welcome_message: '',
    whatsapp_pitch_message: '',
    custom_background_url: '',
  })

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    async function load() {
      const { data: w } = await supabase.from('webi_webinars').select('*').eq('id', wid).single()
      if (w) {
        setWebinar(w as WebinarData)
        setForm({
          name: w.name || '',
          video_url: w.video_url || '',
          waiting_room_enabled: w.waiting_room_enabled || false,
          waiting_delay_seconds: w.waiting_delay_seconds ?? 120,
          tracking_head_code: w.tracking_head_code || '',
          tracking_body_code: w.tracking_body_code || '',
          webhook_url: w.webhook_url || '',
          whatsapp_api_url: w.whatsapp_api_url || '',
          whatsapp_api_key: w.whatsapp_api_key || '',
          whatsapp_welcome_message: w.whatsapp_welcome_message || '',
          whatsapp_pitch_message: w.whatsapp_pitch_message || '',
          custom_background_url: w.custom_background_url || '',
        })
      }
      setLoading(false)
    }
    load()
  }, [wid])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('webi_webinars').update({
      name: form.name,
      video_url: form.video_url,
      waiting_room_enabled: form.waiting_room_enabled,
      waiting_delay_seconds: form.waiting_delay_seconds,
      tracking_head_code: form.tracking_head_code,
      tracking_body_code: form.tracking_body_code,
      webhook_url: form.webhook_url,
      whatsapp_api_url: form.whatsapp_api_url,
      whatsapp_api_key: form.whatsapp_api_key,
      whatsapp_welcome_message: form.whatsapp_welcome_message,
      whatsapp_pitch_message: form.whatsapp_pitch_message,
      custom_background_url: form.custom_background_url || null,
    }).eq('id', wid)
    
    setSaving(false)
    
    if (error) {
      toast.error('Erro ao salvar as configurações.')
    } else {
      toast.success('Configurações salvas!')
      // Update local state to reflect new saved values
      setWebinar(w => w ? { ...w, name: form.name, video_url: form.video_url, waiting_room_enabled: form.waiting_room_enabled, waiting_delay_seconds: form.waiting_delay_seconds, tracking_head_code: form.tracking_head_code, tracking_body_code: form.tracking_body_code, webhook_url: form.webhook_url, whatsapp_api_url: form.whatsapp_api_url, whatsapp_api_key: form.whatsapp_api_key, whatsapp_welcome_message: form.whatsapp_welcome_message, whatsapp_pitch_message: form.whatsapp_pitch_message, custom_background_url: form.custom_background_url } : null)
      router.refresh()
    }
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

  if (loading || !webinar) return <div className="loading-screen"><div className="spinner" /></div>

  const isActive = webinar.status === 'active'

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 24px' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            ⚙️ Visão Geral
            <span className={`badge badge-${webinar.status}`} style={{ fontSize: 12, fontWeight: 600 }}>
              {isActive ? '● Ativo' : webinar.status === 'paused' ? '⏸ Pausado' : '○ Rascunho'}
            </span>
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Link público: <a href={`/w/${webinar.slug}`} target="_blank" className="text-brand hover:underline">/w/{webinar.slug}</a>
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

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* INFORMAÇÕES BÁSICAS */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--brand)' }}>1.</span> Informações Básicas
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Nome do Webinar</label>
              <input
                type="text"
                required
                className="form-input"
                style={{ width: '100%', maxWidth: 400 }}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Masterclass Vendas em Dobro"
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>URL do Vídeo Mestre</label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%' }}
                value={form.video_url}
                onChange={e => setForm({ ...form, video_url: e.target.value })}
                placeholder="Ex: https://vimeo.com/... ou script VTurb..."
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Insira o link do YouTube, Vimeo, VTurb ou .mp4 direto.
              </div>
            </div>
          </div>
        </div>

        {/* SALA DE ESPERA */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
               <span style={{ color: 'var(--brand)' }}>2.</span> Sala de Espera
             </h2>
             <label style={{ cursor: 'pointer', position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
              <input
                type="checkbox"
                checked={form.waiting_room_enabled}
                onChange={e => setForm(f => ({ ...f, waiting_room_enabled: e.target.checked }))}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', inset: 0, borderRadius: 99, transition: '0.3s',
                background: form.waiting_room_enabled ? '#6366f1' : 'var(--border)',
              }}>
                <span style={{
                  position: 'absolute', height: 18, width: 18,
                  left: form.waiting_room_enabled ? 22 : 3, bottom: 3,
                  background: 'white', borderRadius: '50%', transition: '0.3s',
                }} />
              </span>
            </label>
          </div>
          
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: form.waiting_room_enabled ? 16 : 0 }}>
            Retém os convidados em uma tela de timer antes de redirecionar para a sala do vídeo.
          </div>

          {form.waiting_room_enabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)', padding: 16, borderRadius: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Tempo de atraso (segundos)</span>
              <input
                type="number" min={0} max={3600}
                className="form-input"
                style={{ width: 100 }}
                value={form.waiting_delay_seconds}
                onChange={e => setForm({ ...form, waiting_delay_seconds: +e.target.value })}
              />
            </div>
          )}
        </div>

        {/* TRACKING E PIXELS */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--brand)' }}>3.</span> Pixel e Tracking
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Insira scripts de rastreamento (Facebook Pixel, Google Analytics, etc.) para monitorar acessos e conversões no webinar.
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Scripts no &lt;head&gt;</label>
              <textarea
                className="form-input form-textarea"
                style={{ width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
                value={form.tracking_head_code}
                onChange={e => setForm({ ...form, tracking_head_code: e.target.value })}
                placeholder="<!-- Facebook Pixel Code -->..."
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Scripts no final do &lt;body&gt;</label>
              <textarea
                className="form-input form-textarea"
                style={{ width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
                value={form.tracking_body_code}
                onChange={e => setForm({ ...form, tracking_body_code: e.target.value })}
                placeholder="<!-- Scripts adicionais -->..."
              />
            </div>
          </div>
        </div>

        {/* INTEGRAÇÕES & WEBHOOKS */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--brand)' }}>4.</span> Integrações (Webhook)
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Dispare ações externas assim que ocorrerem eventos de alta intenção, como clicar no botão do Pitch.
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            {/* MAKE / N8N Webhook */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Webhook URL (Disparado em Cliques no Pitch)</label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                value={form.webhook_url}
                onChange={e => setForm({ ...form, webhook_url: e.target.value })}
                placeholder="https://hook.us1.make.com/... (opcional)"
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Envio POST com a Payload: <code>{`{ event: "pitch_clicked", lead: { name, email, phone } }`}</code>
              </div>
            </div>

            <hr style={{ border: '0', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

            {/* WhatsApp NATIVE */}
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--brand)' }}>
                 Integração WhatsApp Nativa (Evolution / Z-API)
              </label>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Endpoint URL (Envio de Texto)</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                    value={form.whatsapp_api_url}
                    onChange={e => setForm({ ...form, whatsapp_api_url: e.target.value })}
                    placeholder="https://sua-api.com/message/sendText/{{instance}}"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>API Key ou Token (Header apikey)</label>
                  <input
                    type="password"
                    className="form-input"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                    value={form.whatsapp_api_key}
                    onChange={e => setForm({ ...form, whatsapp_api_key: e.target.value })}
                    placeholder="Token de autenticação"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Mensagem de Boas-vindas (Squeeze Page)</label>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Use <code>[NOME]</code> para personalizar. <br/>Deixe em branco para não enviar.</div>
                  <textarea
                    className="form-input form-textarea"
                    style={{ width: '100%', minHeight: 100, fontSize: 13 }}
                    value={form.whatsapp_welcome_message}
                    onChange={e => setForm({ ...form, whatsapp_welcome_message: e.target.value })}
                    placeholder="Olá [NOME]! Seu acesso está confirmado..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Mensagem Recuperação (Clique no Pitch)</label>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Enviada quando ele(a) clica no botão de compra.<br/>Deixe em branco para não enviar.</div>
                  <textarea
                    className="form-input form-textarea"
                    style={{ width: '100%', minHeight: 100, fontSize: 13 }}
                    value={form.whatsapp_pitch_message}
                    onChange={e => setForm({ ...form, whatsapp_pitch_message: e.target.value })}
                    placeholder="Vi que você se interessou pela oferta, [NOME]..."
                  />
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* TEMA */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--brand)' }}>4.</span> Tema Visual
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            A aparência da sala (sidebar do chat, cabeçalho e cores) que seu público vai experimentar.
          </div>
          <ThemeSelector webinarId={wid} currentTheme={webinar.theme || 'dark'} />

          <hr style={{ border: '0', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🖼️ Imagem de Fundo (Custom Background)</h3>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Substitua o fundo embaçado (blur do vídeo) por uma imagem personalizada. Se deixar vazio, usaremos o padrão.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1 }}
              value={form.custom_background_url}
              onChange={e => setForm({ ...form, custom_background_url: e.target.value })}
              placeholder="https://sua-imagem.com/fundo.jpg"
              disabled={uploading}
            />
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const url = await uploadImage(file)
                if (url) {
                  setForm(f => ({ ...f, custom_background_url: url }))
                  toast.success('Imagem enviada com sucesso!')
                } else {
                  toast.error('Erro ao enviar imagem.')
                }
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            />
            <button 
              type="button"
              className="btn btn-ghost"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? '⏳ Enviando...' : '📁 Upload'}
            </button>
          </div>
        </div>

        {/* SAVE BOTTOM ROW */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? '⏳ Salvando...' : '💾 Salvar Alterações'}
          </button>
        </div>

      </form>
    </div>
  )
}

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
    if (error) {
      setTheme(prev)
      toast.error('Erro ao salvar tema.')
    } else {
      toast.success('Tema atualizado!')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      {THEMES.map(t => {
        const p = t.preview
        const active = theme === t.id
        return (
          <button
            key={t.id}
            type="button"
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
              <div style={{ flex: 1, background: '#000', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ background: p.header, height: 10, borderBottom: `1px solid rgba(255,255,255,0.08)` }} />
                <div style={{ flex: 1, background: '#000' }} />
              </div>
              <div style={{ width: 40, background: p.chat, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 3, padding: 4, overflow: 'hidden' }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.accent, flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 3, background: p.chatText, borderRadius: 2, opacity: 0.6 }} />
                  </div>
                ))}
              </div>
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
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
