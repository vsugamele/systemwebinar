'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { EventEngine } from '@/lib/event-engine'
import { getPusherClient } from '@/lib/pusher'
import type { Webinar, WebinarEvent, ChatMessage, ChatMessagePayload, OfferPopupPayload, PitchButtonPayload } from '@/types'

// Extend PitchButtonPayload for new fields
interface ExtendedPitchPayload extends PitchButtonPayload {
  text_above?: string
  countdown_seconds?: number
  scarcity_spots?: number
  broadcast_sales?: boolean
  broadcast_names?: string
}

interface WebinarConfig {
  chat_cpm?: number
  chat_names?: string[]
  tracking_head_code?: string
  tracking_body_code?: string
}

interface Props {
  webinar: Webinar & WebinarConfig
  events: WebinarEvent[]
}

function generateSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatCountdown(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Converts any YouTube watch/share URL into an embed URL */
function getYouTubeEmbedUrl(url: string, startSeconds = 0): string | null {
  try {
    const u = new URL(url)
    let videoId: string | null = null

    if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1)
    } else if (
      u.hostname === 'www.youtube.com' ||
      u.hostname === 'youtube.com' ||
      u.hostname === 'm.youtube.com'
    ) {
      videoId = u.searchParams.get('v')
      if (!videoId && u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/embed/')[1]?.split('?')[0]
      }
    }

    if (!videoId) return null
    const start = startSeconds > 0 ? `&start=${startSeconds}` : ''
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=0&modestbranding=1&rel=0&disablekb=1${start}`
  } catch {
    return null
  }
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return ['youtu.be', 'www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname)
  } catch {
    return false
  }
}

// Pool of chat messages for CPM simulation
const GENERIC_CHAT_PHRASES = [
  'Incrível! Adorando o conteúdo 🔥',
  'Que conteúdo valioso, obrigado!',
  'Estou adorando tudo isso! 👏',
  'Minha mente foi aberta com isso',
  'Nunca tinha pensado assim antes',
  'Isso vai mudar minha vida! 🚀',
  'Estou tomando notas o tempo todo',
  'Conteúdo de altíssima qualidade!',
  'Já aplicando isso no meu projeto',
  'Sensacional! 🙌',
  'Que dica poderosa!',
  'Tô aqui desde o início, incrível!',
  'Isso é exatamente o que eu precisava',
  'Obrigada por esse conteúdo gratuito!',
  'Parece que foi feito pra mim 😊',
  'Salvando cada dica! ✍️',
  'Vocês são incríveis!',
  'Quero mais conteúdo assim!',
  'Compartilhei com 3 amigos já haha',
  'Melhor webinar que já assisti!',
]

export default function WebinarRoom({ webinar, events }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<EventEngine | null>(null)
  const sessionId = useRef(generateSessionId())
  const broadcastTimerRef = useRef<NodeJS.Timeout | null>(null)
  const cpmTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [userName, setUserName] = useState('Você')
  const [viewers, setViewers] = useState(webinar.peak_viewers_min)
  const [viewersPulse, setViewersPulse] = useState(false)
  const [pitchVisible, setPitchVisible] = useState(false)
  const [pitchPayload, setPitchPayload] = useState<ExtendedPitchPayload | null>(null)
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupPayload, setPopupPayload] = useState<OfferPopupPayload | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [scarcitySpots, setScarcitySpots] = useState(0)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  // ---- Viewer counter simulation ----
  useEffect(() => {
    const min = webinar.peak_viewers_min
    const max = webinar.peak_viewers_max
    setViewers(min)
    const interval = setInterval(() => {
      setViewers(v => {
        const delta = Math.floor(Math.random() * 5) - 2
        const next = Math.max(min, Math.min(max, v + delta))
        if (next !== v) {
          setViewersPulse(true)
          setTimeout(() => setViewersPulse(false), 400)
        }
        return next
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [webinar])

  // ---- CPM-based chat simulation ----
  useEffect(() => {
    const cpm = webinar.chat_cpm || 0
    if (cpm <= 0) return

    const poolNames = webinar.chat_names?.length ? webinar.chat_names
      : ['Maria', 'João', 'Ana', 'Carlos', 'Luciana', 'Pedro', 'Fernanda', 'Rafael']

    const intervalMs = (60 / cpm) * 1000
    const jitter = intervalMs * 0.4

    function scheduleNext() {
      const delay = intervalMs + (Math.random() * jitter * 2 - jitter)
      cpmTimerRef.current = setTimeout(() => {
        const name = poolNames[Math.floor(Math.random() * poolNames.length)]
        const text = GENERIC_CHAT_PHRASES[Math.floor(Math.random() * GENERIC_CHAT_PHRASES.length)]
        setMessages(m => [...m, {
          id: Math.random().toString(36),
          author: name,
          text,
          timestamp: Math.floor(videoRef.current?.currentTime || 0),
          isSimulated: true,
        }])
        scheduleNext()
      }, delay)
    }

    scheduleNext()
    return () => { if (cpmTimerRef.current) clearTimeout(cpmTimerRef.current) }
  }, [webinar.chat_cpm, webinar.chat_names])

  // ---- Real-time chat (Pusher) ----
  useEffect(() => {
    try {
      const pusher = getPusherClient()
      const channel = pusher.subscribe(`webinar-${webinar.id}`)
      channel.bind('chat-message', (data: ChatMessage & { session_id?: string }) => {
        if (data.session_id !== sessionId.current) {
          const { session_id: _, ...msg } = data
          setMessages(m => [...m, msg as ChatMessage])
        }
      })
      return () => {
        channel.unbind_all()
        pusher.unsubscribe(`webinar-${webinar.id}`)
      }
    } catch {
      // Pusher not configured — real-time chat disabled
    }
  }, [webinar.id])

  // ---- Auto scroll chat ----
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ---- Countdown ticker ----
  function startCountdown(seconds: number) {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(seconds)
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current!)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  // ---- Broadcast sales messages ----
  function startBroadcast(payload: ExtendedPitchPayload) {
    const rawNames = payload.broadcast_names
    const poolNames = rawNames
      ? rawNames.split(',').map(n => n.trim()).filter(Boolean)
      : webinar.chat_names?.length ? webinar.chat_names
      : ['Maria', 'João', 'Ana', 'Carlos', 'Luciana']

    let idx = 0
    function fireNext() {
      if (idx >= poolNames.length) return
      const name = poolNames[idx++]
      const firstName = name.split(' ')[0]
      setMessages(m => [...m, {
        id: `broadcast-${idx}`,
        author: '🛒 Notificação',
        text: `${firstName} acabou de comprar! 🎉`,
        timestamp: Math.floor(videoRef.current?.currentTime || 0),
        isSimulated: true,
        isBroadcast: true,
      } as any])
      const delay = 10000 + Math.random() * 10000 // 10–20s between each
      broadcastTimerRef.current = setTimeout(fireNext, delay)
    }

    // Start after 5 seconds of pitch appearing
    broadcastTimerRef.current = setTimeout(fireNext, 5000)
  }

  // ---- Event engine ----
  useEffect(() => {
    const engine = new EventEngine(events)

    engine.on('chat_message', (ev) => {
      const p = ev.payload as ChatMessagePayload
      setMessages(m => [...m, {
        id: ev.id,
        author: p.author,
        avatar: p.avatar,
        text: p.text,
        timestamp: ev.timestamp_seconds,
        isSimulated: true,
      }])
    })

    engine.on('offer_popup', (ev) => {
      const p = ev.payload as OfferPopupPayload
      setPopupPayload(p)
      setPopupVisible(true)
      trackEvent('popup_seen', ev.timestamp_seconds)

      if (p.duration_seconds > 0) {
        setTimeout(() => setPopupVisible(false), p.duration_seconds * 1000)
      }
    })

    engine.on('pitch_button', (ev) => {
      const p = ev.payload as ExtendedPitchPayload
      setPitchPayload(p)
      setPitchVisible(true)
      trackEvent('popup_seen', ev.timestamp_seconds, { type: 'pitch' })

      // Countdown
      if (p.countdown_seconds && p.countdown_seconds > 0) {
        startCountdown(p.countdown_seconds)
      }

      // Scarcity
      if (p.scarcity_spots && p.scarcity_spots > 0) {
        setScarcitySpots(p.scarcity_spots)
        // Randomly decrement spots over time
        let spots = p.scarcity_spots
        const spotInterval = setInterval(() => {
          if (spots <= 1) { clearInterval(spotInterval); return }
          if (Math.random() < 0.3) {
            spots--
            setScarcitySpots(spots)
          }
        }, 20000)
      }

      // Broadcast sales
      if (p.broadcast_sales) {
        startBroadcast(p)
      }
    })

    engine.on('hide_pitch_button', () => {
      setPitchVisible(false)
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current)
    })

    engineRef.current = engine
  }, [events])

  // ---- Video setup (evergreen offset + block controls) ----
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoaded = () => {
      if (webinar.evergreen_offset_seconds > 0) {
        video.currentTime = webinar.evergreen_offset_seconds
      }
    }

    const onTimeUpdate = () => {
      const t = Math.floor(video.currentTime)
      engineRef.current?.tick(t)

      // Track watch_second every 10s
      if (t % 10 === 0 && t > 0) {
        trackEvent('watch_second', t)
      }
    }

    const onSeeking = () => {
      if (Math.abs(video.currentTime - (video as any)._lastTime || 0) > 2) {
        video.currentTime = (video as any)._lastTime || 0
      }
    }

    const onTimeUpdateStore = () => {
      (video as any)._lastTime = video.currentTime
    }

    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('timeupdate', onTimeUpdateStore)
    video.addEventListener('seeking', onSeeking)

    trackEvent('joined', 0)

    return () => {
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('timeupdate', onTimeUpdateStore)
      video.removeEventListener('seeking', onSeeking)
      trackEvent('left', Math.floor(video.currentTime))
    }
  }, [webinar.evergreen_offset_seconds])

  async function trackEvent(type: string, timestampVideo: number, metadata: Record<string, any> = {}) {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId.current,
          webinar_id: webinar.id,
          project_id: webinar.project_id,
          event_type: type,
          timestamp_video: timestampVideo,
          metadata,
        }),
      })
    } catch {}
  }

  async function sendChatMessage() {
    if (!chatInput.trim()) return

    const msg: ChatMessage = {
      id: Math.random().toString(36),
      author: userName,
      text: chatInput.trim(),
      timestamp: Math.floor(videoRef.current?.currentTime || 0),
      isSimulated: false,
    }

    setMessages(m => [...m, msg])
    setChatInput('')

    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...msg, webinar_id: webinar.id, session_id: sessionId.current }),
    })

    trackEvent('chat_sent', msg.timestamp)
  }

  function handleCTAClick() {
    if (!pitchPayload) return
    trackEvent('cta_clicked', Math.floor(videoRef.current?.currentTime || 0))
    window.open(pitchPayload.cta_url, '_blank')
  }

  function handleCTADismiss() {
    setPitchVisible(false)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current)
    trackEvent('cta_dismissed', Math.floor(videoRef.current?.currentTime || 0))
  }

  function handlePopupDismiss() {
    setPopupVisible(false)
    trackEvent('popup_dismissed', Math.floor(videoRef.current?.currentTime || 0))
  }

  function handlePopupCTA() {
    if (!popupPayload) return
    trackEvent('cta_clicked', Math.floor(videoRef.current?.currentTime || 0), { source: 'popup' })
    window.open(popupPayload.cta_url, '_blank')
  }

  return (
    <div className="webinar-room">
      {/* VIDEO SECTION */}
      <div className="video-section">
        <div className="video-header">
          <div className="webinar-title-bar">
            <div className="live-badge">
              <div className="live-dot" />
              AO VIVO
            </div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{webinar.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="viewer-count">
              <div className="viewer-dot" />
              <span className={viewersPulse ? 'bump-anim' : ''}>{viewers.toLocaleString()}</span> assistindo
            </div>
          </div>
        </div>

        <div className="video-wrapper">
          {webinar.video_url ? (
            isYouTubeUrl(webinar.video_url) ? (
              <iframe
                src={getYouTubeEmbedUrl(webinar.video_url, webinar.evergreen_offset_seconds) || ''}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen={false}
                title={webinar.name}
              />
            ) : (
              <video
                ref={videoRef}
                src={webinar.video_url}
                autoPlay
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
                onError={() => setVideoError(true)}
                onContextMenu={e => e.preventDefault()}
              />
            )
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48 }}>🎬</div>
              <p>Vídeo não configurado para este webinar</p>
            </div>
          )}

          {/* PITCH BUTTON */}
          {pitchVisible && pitchPayload && (
            <div className="pitch-button">
              <button className="pitch-close" onClick={handleCTADismiss}>✕</button>
              {pitchPayload.image_url && (
                <img src={pitchPayload.image_url} alt="Oferta" className="pitch-image" />
              )}
              <div className="pitch-body">
                {/* Text above button */}
                {pitchPayload.text_above && (
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', textAlign: 'center', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {pitchPayload.text_above}
                  </p>
                )}

                {/* Countdown badge */}
                {countdown > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 8, padding: '6px 10px', marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 16 }}>⏳</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>
                      {formatCountdown(countdown)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>restantes</span>
                  </div>
                )}

                {/* CTA Button */}
                <button className="pitch-cta" onClick={handleCTAClick}>
                  {pitchPayload.cta_text}
                </button>

                {/* Scarcity spots */}
                {scarcitySpots > 0 && (
                  <div style={{
                    textAlign: 'center', fontSize: 11, marginTop: 6,
                    color: scarcitySpots <= 3 ? '#ef4444' : 'var(--text-muted)',
                    fontWeight: scarcitySpots <= 3 ? 700 : 400,
                  }}>
                    {scarcitySpots <= 3 ? '🔴' : '🟡'} Apenas {scarcitySpots} {scarcitySpots === 1 ? 'vaga restante' : 'vagas restantes'}!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OFFER POPUP */}
          {popupVisible && popupPayload && (
            <div className="offer-overlay">
              <div className="offer-modal">
                <button
                  onClick={handlePopupDismiss}
                  style={{
                    position: 'absolute', top: 16, right: 16,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: '50%', width: 32, height: 32,
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16
                  }}>
                  ✕
                </button>
                {popupPayload.image_url && (
                  <img src={popupPayload.image_url} alt="" className="offer-image" />
                )}
                <h2 className="offer-title">{popupPayload.title}</h2>
                {popupPayload.subtitle && <p className="offer-subtitle">{popupPayload.subtitle}</p>}
                <button className="offer-cta" onClick={handlePopupCTA}>
                  {popupPayload.cta_text}
                </button>
                <button className="offer-dismiss" onClick={handlePopupDismiss}>
                  Não, obrigado
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CHAT SECTION */}
      <div className="chat-section">
        <div className="chat-header">
          <div className="chat-title">💬 Chat ao Vivo</div>
          <div className="viewer-count">
            <div className="viewer-dot" />
            <span className={viewersPulse ? 'bump-anim' : ''}>{viewers.toLocaleString()}</span>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 32 }}>
              Seja o primeiro a comentar! 👋
            </div>
          )}
          {messages.map((msg, i) => {
            const isBroadcast = (msg as any).isBroadcast
            return (
              <div key={msg.id || i} className="chat-message" style={isBroadcast ? {
                background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: '6px 8px',
                border: '1px solid rgba(34,197,94,0.2)', margin: '2px 0'
              } : {}}>
                {!isBroadcast && (
                  <div
                    className="chat-avatar"
                    style={{
                      background: msg.isSimulated
                        ? `hsl(${(msg.author.charCodeAt(0) * 37) % 360}, 70%, 40%)`
                        : 'var(--brand)',
                      backgroundImage: msg.avatar ? `url(${msg.avatar})` : undefined,
                      backgroundSize: 'cover',
                    }}
                  >
                    {!msg.avatar && getInitials(msg.author)}
                  </div>
                )}
                <div>
                  {!isBroadcast && <div className="chat-msg-author">{msg.author}</div>}
                  <div className="chat-msg-text" style={isBroadcast ? { color: 'var(--success)', fontWeight: 600 } : {}}>
                    {msg.text}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-area">
          <input
            type="text"
            className="chat-input"
            placeholder="Digite sua mensagem..."
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
          />
          <button className="btn btn-primary btn-sm" onClick={sendChatMessage}>
            →
          </button>
        </div>
      </div>

      {/* Inject video style to hide controls */}
      <style>{`
        video::-webkit-media-controls { display: none !important; }
        video::-webkit-media-controls-enclosure { display: none !important; }
        video::-webkit-media-controls-panel { display: none !important; }
        video { pointer-events: none; }
      `}</style>
    </div>
  )
}
