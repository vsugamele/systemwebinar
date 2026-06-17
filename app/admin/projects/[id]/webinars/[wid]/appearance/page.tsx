'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'

interface WebinarData {
  id: string
  name: string
  theme: 'dark' | 'light' | 'youtube'
  video_orientation: 'horizontal' | 'vertical'
  custom_background_url: string | null
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

export default function AppearancePage() {
  const { id: projectId, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form State
  const [webinar, setWebinar] = useState<WebinarData | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light' | 'youtube'>('dark')
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal')
  const [customBg, setCustomBg] = useState('')

  useEffect(() => {
    async function load() {
      const { data: w } = await supabase.from('webi_webinars').select('id, name, theme, video_orientation, custom_background_url').eq('id', wid).single()
      if (w) {
        setWebinar(w as WebinarData)
        setTheme(w.theme || 'dark')
        setOrientation(w.video_orientation || 'horizontal')
        setCustomBg(w.custom_background_url || '')
      }
      setLoading(false)
    }
    load()
  }, [wid, supabase])

  async function uploadImage(file: File): Promise<string | null> {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `webinar-backgrounds/${wid}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage
        .from('webinar-images')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: pub } = supabase.storage.from('webinar-images').getPublicUrl(path)
      return pub?.publicUrl || null
    } catch (e) {
      console.error(e)
      return null
    } finally {
      setUploading(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase
        .from('webi_webinars')
        .update({
          theme,
          video_orientation: orientation,
          custom_background_url: customBg || null,
        })
        .eq('id', wid)

      if (error) throw error
      toast.success('Aparência salva com sucesso!')
      router.refresh()
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao salvar: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !webinar) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 24px' }}>
      <Toaster position="top-right" />

      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link>
            {' / '}{webinar.name}
          </div>
          <h1 className="page-title">🎨 Aparência da Sala</h1>
          <p className="page-subtitle">Configure o tema de cores, orientação e imagem de fundo da sala de transmissão.</p>
        </div>
      </div>

      <form onSubmit={save} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* VIDEO ORIENTATION */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📐 Orientação do Vídeo</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Escolha horizontal (16:9) para vídeos gravados deitados, ou vertical (9:16) para experts gravados em pé no celular.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 460 }}>
            {[
              { id: 'horizontal' as const, label: '📺 Horizontal', desc: '16:9 — padrão', ratio: '16 / 9' },
              { id: 'vertical' as const, label: '📱 Vertical', desc: '9:16 — expert em pé', ratio: '9 / 16' },
            ].map(o => {
              const active = orientation === o.id
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOrientation(o.id)}
                  style={{
                    background: 'none',
                    border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: 12, padding: 0, cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s',
                    boxShadow: active ? '0 0 0 3px var(--brand-glow)' : 'none',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    background: '#0a0a0f', padding: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 80, position: 'relative',
                  }}>
                    <div style={{
                      aspectRatio: o.ratio,
                      height: o.id === 'vertical' ? '90%' : 'auto',
                      width: o.id === 'horizontal' ? '80%' : 'auto',
                      background: '#1a1a2e',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24,
                    }}>
                      {o.id === 'horizontal' ? '🖥️' : '🧑'}
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '10px 0' }} />

        {/* THEME SELECTOR */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🎨 Tema de Cor</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Selecione a identidade visual da sala. O tema escuro é ideal para elevar o tom de exclusividade.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {THEMES.map(t => {
              const p = t.preview
              const active = theme === t.id
              return (
                <button
                  key={t.id} type="button" onClick={() => setTheme(t.id)}
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

        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '10px 0' }} />

        {/* CUSTOM BACKGROUND */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🖼️ Imagem de Fundo (Custom Background)</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Substitua o fundo escurecido da sala de aula e sala de espera por uma imagem personalizada.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1 }}
              value={customBg}
              onChange={e => setCustomBg(e.target.value)}
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
                  setCustomBg(url)
                  toast.success('Imagem enviada com sucesso!')
                } else {
                  toast.error('Erro ao enviar imagem.')
                }
                e.target.value = ''
              }}
            />
            <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? '⏳' : '📁 Upload'}
            </button>
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '10px 24px', fontWeight: 600 }}>
            {saving ? '⏳ Salvando...' : '💾 Salvar Aparência'}
          </button>
        </div>
      </form>
    </div>
  )
}
