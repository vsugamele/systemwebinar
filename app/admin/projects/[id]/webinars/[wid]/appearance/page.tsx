'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'

interface WebinarData {
  id: string
  name: string
  theme: RoomTheme
  video_orientation: VideoOrientation
  custom_background_url: string | null
  yt_subscriber_count: string | null
  yt_channel_avatar_url: string | null
  yt_comments_enabled: boolean
  language: string
  fake_viewers_start?: number | null
  fake_viewers_peak?: number | null
  fake_viewers_end?: number | null
  fake_viewers_peak_at_pct?: number | null
}

type RoomTheme = 'dark' | 'light' | 'youtube' | 'clear_vsl'
type VideoOrientation = 'horizontal' | 'vertical'

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
  {
    id: 'clear_vsl' as const,
    label: 'Clear VSL',
    desc: 'Branco + YouTube, estilo Cardio Clear/VSL',
    preview: { bg: '#ffffff', header: '#ffffff', chat: '#f7f7f7', accent: '#cc0000', text: '#0f0f0f', chatText: '#606060' },
  },
]

const ROOM_TEMPLATES = [
  {
    id: 'pt-standard',
    label: 'Webinar PT — Padrao',
    desc: 'Ambiente em portugues com visual escuro e audiencia moderada.',
    settings: {
      theme: 'dark' as RoomTheme,
      orientation: 'horizontal' as VideoOrientation,
      language: 'pt',
      fakeViewersStart: 75,
      fakeViewersPeak: 320,
      fakeViewersEnd: 90,
      fakeViewersPeakAtPct: 30,
      ytCommentsEnabled: true,
    },
  },
  {
    id: 'en-clear-vsl',
    label: 'English Clear/VSL',
    desc: 'White YouTube-style VSL room inspired by Cardio Clear, with the participant interface in English.',
    settings: {
      theme: 'clear_vsl' as RoomTheme,
      orientation: 'horizontal' as VideoOrientation,
      language: 'en',
      fakeViewersStart: 63,
      fakeViewersPeak: 487,
      fakeViewersEnd: 118,
      fakeViewersPeakAtPct: 58,
      ytCommentsEnabled: true,
    },
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
  const [theme, setTheme] = useState<RoomTheme>('dark')
  const [orientation, setOrientation] = useState<VideoOrientation>('horizontal')
  const [customBg, setCustomBg] = useState('')
  const [ytSubCount, setYtSubCount] = useState('')
  const [ytAvatar, setYtAvatar] = useState('')
  const [ytCommentsEnabled, setYtCommentsEnabled] = useState(true)
  const [language, setLanguage] = useState('pt')
  const [fakeViewersStart, setFakeViewersStart] = useState<number>(50)
  const [fakeViewersPeak, setFakeViewersPeak] = useState<number>(500)
  const [fakeViewersEnd, setFakeViewersEnd] = useState<number>(150)
  const [fakeViewersPeakAtPct, setFakeViewersPeakAtPct] = useState<number>(30)
  const isEnglish = language === 'en'
  const isYouTubeTheme = theme === 'youtube' || theme === 'clear_vsl'

  function applyRoomTemplate(template: (typeof ROOM_TEMPLATES)[number]) {
    const settings = template.settings
    setTheme(settings.theme)
    setOrientation(settings.orientation)
    setLanguage(settings.language)
    setFakeViewersStart(settings.fakeViewersStart)
    setFakeViewersPeak(settings.fakeViewersPeak)
    setFakeViewersEnd(settings.fakeViewersEnd)
    setFakeViewersPeakAtPct(settings.fakeViewersPeakAtPct)
    setYtCommentsEnabled(settings.ytCommentsEnabled)
    toast.success(isEnglish ? `Template "${template.label}" applied. Save to persist.` : `Template "${template.label}" aplicado. Salve para gravar.`)
  }

  useEffect(() => {
    async function load() {
      const { data: w } = await supabase
        .from('webi_webinars')
        .select('id, name, theme, video_orientation, custom_background_url, yt_subscriber_count, yt_channel_avatar_url, yt_comments_enabled, language, fake_viewers_start, fake_viewers_peak, fake_viewers_end, fake_viewers_peak_at_pct')
        .eq('id', wid)
        .single()
      if (w) {
        setWebinar(w as WebinarData)
        setTheme(w.theme || 'dark')
        setOrientation(w.video_orientation || 'horizontal')
        setCustomBg(w.custom_background_url || '')
        setYtSubCount(w.yt_subscriber_count || '')
        setYtAvatar(w.yt_channel_avatar_url || '')
        setYtCommentsEnabled(w.yt_comments_enabled !== false)
        setLanguage(w.language || 'pt')
        setFakeViewersStart(w.fake_viewers_start ?? 50)
        setFakeViewersPeak(w.fake_viewers_peak ?? 500)
        setFakeViewersEnd(w.fake_viewers_end ?? 150)
        setFakeViewersPeakAtPct(w.fake_viewers_peak_at_pct ?? 30)
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
          yt_subscriber_count: ytSubCount || null,
          yt_channel_avatar_url: ytAvatar || null,
          yt_comments_enabled: ytCommentsEnabled,
          language,
          fake_viewers_start: fakeViewersStart,
          fake_viewers_peak: fakeViewersPeak,
          fake_viewers_end: fakeViewersEnd,
          fake_viewers_peak_at_pct: fakeViewersPeakAtPct,
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
          <h1 className="page-title">🎨 {isEnglish ? 'Room Appearance' : 'Aparência da Sala'}</h1>
          <p className="page-subtitle">
            {isEnglish ? 'Configure the color theme, orientation, and background image for the attendee room.' : 'Configure o tema de cores, orientação e imagem de fundo da sala de transmissão.'}
          </p>
        </div>
      </div>

      <form onSubmit={save} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* ROOM TEMPLATE PRESETS */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🧩 {isEnglish ? 'Room Template' : 'Template de Ambiente'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {isEnglish ? 'Apply a coherent set of language, theme, orientation, and audience curve settings.' : 'Aplique rapidamente um conjunto coerente de idioma, tema, orientacao e curva de audiencia.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {ROOM_TEMPLATES.map(template => {
              const active =
                theme === template.settings.theme &&
                orientation === template.settings.orientation &&
                language === template.settings.language &&
                fakeViewersStart === template.settings.fakeViewersStart &&
                fakeViewersPeak === template.settings.fakeViewersPeak &&
                fakeViewersEnd === template.settings.fakeViewersEnd &&
                fakeViewersPeakAtPct === template.settings.fakeViewersPeakAtPct

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyRoomTemplate(template)}
                  style={{
                    background: active ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-elevated)',
                    border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                    boxShadow: active ? '0 0 0 3px var(--brand-glow)' : 'none',
                    position: 'relative',
                  }}
                >
                  {active && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%',
                      background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✓</div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                    {template.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 10 }}>
                    {template.desc}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                    <span style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '3px 7px' }}>{template.settings.language.toUpperCase()}</span>
                    <span style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '3px 7px' }}>{template.settings.theme}</span>
                    <span style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '3px 7px' }}>{template.settings.orientation}</span>
                    <span style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '3px 7px' }}>pico {template.settings.fakeViewersPeak}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '10px 0' }} />
        
        {/* VIDEO ORIENTATION */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📐 {isEnglish ? 'Video Orientation' : 'Orientação do Vídeo'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {isEnglish ? 'Choose horizontal (16:9) for landscape recordings, or vertical (9:16) for standing phone recordings.' : 'Escolha horizontal (16:9) para vídeos gravados deitados, ou vertical (9:16) para experts gravados em pé no celular.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 460 }}>
            {[
              { id: 'horizontal' as const, label: '📺 Horizontal', desc: isEnglish ? '16:9 — standard' : '16:9 — padrão', ratio: '16 / 9' },
              { id: 'vertical' as const, label: '📱 Vertical', desc: isEnglish ? '9:16 — standing expert' : '9:16 — expert em pé', ratio: '9 / 16' },
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
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🎨 {isEnglish ? 'Color Theme' : 'Tema de Cor'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {isEnglish ? 'Select the visual identity for the room. Clear VSL is the white YouTube-style template for English traffic.' : 'Selecione a identidade visual da sala. O tema escuro é ideal para elevar o tom de exclusividade.'}
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
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🖼️ {isEnglish ? 'Background Image (Custom Background)' : 'Imagem de Fundo (Custom Background)'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {isEnglish ? 'Replace the default room or waiting-room background with a custom image.' : 'Substitua o fundo escurecido da sala de aula e sala de espera por uma imagem personalizada.'}
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

        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '10px 0' }} />

        {/* IDIOMA PADRÃO */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🌐 {isEnglish ? 'Room Language' : 'Idioma da Sala'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {isEnglish ? 'Set the primary attendee interface language for buttons, polls, chat, and counters.' : 'Defina o idioma principal da interface do participante (botões, enquetes, chat e contadores).'}
          </div>
          <select
            className="form-input"
            style={{ maxWidth: 300 }}
            value={language}
            onChange={e => setLanguage(e.target.value)}
          >
            <option value="pt">Português (PT)</option>
            <option value="en">Inglês (EN)</option>
            <option value="es">Espanhol (ES)</option>
          </select>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '10px 0' }} />

        {/* CURVA DE AUDIÊNCIA SIMULADA */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📈 Curva de Audiência Simulada</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Configure o comportamento dos espectadores simulados ao longo do vídeo para simular picos e quedas de forma natural.
          </div>

          {/* Preset Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => {
                setFakeViewersStart(12)
                setFakeViewersPeak(45)
                setFakeViewersEnd(18)
                setFakeViewersPeakAtPct(35)
                toast.success('Preset Pequeno (Validação) aplicado!')
              }}
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'
                e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.08)'
                e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.2)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#4ade80', fontSize: 14 }}>
                <span>🟢</span> Pequeno (Validação)
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Pico de 40 a 70 pessoas. Perfeito para salas iniciais ou validação.
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 8 }}>
                <span>Início: 12</span>
                <span>Pico: 45</span>
                <span>Fim: 18</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setFakeViewersStart(75)
                setFakeViewersPeak(320)
                setFakeViewersEnd(90)
                setFakeViewersPeakAtPct(30)
                toast.success('Preset Médio (Escala) aplicado!')
              }}
              style={{
                background: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.2)',
                borderRadius: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(234, 179, 8, 0.15)'
                e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(234, 179, 8, 0.08)'
                e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.2)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#facc15', fontSize: 14 }}>
                <span>🟡</span> Médio (Escala)
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Pico de 250 a 450 pessoas. Ideal para campanhas ativas.
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 8 }}>
                <span>Início: 75</span>
                <span>Pico: 320</span>
                <span>Fim: 90</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setFakeViewersStart(450)
                setFakeViewersPeak(2400)
                setFakeViewersEnd(620)
                setFakeViewersPeakAtPct(25)
                toast.success('Preset Mega Lançamento aplicado!')
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#f87171', fontSize: 14 }}>
                <span>🔴</span> Mega Lançamento
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Pico de 1.500 a 3.000 pessoas. Curvas e quedas orgânicas.
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 8 }}>
                <span>Início: 450</span>
                <span>Pico: 2400</span>
                <span>Fim: 620</span>
              </div>
            </button>
          </div>

          {/* Individual Inputs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, background: 'var(--bg-elevated)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, display: 'block' }}>Espectadores Iniciais</label>
              <input
                type="number"
                className="form-input"
                min={0}
                value={fakeViewersStart}
                onChange={e => setFakeViewersStart(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, display: 'block' }}>Espectadores de Pico</label>
              <input
                type="number"
                className="form-input"
                min={0}
                value={fakeViewersPeak}
                onChange={e => setFakeViewersPeak(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, display: 'block' }}>Espectadores Finais</label>
              <input
                type="number"
                className="form-input"
                min={0}
                value={fakeViewersEnd}
                onChange={e => setFakeViewersEnd(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, display: 'block' }}>Pico aos % do Vídeo</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={100}
                  style={{ paddingRight: 28 }}
                  value={fakeViewersPeakAtPct}
                  onChange={e => setFakeViewersPeakAtPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                />
                <span style={{ position: 'absolute', right: 10, color: 'var(--text-muted)', fontSize: 12 }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* YOUTUBE CUSTOM FIELDS (Only shown if theme is 'youtube') */}
        {isYouTubeTheme && (
          <>
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '10px 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-light)' }}>
                📺 {isEnglish ? 'YouTube Template Settings' : 'Configurações do Tema YouTube'}
              </div>
              
              {/* Canal Avatar e Inscritos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'block' }}>Foto de Perfil do Canal (Avatar URL)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ytAvatar}
                    onChange={e => setYtAvatar(e.target.value)}
                    placeholder="https://link-da-imagem.com/avatar.jpg"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'block' }}>Quantidade de Inscritos do Canal</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ytSubCount}
                    onChange={e => setYtSubCount(e.target.value)}
                    placeholder="Ex: 487 mil / 1.2 M"
                  />
                </div>
              </div>

              {/* Ativar/Desativar Comentários */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="yt_comments_enabled"
                  checked={ytCommentsEnabled}
                  onChange={e => setYtCommentsEnabled(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="yt_comments_enabled" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                  Ativar seção de comentários simulados abaixo do vídeo
                </label>
              </div>
            </div>
          </>
        )}

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
