'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { useWebinarHealth } from '@/hooks/useWebinarHealth'

interface WebinarData {
  id: string
  name: string
  slug: string
  status: string
  video_url: string | null
  duration_seconds: number
  thumbnail_url: string | null
  analytics_pitch_minute: number | null
  landing_headline: string | null
  landing_subheadline: string | null
  landing_button_text: string | null
  theme: 'dark' | 'light' | 'youtube' | 'clear_vsl'
  video_orientation: 'horizontal' | 'vertical'
  waiting_room_enabled: boolean
  waiting_delay_seconds: number
  custom_background_url: string | null
  is_evergreen: boolean
}

interface PitchEvent {
  id?: string
  webinar_id: string
  type: 'pitch_button'
  timestamp_seconds: number
  payload: {
    cta_text?: string
    cta_url?: string
    image_url?: string
    text_above?: string
    countdown_seconds?: number
    scarcity_spots?: number
    broadcast_sales?: boolean
    broadcast_names?: string
  }
}

export default function SetupWizardPage() {
  const { id: projectId, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const router = useRouter()
  const health = useWebinarHealth(wid)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)

  // Webhook and Upload refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bgFileInputRef = useRef<HTMLInputElement>(null)
  const offerFileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string | null>(null)

  // Wizard data state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [isEvergreen, setIsEvergreen] = useState(false)

  const [videoUrl, setVideoUrl] = useState('')
  const [duration, setDuration] = useState(3600)
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [pitchMinute, setPitchMinute] = useState<number | ''>('')

  const [landingHeadline, setLandingHeadline] = useState('')
  const [landingSubheadline, setLandingSubheadline] = useState('')
  const [landingButtonText, setLandingButtonText] = useState('')

  const [theme, setTheme] = useState<'dark' | 'light' | 'youtube' | 'clear_vsl'>('dark')
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal')
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false)
  const [waitingDelaySeconds, setWaitingDelaySeconds] = useState(120)
  const [customBgUrl, setCustomBgUrl] = useState('')

  // Pitch settings
  const [hasOffer, setHasOffer] = useState(false)
  const [offerTimeSec, setOfferTimeSec] = useState(1200)
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [textAbove, setTextAbove] = useState('')
  const [productImg, setProductImg] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [scarcitySpots, setScarcitySpots] = useState(0)
  const [broadcastSales, setBroadcastSales] = useState(false)
  const [broadcastNames, setBroadcastNames] = useState('')

  const [pitchEventId, setPitchEventId] = useState<string | null>(null)
  const [status, setStatus] = useState('draft')

  useEffect(() => {
    async function load() {
      // 1. Fetch webinar settings
      const { data: w } = await supabase.from('webi_webinars').select('*').eq('id', wid).single()
      if (w) {
        setName(w.name || '')
        setSlug(w.slug || '')
        setIsEvergreen(!!w.is_evergreen)
        setVideoUrl(w.video_url || '')
        setDuration(w.duration_seconds || 3600)
        setThumbnailUrl(w.thumbnail_url || '')
        setPitchMinute(w.analytics_pitch_minute ?? '')
        setLandingHeadline(w.landing_headline || '')
        setLandingSubheadline(w.landing_subheadline || '')
        setLandingButtonText(w.landing_button_text || 'Quero me inscrever')
        setTheme(w.theme || 'dark')
        setOrientation(w.video_orientation || 'horizontal')
        setWaitingRoomEnabled(!!w.waiting_room_enabled)
        setWaitingDelaySeconds(w.waiting_delay_seconds ?? 120)
        setCustomBgUrl(w.custom_background_url || '')
        setStatus(w.status || 'draft')
      }

      // 2. Fetch pitch event
      const { data: evs } = await supabase
        .from('webi_events')
        .select('*')
        .eq('webinar_id', wid)
        .eq('type', 'pitch_button')
        .order('timestamp_seconds', { ascending: true })
        .limit(1)

      if (evs && evs.length > 0) {
        const p = evs[0] as PitchEvent
        setPitchEventId(p.id || null)
        setHasOffer(true)
        setOfferTimeSec(p.timestamp_seconds)
        setCtaText(p.payload.cta_text || '')
        setCtaUrl(p.payload.cta_url || '')
        setTextAbove(p.payload.text_above || '')
        setProductImg(p.payload.image_url || '')
        setCountdown(p.payload.countdown_seconds || 0)
        setScarcitySpots(p.payload.scarcity_spots || 0)
        setBroadcastSales(!!p.payload.broadcast_sales)
        setBroadcastNames(p.payload.broadcast_names || '')
      }

      setLoading(false)
    }
    load()
  }, [wid, supabase])

  async function uploadImage(file: File, target: 'thumb' | 'bg' | 'product'): Promise<string | null> {
    setUploading(target)
    try {
      const ext = file.name.split('.').pop()
      const path = `wizard-assets/${wid}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('webinar-images')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: pub } = supabase.storage.from('webinar-images').getPublicUrl(path)
      return pub?.publicUrl || null
    } catch (e) {
      console.error(e)
      return null
    } finally {
      setUploading(null)
    }
  }

  async function saveStepData() {
    setSaving(true)
    try {
      if (step === 1) {
        // Save Basic Info
        const { error } = await supabase.from('webi_webinars').update({ name, slug, is_evergreen: isEvergreen }).eq('id', wid)
        if (error) throw error
      } else if (step === 2) {
        // Save Video Settings
        const { error } = await supabase.from('webi_webinars').update({
          video_url: videoUrl || null,
          duration_seconds: Number(duration),
          thumbnail_url: thumbnailUrl || null,
          analytics_pitch_minute: pitchMinute === '' ? null : Number(pitchMinute)
        }).eq('id', wid)
        if (error) throw error
      } else if (step === 3) {
        // Save Capture Page Settings
        const { error } = await supabase.from('webi_webinars').update({
          landing_headline: landingHeadline || null,
          landing_subheadline: landingSubheadline || null,
          landing_button_text: landingButtonText || null
        }).eq('id', wid)
        if (error) throw error
      } else if (step === 4) {
        // Save Appearance and Room Settings
        const { error } = await supabase.from('webi_webinars').update({
          theme,
          video_orientation: orientation,
          waiting_room_enabled: waitingRoomEnabled,
          waiting_delay_seconds: Number(waitingDelaySeconds),
          custom_background_url: customBgUrl || null
        }).eq('id', wid)
        if (error) throw error
      } else if (step === 5) {
        // Save Offer Settings
        if (hasOffer) {
          const payload = {
            cta_text: ctaText,
            cta_url: ctaUrl,
            image_url: productImg,
            text_above: textAbove,
            countdown_seconds: Number(countdown),
            scarcity_spots: Number(scarcitySpots),
            broadcast_sales: broadcastSales,
            broadcast_names: broadcastNames,
          }

          if (pitchEventId) {
            const { error } = await supabase.from('webi_events').update({
              timestamp_seconds: Number(offerTimeSec),
              payload
            }).eq('id', pitchEventId)
            if (error) throw error
          } else {
            const { data: created, error } = await supabase.from('webi_events').insert({
              webinar_id: wid,
              type: 'pitch_button',
              timestamp_seconds: Number(offerTimeSec),
              payload
            }).select().single()
            if (error) throw error
            if (created) setPitchEventId(created.id)
          }
        } else if (pitchEventId) {
          const { error } = await supabase.from('webi_events').delete().eq('id', pitchEventId)
          if (error) throw error
          setPitchEventId(null)
        }
      }
      return true
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao salvar: ${e.message}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleNext() {
    const ok = await saveStepData()
    if (ok) {
      setStep(s => s + 1)
    }
  }

  async function handlePrev() {
    setStep(s => Math.max(1, s - 1))
  }

  async function handlePublish() {
    setSaving(true)
    const { error } = await supabase.from('webi_webinars').update({ status: 'active' }).eq('id', wid)
    setSaving(false)
    if (error) {
      toast.error(`Erro ao publicar: ${error.message}`)
    } else {
      toast.success('🎉 Webinar publicado com sucesso!')
      setStatus('active')
      router.push(`/admin/projects/${projectId}/webinars/${wid}`)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const stepLabels = ['Básico', 'Vídeo', 'Captura', 'Experiência', 'Oferta', 'Revisão']

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 24px' }}>
      <Toaster position="top-right" />

      {/* TOP PROGRESS STEP BAR */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '24px 20px',
        marginBottom: 32,
        display: 'flex',
        justifyContent: 'space-between',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Connector Line */}
        <div style={{
          position: 'absolute',
          top: '38px',
          left: '40px',
          right: '40px',
          height: '2px',
          background: 'var(--border)',
          zIndex: -1
        }} />
        <div style={{
          position: 'absolute',
          top: '38px',
          left: '40px',
          width: `${((step - 1) / (stepLabels.length - 1)) * 90}%`,
          height: '2px',
          background: 'var(--brand)',
          zIndex: -1,
          transition: 'width 0.3s ease'
        }} />

        {stepLabels.map((lbl, idx) => {
          const num = idx + 1
          const isActive = step === num
          const isDone = step > num
          return (
            <div key={lbl} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: isDone ? 'var(--brand)' : isActive ? 'var(--bg-elevated)' : 'var(--bg)',
                border: `2px solid ${isActive || isDone ? 'var(--brand)' : 'var(--border)'}`,
                color: isDone || isActive ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
                transition: 'all 0.2s'
              }}>
                {isDone ? '✓' : num}
              </div>
              <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {lbl}
              </span>
            </div>
          )
        })}
      </div>

      {/* STEP CONTENT CONTAINER */}
      <div className="card" style={{ minHeight: 380, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        
        <div style={{ paddingBottom: 24 }}>
          {/* STEP 1: BASIC */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0' }}>📋 Informações Básicas</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Insira o nome de controle, slug de acesso e selecione o tipo do webinar.</p>
              
              <div className="form-group">
                <label className="form-label">Nome do Webinar</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Masterclass Tráfego Pago Avançado"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Slug de URL</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/w/</span>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    placeholder="trafego-avancado"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tipo do Webinar</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setIsEvergreen(true)}
                    style={{
                      background: 'none',
                      border: `2px solid ${isEvergreen ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius: 10, padding: 14, cursor: 'pointer', textAlign: 'left'
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🔄 Modo Evergreen</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                      Cada espectador assiste individualmente desde o início (0s) ao entrar, perfeito para funis perpétuos simulados.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEvergreen(false)}
                    style={{
                      background: 'none',
                      border: `2px solid ${!isEvergreen ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius: 10, padding: 14, cursor: 'pointer', textAlign: 'left'
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🗓️ Agendado / Ao Vivo</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                      Transmissão com horário de início global fixado. Todos os espectadores assistem ao mesmo ponto do vídeo sincronizados.
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: VIDEO */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0' }}>🎥 Vídeo do Webinar</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Configure de onde vem seu vídeo, a duração e a imagem do player.</p>

              <div className="form-group">
                <label className="form-label">URL do Vídeo principal</label>
                <input
                  type="text"
                  className="form-input"
                  value={videoUrl}
                  onChange={e => {
                    let val = e.target.value
                    if (val.includes('<script') && val.includes('converteai.net')) {
                      const match = val.match(/s\.src\s*=\s*["']([^"']+)["']/) || val.match(/src=["']([^"']+)["']/)
                      if (match?.[1]) {
                        val = match[1]
                        toast.success('Script detectado! URL extraída.')
                      }
                    }
                    setVideoUrl(val)
                  }}
                  placeholder="YouTube, Vimeo, VTurb (.js) ou link MP4..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Duração exata (segundos)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Minuto do Pitch principal</label>
                  <input
                    type="number"
                    className="form-input"
                    value={pitchMinute}
                    onChange={e => setPitchMinute(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ex: 25"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Poster/Thumbnail do Player</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1 }}
                    value={thumbnailUrl}
                    onChange={e => setThumbnailUrl(e.target.value)}
                    placeholder="https://... ou faça upload"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={uploading === 'thumb'}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading === 'thumb' ? '⏳' : '📁 Upload'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const url = await uploadImage(file, 'thumb')
                      if (url) setThumbnailUrl(url)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CAPTURE PAGE */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0' }}>🧲 Página de Inscrição</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Defina a copy principal que o participante vê ao cadastrar seu nome e e-mail.</p>

              <div className="form-group">
                <label className="form-label">Headline (Promessa Principal)</label>
                <textarea
                  className="form-input form-textarea"
                  rows={3}
                  value={landingHeadline}
                  onChange={e => setLandingHeadline(e.target.value)}
                  placeholder="Ex: Descubra como criar um negócio online de 5 dígitos nos próximos 30 dias gratuitamente..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subheadline (Texto de Apoio)</label>
                <textarea
                  className="form-input form-textarea"
                  rows={2}
                  value={landingSubheadline}
                  onChange={e => setLandingSubheadline(e.target.value)}
                  placeholder="Ex: Treinamento prático direto ao ponto sem enrolação."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Texto do Botão de Cadastro</label>
                <input
                  type="text"
                  className="form-input"
                  value={landingButtonText}
                  onChange={e => setLandingButtonText(e.target.value)}
                  placeholder="Quero me inscrever →"
                />
              </div>
            </div>
          )}

          {/* STEP 4: ROOM EXPERIENCE */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0' }}>🚪 Experiência da Sala</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Configure temas visuais, a sala de espera do webinar e imagem de fundo.</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Tema de Cor</label>
                  <select
                    className="form-input"
                    value={theme}
                    onChange={e => setTheme(e.target.value as any)}
                  >
                    <option value="dark">Dark (Escuro Elegante)</option>
                    <option value="light">Claro (Branco Clássico)</option>
                    <option value="youtube">YouTube (Familiar)</option>
                    <option value="clear_vsl">Clear VSL (White YouTube)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Orientação do Vídeo</label>
                  <select
                    className="form-input"
                    value={orientation}
                    onChange={e => setOrientation(e.target.value as any)}
                  >
                    <option value="horizontal">📺 Horizontal (16:9)</option>
                    <option value="vertical">📱 Vertical (9:16)</option>
                  </select>
                </div>
              </div>

              <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>🚪 Ativar Sala de Espera</span>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Retém os alunos num contador regressivo antes do vídeo começar.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={waitingRoomEnabled}
                    onChange={e => setWaitingRoomEnabled(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--brand)', cursor: 'pointer' }}
                  />
                </div>
                {waitingRoomEnabled && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Tempo de Espera (segundos)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: 100 }}
                      value={waitingDelaySeconds}
                      onChange={e => setWaitingDelaySeconds(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Fundo Personalizado da Sala (Opcional)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1 }}
                    value={customBgUrl}
                    onChange={e => setCustomBgUrl(e.target.value)}
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={uploading === 'bg'}
                    onClick={() => bgFileInputRef.current?.click()}
                  >
                    {uploading === 'bg' ? '⏳' : '📁 Upload'}
                  </button>
                  <input
                    ref={bgFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const url = await uploadImage(file, 'bg')
                      if (url) setCustomBgUrl(url)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: OFFER SETUP */}
          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>🛒 Botão de Oferta (CTA)</h2>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={hasOffer}
                    onChange={e => setHasOffer(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                  />
                  Habilitar Botão de Vendas
                </label>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Configure o botão de compra que aparecerá na tela após o pitch do seu webinar.</p>

              {hasOffer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Minuto/Segundo de Entrada (segundos)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={offerTimeSec}
                        onChange={e => setOfferTimeSec(Number(e.target.value))}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Texto do CTA</label>
                      <input
                        type="text"
                        className="form-input"
                        value={ctaText}
                        onChange={e => setCtaText(e.target.value)}
                        placeholder="Quero aproveitar!"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Link de Checkout / Vendas</label>
                    <input
                      type="text"
                      className="form-input"
                      value={ctaUrl}
                      onChange={e => setCtaUrl(e.target.value)}
                      placeholder="https://..."
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Texto Chamativo Acima do Botão</label>
                    <input
                      type="text"
                      className="form-input"
                      value={textAbove}
                      onChange={e => setTextAbove(e.target.value)}
                      placeholder="EX: VAGAS LIMITADAS COM R$ 500 DE DESCONTO"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Imagem do Produto (Opcional)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        className="form-input"
                        style={{ flex: 1 }}
                        value={productImg}
                        onChange={e => setProductImg(e.target.value)}
                        placeholder="https://..."
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={uploading === 'product'}
                        onClick={() => offerFileInputRef.current?.click()}
                      >
                        {uploading === 'product' ? '⏳' : '📁 Upload'}
                      </button>
                      <input
                        ref={offerFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const url = await uploadImage(file, 'product')
                          if (url) setProductImg(url)
                          e.target.value = ''
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: REVIEW AND PUBLISH */}
          {step === 6 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0' }}>🚀 Revisão e Publicação</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Quase lá! Dê uma olhada nas pendências do webinar antes de publicá-lo.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
                {[
                  { label: 'Vídeo Principal configurado', ok: !!videoUrl },
                  { label: 'Página de Captura / Headline cadastrada', ok: !!landingHeadline },
                  { label: 'Oferta / Botão de CTA configurado', ok: hasOffer && !!ctaUrl },
                  { label: 'Chat Simulador configurado', ok: health.chat === 'ok' },
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-elevated)' }}>
                    <span style={{ color: item.ok ? '#10b981' : '#f59e0b', fontWeight: 800 }}>
                      {item.ok ? '✓ PRONTO' : '⚠ ALERTA'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  </div>
                ))}
              </div>

              {status === 'active' ? (
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, padding: 14, fontSize: 13, color: '#10b981', textAlign: 'center' }}>
                  🎉 Este webinar já está **Publicado**! Você pode iniciar as divulgações.
                </div>
              ) : (
                <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--text-secondary)' }}>
                  O webinar está em modo **Rascunho**. Para liberar o tráfego e permitir cadastros, clique em **Publicar Webinar** abaixo.
                </div>
              )}
            </div>
          )}
        </div>

        {/* BOTTOM NAVIGATION ACTIONS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePrev}
            disabled={step === 1 || saving}
          >
            ← Voltar
          </button>

          {step < 6 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNext}
              disabled={saving}
              style={{ padding: '10px 24px' }}
            >
              {saving ? 'Salvando...' : 'Avançar →'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <Link
                href={`/admin/projects/${projectId}/webinars/${wid}`}
                className="btn btn-ghost"
              >
                Ir para Dashboard
              </Link>
              {status !== 'active' && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handlePublish}
                  disabled={saving}
                  style={{ padding: '10px 24px', fontWeight: 700 }}
                >
                  🚀 Publicar Webinar
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
