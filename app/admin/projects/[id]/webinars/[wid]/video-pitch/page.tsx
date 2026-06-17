'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'

interface WebinarData {
  id: string
  name: string
  video_url: string | null
  duration_seconds: number
  thumbnail_url: string | null
  analytics_pitch_minute: number | null
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
    exit_at_seconds?: number
  }
}

export default function VideoPitchPage() {
  const { id: projectId, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [uploadingProduct, setUploadingProduct] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const productFileInputRef = useRef<HTMLInputElement>(null)

  // Form State
  const [webinar, setWebinar] = useState<WebinarData | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [duration, setDuration] = useState(3600)
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [pitchMinute, setPitchMinute] = useState<number | ''>('')

  // Pitch Event State
  const [pitchEvent, setPitchEvent] = useState<PitchEvent | null>(null)
  const [hasOffer, setHasOffer] = useState(false)
  const [offerTimeSec, setOfferTimeSec] = useState(1200) // 20 min default
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [textAbove, setTextAbove] = useState('')
  const [productImg, setProductImg] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [scarcitySpots, setScarcitySpots] = useState(0)
  const [broadcastSales, setBroadcastSales] = useState(false)
  const [broadcastNames, setBroadcastNames] = useState('')

  useEffect(() => {
    async function load() {
      // 1. Fetch webinar
      const { data: w } = await supabase.from('webi_webinars').select('id, name, video_url, duration_seconds, thumbnail_url, analytics_pitch_minute').eq('id', wid).single()
      if (w) {
        setWebinar(w as WebinarData)
        setVideoUrl(w.video_url || '')
        setDuration(w.duration_seconds || 3600)
        setThumbnailUrl(w.thumbnail_url || '')
        setPitchMinute(w.analytics_pitch_minute ?? '')
      }

      // 2. Fetch first pitch_button event
      const { data: evs } = await supabase
        .from('webi_events')
        .select('*')
        .eq('webinar_id', wid)
        .eq('type', 'pitch_button')
        .order('timestamp_seconds', { ascending: true })
        .limit(1)

      if (evs && evs.length > 0) {
        const p = evs[0] as PitchEvent
        setPitchEvent(p)
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
      } else {
        setHasOffer(false)
      }
      setLoading(false)
    }
    load()
  }, [wid, supabase])

  async function uploadImage(file: File, type: 'thumb' | 'product'): Promise<string | null> {
    if (type === 'thumb') setUploadingThumb(true)
    else setUploadingProduct(true)

    try {
      const ext = file.name.split('.').pop()
      const path = `webinar-assets/${wid}/${Date.now()}.${ext}`
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
      if (type === 'thumb') setUploadingThumb(false)
      else setUploadingProduct(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      // 1. Update webinar essential details
      const { error: wErr } = await supabase
        .from('webi_webinars')
        .update({
          video_url: videoUrl || null,
          duration_seconds: Number(duration),
          thumbnail_url: thumbnailUrl || null,
          analytics_pitch_minute: pitchMinute === '' ? null : Number(pitchMinute),
        })
        .eq('id', wid)

      if (wErr) throw wErr

      // 2. Handle offer/pitch event
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

        if (pitchEvent?.id) {
          // Update existing
          const { error: evErr } = await supabase
            .from('webi_events')
            .update({
              timestamp_seconds: Number(offerTimeSec),
              payload,
            })
            .eq('id', pitchEvent.id)
          if (evErr) throw evErr
        } else {
          // Insert new
          const { data: created, error: evErr } = await supabase
            .from('webi_events')
            .insert({
              webinar_id: wid,
              type: 'pitch_button',
              timestamp_seconds: Number(offerTimeSec),
              payload,
            })
            .select()
            .single()
          if (evErr) throw evErr
          if (created) setPitchEvent(created as PitchEvent)
        }
      } else if (pitchEvent?.id) {
        // Delete offer if unchecked
        const { error: delErr } = await supabase.from('webi_events').delete().eq('id', pitchEvent.id)
        if (delErr) throw delErr
        setPitchEvent(null)
      }

      toast.success('Configurações salvas com sucesso!')
      router.refresh()
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao salvar: ${err.message || 'Erro desconhecido'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !webinar) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
      <Toaster position="top-right" />

      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link>
            {' / '}{webinar.name}
          </div>
          <h1 className="page-title">🎥 Configuração de Vídeo & Pitch</h1>
          <p className="page-subtitle">Configure o player do webinar e a oferta/CTA que será exibida para os alunos.</p>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Video Settings */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, borderBottom: '1px solid var(--border)', paddingBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📹</span> Vídeo Principal
          </div>

          <div className="form-group">
            <label className="form-label">URL do Vídeo</label>
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
                    toast.success('Script detectado! URL extraída com sucesso.')
                  }
                }
                setVideoUrl(val)
              }}
              placeholder="YouTube, Vimeo, VTurb (.js) ou .mp4..."
            />
            <p className="help-text">Insira a URL do vídeo de transmissão oficial do seu webinar.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Duração (segundos)</label>
              <input
                type="number"
                className="form-input"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Minuto do Pitch (Métricas)</label>
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
            <label className="form-label">Thumbnail (Poster)</label>
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
                disabled={uploadingThumb}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingThumb ? '⏳' : '📁 Upload'}
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
                  if (url) {
                    setThumbnailUrl(url)
                    toast.success('Thumbnail enviada com sucesso!')
                  } else {
                    toast.error('Erro no upload.')
                  }
                  e.target.value = ''
                }}
              />
            </div>
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt="Thumbnail preview"
                style={{ marginTop: 10, width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Pitch Offer Settings */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, borderBottom: '1px solid var(--border)', paddingBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🛒</span> Oferta & CTA
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={hasOffer}
                onChange={e => setHasOffer(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
              />
              Ativar Oferta
            </label>
          </div>

          {!hasOffer ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>Nenhuma oferta configurada para este webinar.</p>
              <p style={{ fontSize: 11, marginTop: 4 }}>Marque &quot;Ativar Oferta&quot; acima para configurar botão de vendas, popup e broadcast.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Momento de Exibição (em segundos)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: 120 }}
                    value={offerTimeSec}
                    onChange={e => setOfferTimeSec(Number(e.target.value))}
                    required
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ⏱️ equivale a {Math.floor(offerTimeSec / 60)} min e {offerTimeSec % 60} seg
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Texto Chamativo (acima do botão)</label>
                <input
                  type="text"
                  className="form-input"
                  value={textAbove}
                  onChange={e => setTextAbove(e.target.value)}
                  placeholder="EX: 60% DE DESCONTO NAS PRÓXIMAS HORAS"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Texto do Botão (CTA)</label>
                <input
                  type="text"
                  className="form-input"
                  value={ctaText}
                  onChange={e => setCtaText(e.target.value)}
                  placeholder="Quero garantir meu desconto agora!"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Link de Vendas (URL de Destino)</label>
                <input
                  type="text"
                  className="form-input"
                  value={ctaUrl}
                  onChange={e => setCtaUrl(e.target.value)}
                  placeholder="https://pay.kiwify.com.br/..."
                  required
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
                    disabled={uploadingProduct}
                    onClick={() => productFileInputRef.current?.click()}
                  >
                    {uploadingProduct ? '⏳' : '📁 Upload'}
                  </button>
                  <input
                    ref={productFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const url = await uploadImage(file, 'product')
                      if (url) {
                        setProductImg(url)
                        toast.success('Imagem do produto enviada!')
                      } else {
                        toast.error('Erro no upload.')
                      }
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">⏱️ Contador Regressivo (seg)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={countdown}
                    onChange={e => setCountdown(Number(e.target.value))}
                    placeholder="0 = desativado"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">🪑 Escassez (Vagas Restantes)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={scarcitySpots}
                    onChange={e => setScarcitySpots(Number(e.target.value))}
                    placeholder="0 = desativado"
                  />
                </div>
              </div>

              <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>📣 Broadcast de Vendas</span>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Simula compras no chat após exibição da oferta.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={broadcastSales}
                    onChange={e => setBroadcastSales(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                  />
                </div>
                {broadcastSales && (
                  <input
                    type="text"
                    className="form-input"
                    value={broadcastNames}
                    onChange={e => setBroadcastNames(e.target.value)}
                    placeholder="Maria, João, Ana, Carlos, Aline (separado por vírgula)..."
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM SAVE BUTTON */}
        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '12px 32px', fontSize: 14, fontWeight: 700 }}>
            {saving ? '⏳ Salvando Configurações...' : '💾 Salvar Configurações'}
          </button>
        </div>
      </form>
    </div>
  )
}
