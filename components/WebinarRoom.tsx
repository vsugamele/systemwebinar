'use client'

import { useEffect, useRef, useState } from 'react'
import { EventEngine } from '@/lib/event-engine'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
// Pusher removed — real-time chat uses Supabase Broadcast
import type { Webinar, WebinarEvent, ChatMessage, ChatMessagePayload, OfferPopupPayload, PitchButtonPayload } from '@/types'
import dynamic from 'next/dynamic'

const WebinarQuiz = dynamic(() => import('./WebinarQuiz'), { ssr: false })
const TestimonialsSection = dynamic(() => import('./TestimonialsSection'), { ssr: false })
const WaitingRoom = dynamic(() => import('./WaitingRoom'), { ssr: false })

// Extend PitchButtonPayload for new fields
interface ExtendedPitchPayload extends PitchButtonPayload {
  text_above?: string
  countdown_seconds?: number
  scarcity_spots?: number
  broadcast_sales?: boolean
  broadcast_names?: string
}

interface Material {
  id: string
  label: string
  url: string
  icon: string
  show_at_seconds: number
}

interface WebinarConfig {
  chat_cpm?: number
  chat_names?: string[]
  tracking_head_code?: string
  tracking_body_code?: string
  ai_enabled?: boolean
  ai_persona_name?: string
  ai_persona_avatar?: string
  brand_color?: string
  waiting_room_enabled?: boolean
  waiting_room_message?: string
  waiting_delay_seconds?: number
  // 004
  session_started_at?: string | null
  fake_viewers_start?: number
  fake_viewers_peak?: number
  fake_viewers_end?: number
  fake_viewers_peak_at_pct?: number
  chat_default_tab?: 'chat' | 'qa'
  theme?: 'dark' | 'light' | 'youtube'
  display_name?: string
}

/** Compute seconds elapsed since session_started_at (0 if not set). */
function getStartOffset(sessionStartedAt: string | null | undefined): number {
  if (!sessionStartedAt) return 0
  const elapsed = Math.floor((Date.now() - new Date(sessionStartedAt).getTime()) / 1000)
  return Math.max(0, elapsed)
}

/** 4-phase viewer curve: ramp → peak → decline → plateau */
function getTargetViewers(
  elapsedPct: number,   // 0..1  (elapsed / duration)
  start: number,
  peak: number,
  end: number,
  peakAtPct: number,    // 0..100
): number {
  const p = elapsedPct * 100
  const peakEnd = Math.min(peakAtPct + 15, 80)
  const declineEnd = 85
  if (p <= peakAtPct) {
    const t = peakAtPct > 0 ? p / peakAtPct : 1
    return Math.round(start + (peak - start) * t)
  } else if (p <= peakEnd) {
    return peak
  } else if (p <= declineEnd) {
    const t = (p - peakEnd) / (declineEnd - peakEnd)
    return Math.round(peak + (end - peak) * t)
  } else {
    return end
  }
}

interface Props {
  webinar: Webinar & WebinarConfig
  events: WebinarEvent[]
}

const EMOJI_REACTIONS = [
  { emoji: '👍', label: 'Curtir' },
  { emoji: '❤️', label: 'Amar' },
  { emoji: '🔥', label: 'Incrível' },
  { emoji: '🤯', label: 'Surpreendente' },
  { emoji: '😂', label: 'Divertido' },
  { emoji: '🙌', label: 'Aplausos' },
]

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
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&disablekb=1&iv_load_policy=3&playsinline=1&fs=0&showinfo=0&enablejsapi=1${start}`
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
  const elapsedRef = useRef(0) // seconds watched (for non-YouTube videos)
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastVideoTimeRef = useRef(0)
  const supabaseRef = useRef(createClient())
  const channelRef = useRef<RealtimeChannel | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [userName] = useState('Você')
  const [viewers, setViewers] = useState(() => {
    const vStart = webinar.fake_viewers_start ?? 30
    return Math.max(1, vStart)
  })
  const [viewersPulse, setViewersPulse] = useState(false)
  const [pitchVisible, setPitchVisible] = useState(false)
  const [pitchPayload, setPitchPayload] = useState<ExtendedPitchPayload | null>(null)
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupPayload, setPopupPayload] = useState<OfferPopupPayload | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [scarcitySpots, setScarcitySpots] = useState(0)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  // New feature state
  const [reactions, setReactions] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    EMOJI_REACTIONS.forEach(r => { init[r.emoji] = 0 })
    return init
  })
  const [flyingEmojis, setFlyingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([])
  const [quizOpen, setQuizOpen] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [aiTyping, setAiTyping] = useState(false)

  // Waiting room + session clock
  const brandColor = webinar.brand_color || '#6366f1'
  const startOffset = getStartOffset(webinar.session_started_at)
  const waitDelay = webinar.waiting_delay_seconds ?? 120
  const waitEnabled = !!webinar.waiting_room_enabled && startOffset < waitDelay
  const [waitingDone, setWaitingDone] = useState(!waitEnabled)

  // YouTube overlay state
  const ytIframeRef = useRef<HTMLIFrameElement>(null)
  const [ytPlaying, setYtPlaying] = useState(false)
  const [ytMuted, setYtMuted] = useState(true)

  // Chat tabs
  type ChatTab = 'chat' | 'qa' | 'materials'
  const defaultTab: ChatTab = webinar.chat_default_tab ?? 'chat'
  const [chatTab, setChatTab] = useState<ChatTab>(defaultTab)
  const [qaMessages, setQaMessages] = useState<{ id: string; author: string; text: string; answered?: string }[]>([])
  const [qaInput, setQaInput] = useState('')
  const [materials, setMaterials] = useState<Material[]>([])
  const [visibleMaterials, setVisibleMaterials] = useState<Material[]>([])

  // Load materials
  useEffect(() => {
    fetch(`/api/materials?webinar_id=${webinar.id}`)
      .then(r => r.json())
      .then(data => setMaterials(data || []))
      .catch(() => {})
  }, [webinar.id])

  // Reveal materials as time progresses
  useEffect(() => {
    setVisibleMaterials(materials.filter(m => m.show_at_seconds <= elapsedSeconds))
  }, [elapsedSeconds, materials])

  // ---- Inject brand color as CSS variable ----
  useEffect(() => {
    document.documentElement.style.setProperty('--brand', brandColor)
    document.documentElement.style.setProperty('--brand-dark', brandColor)
    document.documentElement.style.setProperty('--brand-glow', `${brandColor}4d`)
    return () => {
      document.documentElement.style.removeProperty('--brand')
      document.documentElement.style.removeProperty('--brand-dark')
      document.documentElement.style.removeProperty('--brand-glow')
    }
  }, [brandColor])

  // ---- Inject animation CSS ----
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'webinar-room-animations'
    style.textContent = [
      '@keyframes emojiFloat {',
      '  0%   { transform: translateY(0) scale(1); opacity: 1; }',
      '  80%  { transform: translateY(-80px) scale(1.3); opacity: 0.8; }',
      '  100% { transform: translateY(-120px) scale(0.8); opacity: 0; }',
      '}',
      '@keyframes spin { to { transform: rotate(360deg); } }',
      'video::-webkit-media-controls { display: none !important; }',
      'video::-webkit-media-controls-enclosure { display: none !important; }',
      'video::-webkit-media-controls-panel { display: none !important; }',
      'video { pointer-events: none; }',
    ].join('\n')
    if (!document.getElementById('webinar-room-animations')) {
      document.head.appendChild(style)
    }
    return () => {
      document.getElementById('webinar-room-animations')?.remove()
    }
  }, [])

  // ---- Elapsed time counter (wall-clock aware) ----
  useEffect(() => {
    // Seed with startOffset so the counter reflects real session time
    elapsedRef.current = startOffset
    setElapsedSeconds(startOffset)
    elapsedIntervalRef.current = setInterval(() => {
      const videoEl = videoRef.current
      if (videoEl && !videoEl.paused) {
        elapsedRef.current = Math.floor(videoEl.currentTime)
      } else {
        elapsedRef.current += 1
      }
      setElapsedSeconds(elapsedRef.current)
    }, 1000)
    trackEvent('joined', 0)
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Viewer counter simulation (4-phase curve) ----
  useEffect(() => {
    const vStart  = webinar.fake_viewers_start  ?? 30
    const vPeak   = webinar.fake_viewers_peak   ?? Math.max(50, webinar.peak_viewers_max || 50)
    const vEnd    = webinar.fake_viewers_end    ?? Math.max(15, webinar.peak_viewers_min || 15)
    const peakPct = webinar.fake_viewers_peak_at_pct ?? 30
    const duration = webinar.duration_seconds || 3600

    const initial = getTargetViewers(startOffset / duration, vStart, vPeak, vEnd, peakPct)
    setViewers(initial)

    const interval = setInterval(() => {
      const elapsed = elapsedRef.current
      const pct = Math.min(elapsed / duration, 1)
      const target = getTargetViewers(pct, vStart, vPeak, vEnd, peakPct)
      // Add small noise (±2%) so the number feels organic
      const noise = Math.floor((Math.random() * 0.04 - 0.02) * target)
      const next = Math.max(1, target + noise)
      setViewers(prev => {
        if (next !== prev) {
          setViewersPulse(true)
          setTimeout(() => setViewersPulse(false), 400)
        }
        return next
      })
    }, 8000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar])

  // ---- CPM-based chat simulation ----
  useEffect(() => {
    const cpm = webinar.chat_cpm || 0
    if (cpm <= 0) return

    const poolNames = webinar.chat_names?.length ? webinar.chat_names
      : ['Maria', 'João', 'Ana', 'Carlos', 'Luciana', 'Pedro', 'Fernanda', 'Rafael']

    const intervalMs = (60 / cpm) * 1000
    const jitterPct = intervalMs < 500 ? 0.15 : 0.4
    const jitter = intervalMs * jitterPct

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

  // ---- Real-time chat + emojis (Supabase Broadcast & DB) ----
  useEffect(() => {
    const supabase = supabaseRef.current
    const channel = supabase.channel(`webinar-${webinar.id}`, {
      config: { broadcast: { self: false } },
    })

    // Listen to Database inserts on webi_live_chat
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'webi_live_chat',
      filter: `webinar_id=eq.${webinar.id}`
    }, (payload) => {
      const dbMsg = payload.new
      if (dbMsg.session_id !== sessionId.current) {
        setMessages(m => {
          // Prevent duplicates if fallback broadcast fired
          if (m.some(msg => msg.id === dbMsg.id)) return m
          return [...m, {
            id: dbMsg.id,
            author: dbMsg.author,
            avatar: dbMsg.avatar,
            text: dbMsg.text,
            timestamp: dbMsg.timestamp_video,
            isSimulated: dbMsg.is_simulated || false,
            isBroadcast: dbMsg.is_broadcast || false,
          }]
        })
      }
    })

    // Listen to fallbacks/broadcasts
    channel
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        if (payload.session_id !== sessionId.current) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { session_id: _sid, ...msg } = payload as ChatMessage & { session_id: string }
          setMessages(m => {
            if (m.some(existing => existing.id === msg.id)) return m
            return [...m, msg as ChatMessage]
          })
        }
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const { emoji, x } = payload as { emoji: string; x: number }
        const id = Date.now() + Math.random()
        setFlyingEmojis(f => [...f, { id, emoji, x }])
        setTimeout(() => setFlyingEmojis(f => f.filter(e => e.id !== id)), 2000)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      void supabase.removeChannel(channel)
      channelRef.current = null
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
      }])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  // ---- YouTube IFrame: auto-play via postMessage + detect playing state ----
  useEffect(() => {
    if (!isYouTubeUrl(webinar.video_url || '')) return

    function sendPlay() {
      ytIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        '*'
      )
    }

    // Retry play every 500ms until YouTube confirms playing
    const tryInterval = setInterval(sendPlay, 500)

    function unMute() {
      ytIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
        '*'
      )
    }

    function markPlaying() {
      setYtPlaying(true)
      clearInterval(tryInterval)
      unMute()
    }

    function onMessage(e: MessageEvent) {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (data?.event === 'infoDelivery' && data?.info?.playerState === 1) {
          markPlaying()
        }
      } catch { /* ignore */ }
    }

    // Fallback: if YouTube never confirms in 3s, show video anyway
    // (handles browsers that block postMessage responses)
    const fallbackTimeout = setTimeout(markPlaying, 3000)

    window.addEventListener('message', onMessage)
    return () => {
      clearInterval(tryInterval)
      clearTimeout(fallbackTimeout)
      window.removeEventListener('message', onMessage)
    }
  }, [webinar.video_url])

  // ---- Video setup (evergreen offset + block controls) ----
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoaded = () => {
      // Prefer session wall-clock offset; fall back to evergreen_offset_seconds
      const seekTo = startOffset > 0 ? startOffset : webinar.evergreen_offset_seconds
      if (seekTo > 0) {
        video.currentTime = seekTo
      }
    }

    const progress50FiredRef = { fired: false }

    const onTimeUpdate = () => {
      const t = Math.floor(video.currentTime)
      engineRef.current?.tick(t)

      // Track watch_second every 10s
      if (t % 10 === 0 && t > 0) {
        trackEvent('watch_second', t)
      }

      // Track progress_50 once when viewer watches past 50% of the video
      if (!progress50FiredRef.fired && video.duration > 0 && video.currentTime > video.duration * 0.5) {
        progress50FiredRef.fired = true
        trackEvent('progress_50', t)
      }
    }

    const onSeeking = () => {
      if (Math.abs(video.currentTime - lastVideoTimeRef.current) > 2) {
        video.currentTime = lastVideoTimeRef.current
      }
    }

    const onTimeUpdateStore = () => {
      lastVideoTimeRef.current = video.currentTime
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.evergreen_offset_seconds])

  async function trackEvent(type: string, timestampVideo: number, metadata: Record<string, unknown> = {}) {
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

  // ---- Emoji reaction handler ----
  function fireReaction(emoji: string) {
    setReactions(r => ({ ...r, [emoji]: (r[emoji] || 0) + 1 }))
    const id = Date.now() + Math.random()
    const x = 20 + Math.random() * 60
    setFlyingEmojis(f => [...f, { id, emoji, x }])
    setTimeout(() => setFlyingEmojis(f => f.filter(e => e.id !== id)), 2000)
    // Broadcast to other viewers
    channelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji, x } })
  }

  async function sendChatMessage() {
    if (!chatInput.trim()) return
    const text = chatInput.trim()

    const msg: ChatMessage = {
      id: Math.random().toString(36),
      author: userName,
      text,
      timestamp: Math.floor(videoRef.current?.currentTime || elapsedRef.current),
      isSimulated: false,
    }

    setMessages(m => [...m, msg])
    setChatInput('')

    trackEvent('chat_sent', msg.timestamp)

    try {
      // 1. Try DB-backed chat (Moderation ready)
      const { error } = await supabaseRef.current.from('webi_live_chat').insert({
        id: msg.id,
        webinar_id: webinar.id,
        session_id: sessionId.current,
        author: msg.author,
        text: msg.text,
        timestamp_video: msg.timestamp,
        is_simulated: false,
        is_broadcast: false,
      })

      // 2. If table doesn't exist yet, fallback to broadcast P2P
      if (error && error.code === '42P01') {
        throw new Error('Fallback')
      }
    } catch {
      // Broadcast via Supabase Realtime (legacy p2p mode)
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: { ...msg, session_id: sessionId.current },
      })
    }

    // AI auto-response if enabled and message is a question
    if (webinar.ai_enabled) {
      const isQ = text.endsWith('?') || /como|quando|qual|quanto|posso|consigo|funciona|o que|por que|porque|dúvida|ajuda|não entendi/i.test(text)
      if (isQ) {
        const aiName = webinar.ai_persona_name || '🤖 Assistente'
        const aiAvatar = webinar.ai_persona_avatar || ''
        setAiTyping(true)
        setTimeout(async () => {
          try {
            const res = await fetch('/api/ai-chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ question: text, webinar_id: webinar.id }),
            })
            const data = await res.json()
            if (data.answer) {
              setMessages(m => [...m, {
                id: `ai-${Date.now()}`,
                author: aiName,
                avatar: aiAvatar || undefined,
                text: data.answer,
                timestamp: Math.floor(elapsedRef.current),
                isSimulated: true,
              }])
            }
          } catch {}
          setAiTyping(false)
        }, 1500 + Math.random() * 1000)
      }
    }
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

  async function sendQaMessage() {
    if (!qaInput.trim()) return
    const text = qaInput.trim()
    const qId = `qa-${Date.now()}`
    setQaMessages(q => [...q, { id: qId, author: userName, text }])
    setQaInput('')

    // Try AI response if enabled
    if (webinar.ai_enabled) {
      const aiName = webinar.ai_persona_name || '🤖 Assistente'
      setAiTyping(true)
      setTimeout(async () => {
        try {
          const res = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: text, webinar_id: webinar.id }),
          })
          const data = await res.json()
          if (data.answer) {
            setQaMessages(q => q.map(m => m.id === qId ? { ...m, answered: `${aiName}: ${data.answer}` } : m))
          }
        } catch {}
        setAiTyping(false)
      }, 1500 + Math.random() * 1000)
    }
  }

  return (
    <>
      {/* WAITING ROOM — shown before entering if enabled */}
      {!waitingDone && (
        <WaitingRoom
          message={webinar.waiting_room_message || 'O webinar começa em instantes! Prepare-se. 🚀'}
          delaySeconds={waitDelay}
          startOffset={startOffset}
          webinarName={webinar.name}
          brandColor={brandColor}
          onEnter={() => setWaitingDone(true)}
        />
      )}

      {/* MAIN ROOM — shown after waiting */}
      {waitingDone && (
      <>
      <div className="webinar-page-wrapper" data-theme={webinar.theme || 'dark'}>
      <div className="webinar-room">
      {/* VIDEO SECTION */}
      <div className="video-section">
        <div className="video-header">
          <div className="webinar-title-bar">
            <div className="live-badge">
              <div className="live-dot" />
              AO VIVO
              <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 4 }}>
                {String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:{String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
              </span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{webinar.display_name || webinar.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setQuizOpen(true)}
              style={{
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#a5b4fc',
                cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              📝 Quiz
            </button>
            <div className="viewer-count">
              <div className="viewer-dot" />
              <span className={viewersPulse ? 'bump-anim' : ''}>{viewers.toLocaleString()}</span> assistindo
            </div>
          </div>
        </div>

        <div className="video-wrapper" style={{ position: 'relative' }}>
          {/* Camada invisível para capturar qualquer clique/hover indevido */}
          <div 
            style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'transparent' }}
            onClick={(e) => {
              e.preventDefault();
              if (videoRef.current && videoRef.current.paused) {
                videoRef.current.play().catch(() => {});
              }
            }}
            onContextMenu={e => e.preventDefault()}
          />

          {webinar.video_url ? (
            isYouTubeUrl(webinar.video_url) ? (
              <>
                <iframe
                  ref={ytIframeRef}
                  src={getYouTubeEmbedUrl(webinar.video_url, startOffset > 0 ? startOffset : webinar.evergreen_offset_seconds) || ''}
                  style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen={false}
                  title={webinar.name}
                />
                {/* Overlay preto cobre thumbnail até o vídeo começar */}
                {!ytPlaying && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 3,
                    background: '#000',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 14, pointerEvents: 'none',
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      border: '3px solid rgba(255,255,255,0.15)',
                      borderTopColor: '#fff',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>
                      Carregando transmissão...
                    </span>
                  </div>
                )}
                {/* Botão de ativar som — aparece assim que o vídeo começa (mutado) */}
                {ytPlaying && ytMuted && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 3,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.55)',
                  }}>
                    <button
                      onClick={() => {
                        ytIframeRef.current?.contentWindow?.postMessage(
                          JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*'
                        )
                        setYtMuted(false)
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.95)', color: '#111',
                        border: 'none', borderRadius: 50, padding: '14px 28px',
                        fontSize: 15, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      🔊 Clique para ativar o som
                    </button>
                  </div>
                )}
                {/* Cobrir barra inferior e cantos do YouTube quando estiver tocando */}
                {ytPlaying && (
                  <>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: '#000', zIndex: 2, pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 200, height: 40, background: '#000', zIndex: 2, pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 160, height: 40, background: '#000', zIndex: 2, pointerEvents: 'none' }} />
                  </>
                )}
              </>
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
                  pointerEvents: 'none',
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
                // eslint-disable-next-line @next/next/no-img-element
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
                  // eslint-disable-next-line @next/next/no-img-element
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
        {/* TABS HEADER */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
        }}>
          {([
            { id: 'chat', label: '💬 Chat', count: messages.filter(m => !m.isBroadcast).length },
            { id: 'qa', label: '❓ Q&A', count: qaMessages.length },
            ...(visibleMaterials.length > 0 || materials.length > 0
              ? [{ id: 'materials' as const, label: '📂 Materiais', count: visibleMaterials.length }]
              : []),
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setChatTab(tab.id)}
              style={{
                flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 600,
                background: 'none', border: 'none', cursor: 'pointer',
                color: chatTab === tab.id ? 'var(--brand)' : 'var(--text-muted)',
                borderBottom: chatTab === tab.id ? '2px solid var(--brand)' : '2px solid transparent',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  background: chatTab === tab.id ? 'var(--brand)' : 'var(--border)',
                  color: chatTab === tab.id ? '#fff' : 'var(--text-muted)',
                  borderRadius: 99, padding: '0px 6px', fontSize: 10, fontWeight: 700,
                }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* CHAT TAB */}
        {chatTab === 'chat' && (
          <div className="chat-messages">
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 32 }}>
                Seja o primeiro a comentar! 👋
              </div>
            )}
            {messages.map((msg, i) => {
              const isBroadcast = msg.isBroadcast
              const isAi = msg.author?.startsWith('🤖')
              return (
                <div key={msg.id || i} className="chat-message" style={isBroadcast ? {
                  background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: '6px 8px',
                  border: '1px solid rgba(34,197,94,0.2)', margin: '2px 0'
                } : isAi ? {
                  background: 'rgba(99,102,241,0.08)', borderRadius: 8, padding: '6px 8px',
                  border: '1px solid rgba(99,102,241,0.2)', margin: '2px 0'
                } : {}}>
                  {!isBroadcast && (
                    <div
                      className="chat-avatar"
                      style={{
                        background: isAi ? 'var(--brand)'
                          : msg.isSimulated
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
                    {!isBroadcast && <div className="chat-msg-author" style={isAi ? { color: 'var(--brand)' } : {}}>{msg.author}</div>}
                    <div className="chat-msg-text" style={isBroadcast ? { color: 'var(--success)', fontWeight: 600 } : {}}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              )
            })}
            {aiTyping && (
              <div className="chat-message" style={{ background: 'rgba(99,102,241,0.05)', borderRadius: 8, padding: '6px 8px' }}>
                <div className="chat-avatar" style={{ background: 'var(--brand)' }}>🤖</div>
                <div>
                  <div className="chat-msg-author" style={{ color: 'var(--brand)' }}>🤖 Assistente</div>
                  <div className="chat-msg-text" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>digitando...</div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Q&A TAB */}
        {chatTab === 'qa' && (
          <div className="chat-messages">
            {qaMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 32, lineHeight: 1.6 }}>
                ❓ Envie sua dúvida aqui<br />
                <span style={{ fontSize: 11 }}>A IA ou o apresentador irá responder</span>
              </div>
            )}
            {qaMessages.map(q => (
              <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: q.answered ? 6 : 0 }}>
                  <div className="chat-avatar" style={{ background: 'var(--brand)', flexShrink: 0 }}>
                    {getInitials(q.author)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="chat-msg-author">{q.author}</div>
                    <div className="chat-msg-text">{q.text}</div>
                  </div>
                </div>
                {q.answered && (
                  <div style={{
                    marginLeft: 40, background: 'rgba(99,102,241,0.08)',
                    borderLeft: '3px solid var(--brand)',
                    padding: '8px 10px', borderRadius: '0 8px 8px 0',
                    fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700, display: 'block', marginBottom: 2 }}>🤖 Assistente</span>
                    {q.answered}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* MATERIALS TAB */}
        {chatTab === 'materials' && (
          <div className="chat-messages">
            {visibleMaterials.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 32, lineHeight: 1.6 }}>
                📂 Nenhum material disponível ainda<br />
                <span style={{ fontSize: 11 }}>Os materiais serão liberados durante o webinar</span>
              </div>
            )}
            {visibleMaterials.map(m => (
              <a
                key={m.id}
                href={m.url}
                target="_blank"
                rel="noopener"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                  borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--bg-card)', margin: '4px 0',
                  transition: 'border-color 0.15s', textDecoration: 'none',
                }}
                onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--brand)')}
                onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <span style={{ fontSize: 24 }}>{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Clique para baixar / acessar</div>
                </div>
                <span style={{ fontSize: 18, color: 'var(--brand)' }}>↗</span>
              </a>
            ))}
            {materials.filter(m => m.show_at_seconds > elapsedSeconds).length > 0 && (
              <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                🔒 {materials.filter(m => m.show_at_seconds > elapsedSeconds).length} material(is) ainda serão liberados...
              </div>
            )}
          </div>
        )}

        {/* EMOJI REACTIONS — só na aba chat */}
        {chatTab === 'chat' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
            borderTop: '1px solid var(--border)', background: 'var(--bg-card)',
            position: 'relative', overflow: 'hidden', flexWrap: 'wrap',
          }}>
            {flyingEmojis.map(fe => (
              <span key={fe.id} style={{
                position: 'absolute', bottom: '100%', left: `${fe.x}%`,
                fontSize: 22, animation: 'emojiFloat 2s ease-out forwards',
                pointerEvents: 'none', userSelect: 'none',
              }}>{fe.emoji}</span>
            ))}
            {EMOJI_REACTIONS.map(r => (
              <button
                key={r.emoji}
                title={r.label}
                onClick={() => fireReaction(r.emoji)}
                style={{
                  background: reactions[r.emoji] > 0 ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: `1px solid ${reactions[r.emoji] > 0 ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                  borderRadius: 99, padding: '3px 9px', cursor: 'pointer',
                  fontSize: 15, display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s ease', userSelect: 'none',
                }}
              >
                {r.emoji}
                {reactions[r.emoji] > 0 && (
                  <span style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 700 }}>
                    {reactions[r.emoji]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* DYNAMIC INPUT BY TAB */}
        <div className="chat-input-area">
          {chatTab === 'chat' && (
            <>
              <input
                type="text"
                className="chat-input"
                placeholder="Digite sua mensagem..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
              />
              <button className="btn btn-primary btn-sm" onClick={sendChatMessage}>→</button>
            </>
          )}
          {chatTab === 'qa' && (
            <>
              <input
                type="text"
                className="chat-input"
                placeholder="Envie sua dúvida..."
                value={qaInput}
                onChange={e => setQaInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendQaMessage()}
              />
              <button className="btn btn-primary btn-sm" onClick={sendQaMessage}>→</button>
            </>
          )}
          {chatTab === 'materials' && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
              🔒 Materiais são liberados pelo apresentador durante o webinar
            </div>
          )}
        </div>
      </div>{/* end .chat-section */}
      </div>{/* end .webinar-room */}

      {/* TESTIMONIALS SECTION — full width below the main grid */}
      <TestimonialsSection
        webinarId={webinar.id}
        webinarName={webinar.name}
        currentTime={elapsedSeconds}
      />

      {/* QUIZ MODAL */}
      <WebinarQuiz
        webinarId={webinar.id}
        webinarName={webinar.name}
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
      />

      </div>
      </>
      )}
    </>
  )
}
