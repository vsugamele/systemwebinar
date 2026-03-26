'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { EventEngine } from '@/lib/event-engine'
import { getPusherClient } from '@/lib/pusher'
import type { Webinar, WebinarEvent, ChatMessage, ChatMessagePayload, OfferPopupPayload, PitchButtonPayload } from '@/types'

interface Props {
  webinar: Webinar
  events: WebinarEvent[]
}

function generateSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function WebinarRoom({ webinar, events }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<EventEngine | null>(null)
  const sessionId = useRef(generateSessionId())
  const firedRef = useRef<Set<string>>(new Set())

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [userName, setUserName] = useState('Você')
  const [viewers, setViewers] = useState(webinar.peak_viewers_min)
  const [pitchVisible, setPitchVisible] = useState(false)
  const [pitchPayload, setPitchPayload] = useState<PitchButtonPayload | null>(null)
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupPayload, setPopupPayload] = useState<OfferPopupPayload | null>(null)
  const [videoError, setVideoError] = useState(false)

  // ---- Viewer counter simulation ----
  useEffect(() => {
    const min = webinar.peak_viewers_min
    const max = webinar.peak_viewers_max
    setViewers(min)
    const interval = setInterval(() => {
      setViewers(v => {
        const delta = Math.floor(Math.random() * 5) - 2
        return Math.max(min, Math.min(max, v + delta))
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [webinar])

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
      const p = ev.payload as PitchButtonPayload
      setPitchPayload(p)
      setPitchVisible(true)
      trackEvent('popup_seen', ev.timestamp_seconds, { type: 'pitch' })
    })

    engine.on('hide_pitch_button', () => {
      setPitchVisible(false)
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
      // Block seeking — restore position
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
              {viewers.toLocaleString()} assistindo
            </div>
          </div>
        </div>

        <div className="video-wrapper">
          {webinar.video_url ? (
            <video
              ref={videoRef}
              src={webinar.video_url}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                // Hide controls completely via CSS
              }}
              onError={() => setVideoError(true)}
              onContextMenu={e => e.preventDefault()}
            />
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
                <button className="pitch-cta" onClick={handleCTAClick}>
                  {pitchPayload.cta_text}
                </button>
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
            {viewers}
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 32 }}>
              Seja o primeiro a comentar! 👋
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={msg.id || i} className="chat-message">
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
              <div className="chat-msg-body">
                <div className="chat-msg-author">{msg.author}</div>
                <div className="chat-msg-text">{msg.text}</div>
              </div>
            </div>
          ))}
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
        video::--webkit-media-controls-play-button { display: none !important; }
        video { pointer-events: none; }
      `}</style>
    </div>
  )
}
