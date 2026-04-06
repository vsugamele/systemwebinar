'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { EventEngine } from '@/lib/event-engine'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Webinar, WebinarEvent, ChatMessage, ChatMessagePayload, OfferPopupPayload, PitchButtonPayload, ChatSegment } from '@/types'
import dynamic from 'next/dynamic'
import ChatPanel, { EMOJI_REACTIONS } from './ChatPanel'
import type { Material } from './ChatPanel'

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

// EMOJI_REACTIONS moved to ChatPanel.tsx

function generateSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// getInitials moved to ChatPanel.tsx

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

function isVimeoUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(u.hostname)
  } catch {
    return false
  }
}

function getVimeoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    let videoId: string | null = null

    if (u.hostname === 'player.vimeo.com') {
      videoId = u.pathname.split('/video/')[1]?.split('/')[0] ?? null
    } else {
      const parts = u.pathname.split('/').filter(Boolean)
      const last = parts[parts.length - 1] ?? null
      videoId = last && /^\d+$/.test(last) ? last : null
    }

    if (!videoId) return null
    return `https://player.vimeo.com/video/${videoId}?autoplay=1&muted=1&controls=0&title=0&byline=0&portrait=0&loop=0&playsinline=1`
  } catch {
    return null
  }
}

function isVturbUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname === 'scripts.converteai.net' || u.hostname.includes('vturb')
  } catch {
    return false
  }
}

function getVturbPlayerId(url: string): string | null {
  const match = url.match(/\/players\/([^/]+)\/player\.js/)
  return match?.[1] ?? null
}

function VturbPlayer({ scriptUrl, playerId }: { scriptUrl: string; playerId: string }) {
  useEffect(() => {
    if (document.getElementById(`scr_${playerId}`)) return

    const script = document.createElement('script')
    script.id = `scr_${playerId}`
    script.src = scriptUrl
    script.async = true
    document.head.appendChild(script)

    return () => {
      document.getElementById(`scr_${playerId}`)?.remove()
    }
  }, [scriptUrl, playerId])

  return (
    <div
      id={`vid_${playerId}`}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    />
  )
}

// ---- Chat segment helpers ----

function findActiveSegment(segments: ChatSegment[], currentTime: number): ChatSegment | null {
  return segments.find(s => currentTime >= s.from && (s.to == null || currentTime < s.to)) ?? null
}

// ---- Phrase pools (exported for use in admin UI) ----

export const CHAT_PHRASES_ELOGIOS = [
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

export const CHAT_PHRASES_VAGA = [
  'Já garanti minha vaga! 🎉',
  'Acabei de me inscrever, não podia perder!',
  'Garantindo agora mesmo! ✅',
  'Não podia deixar essa oportunidade passar',
  'Me inscrevi! Não vejo a hora de começar 🚀',
  'Vaga garantida! Valeu demais!',
  'Fiz minha inscrição agora! 🙌',
  'Essa era a oportunidade que eu esperava!',
  'Corri pra garantir antes de acabar!',
  'Inscrita! Obrigada por essa chance 💜',
  'Garanti a minha, recomendo demais!',
  'Acabei de garantir, super recomendo!',
  'Não ia deixar passar essa, garantido! 🔥',
  'Já garantido, ansioso para começar!',
  'Minha inscrição tá feita! Mal posso esperar',
  'Vagas estão indo rápido, garanta a sua!',
  'Me inscrevi assim que vi! ⚡',
  'Garanti com desconto, valeu demais!',
  'Inscrito! Esse conteúdo vale muito',
  'Garantido! Esperando com ansiedade 🎯',
]

export const CHAT_PHRASES_ENGAJAMENTO = [
  'Que dica incrível, aplicando agora mesmo!',
  'Isso resolve um problema que eu tinha faz tempo',
  'Jamais teria pensado nisso sozinho!',
  'Tomando notas aqui, tudo muito útil',
  'Isso aqui vale ouro 💰',
  'Quem mais tá anotando tudo?',
  'Conteúdo de R$10.000 de graça!',
  'Cada minuto vale muito aqui',
  'Acompanhando do trabalho, valeu demais!',
  'Entrei com dúvida e já tá sendo respondida',
  'Meu sócio precisa ver isso 😅',
  'Isso mudou meu ponto de vista completamente',
  'Estou repassando pro meu time!',
  'Conteúdo gratuito que supera muito curso pago',
  'Que aula! Obrigado mesmo 🙏',
  'Já salvei nos favoritos!',
  'Esses conceitos são ouro puro',
  'Faz sentido demais isso que você disse',
  'Aplicando na minha empresa semana que vem!',
  'Isso explicou o que li no livro mas não entendi',
]

const GENERIC_CHAT_PHRASES = [
  ...CHAT_PHRASES_ELOGIOS,
  ...CHAT_PHRASES_VAGA,
  ...CHAT_PHRASES_ENGAJAMENTO,
]

// ---- Default name pool (200 Brazilian names) ----

export const DEFAULT_NAMES = [
  'Maria Silva', 'João Santos', 'Ana Oliveira', 'Carlos Mendes', 'Luciana Costa',
  'Pedro Alves', 'Fernanda Lima', 'Rafael Souza', 'Juliana Pereira', 'Marcos Ferreira',
  'Camila Rodrigues', 'Bruno Carvalho', 'Larissa Gomes', 'Thiago Martins', 'Aline Ribeiro',
  'Diego Araújo', 'Mariana Nascimento', 'Gustavo Barbosa', 'Patrícia Melo', 'Rodrigo Vieira',
  'Letícia Pinto', 'Felipe Cavalcante', 'Vanessa Cardoso', 'Eduardo Castro', 'Priscila Monteiro',
  'Leonardo Correia', 'Tatiane Lopes', 'Vitor Rocha', 'Sandra Dias', 'André Cunha',
  'Cristina Teixeira', 'Leandro Freitas', 'Isabela Nunes', 'Maurício Borges', 'Renata Moraes',
  'Henrique Machado', 'Daiane Ramos', 'Fábio Azevedo', 'Amanda Fonseca', 'Danilo Cruz',
  'Simone Campos', 'Otávio Batista', 'Débora Pinheiro', 'Lucas Marques', 'Solange Matos',
  'Caio Moreira', 'Elaine Soares', 'Igor Medeiros', 'Raquel Vianna', 'Davi Neto',
  'Adriana Leal', 'Samuel Cavalcanti', 'Viviane Duarte', 'Renan Nogueira', 'Karina Barros',
  'Nathan Coelho', 'Mônica Pires', 'Matheus Rezende', 'Estela Queiroz', 'Cleber Andrade',
  'Tânia Figueiredo', 'Wesley Braga', 'Natália Guimarães', 'Cláudio Siqueira', 'Beatriz Paiva',
  'Edson Valente', 'Carla Vasconcelos', 'Paulo Muniz', 'Gabriela Passos', 'Wilson Lacerda',
  'Patrícia Xavier', 'Marcelo Tavares', 'Adriane Brito', 'Tiago Dias', 'Sônia Leite',
  'Breno Macedo', 'Andreia Sampaio', 'Érick Moura', 'Fabiana Cardoso', 'Diogo Costa',
  'Michele Ramos', 'Thales Mendonça', 'Rosane Alves', 'Kelvin Ferreira', 'Tereza Campos',
  'Alex Silveira', 'Cíntia Melo', 'Jonathan Farias', 'Dulce Castro', 'Robson Peixoto',
  'Valeria Alencar', 'Sandro Cunha', 'Elisa Torres', 'Evandro Machado', 'Lucia Barreto',
  'Cássio Pinto', 'Alessandra Lima', 'Walison Freitas', 'Neide Gomes', 'Renato Dias',
  'Joana Sousa', 'Flávio Brito', 'Elenice Santos', 'Nilton Rezende', 'Cristiane Ribeiro',
  'Cleverton Lopes', 'Jacqueline Vieira', 'Vinícius Souza', 'Gleice Fonseca', 'Marcio Silva',
  'Rosângela Costa', 'Hermes Rocha', 'Nayara Barbosa', 'Ubirajara Lima', 'Geovana Martins',
  'Ezequiel Nascimento', 'Verônica Araújo', 'Cézar Moreira', 'Taiana Cardoso', 'Valmir Cruz',
  'Isadora Pereira', 'Lúcio Correia', 'Marta Batista', 'Silvio Nunes', 'Jéssica Borges',
  'Mauro Monteiro', 'Celina Azevedo', 'Rinaldo Cavalcante', 'Deise Freitas', 'Edmar Ferreira',
  'Naiane Coelho', 'Adilson Barros', 'Ingrid Soares', 'Edinaldo Campos', 'Wanessa Guimarães',
  'Clóvis Vianna', 'Samara Valente', 'Hélio Muniz', 'Yara Alves', 'Rogerio Figueiredo',
  'Leila Braga', 'Odilon Moura', 'Stephany Matos', 'Adelson Lacerda', 'Lindalva Brito',
  'Gerson Pires', 'Fabíola Rezende', 'Nelson Barreto', 'Marcionila Medeiros', 'Valdeci Rocha',
  'Sueli Dias', 'Reinaldo Ferreira', 'Cláudia Gomes', 'Ronaldo Neto', 'Sílvia Costa',
  'Joaquim Barbosa', 'Dara Alves', 'Gilberto Souza', 'Estelle Lima', 'Maximiliano Ribeiro',
  'Elza Santos', 'Gerison Pereira', 'Nilza Batista', 'Claudinei Freitas', 'Ivone Cardoso',
  'Ermenegildo Cruz', 'Meirilane Nunes', 'Bertoldo Borges', 'Jaciara Monteiro', 'Arnaldo Vieira',
  'Nazareth Soares', 'Alécio Correia', 'Rosilda Ramos', 'Ednaldo Campos', 'Juraci Ferreira',
  'Everaldo Farias', 'Neuza Coelho', 'Genivaldo Barros', 'Laudelina Guimarães', 'Raimundo Pinto',
  'Tereza Paiva', 'Sebastião Muniz', 'Conceição Morais', 'Aloísio Figueiredo', 'Zélia Braga',
  'Eraldo Matos', 'Noemia Lacerda', 'Aderbal Brito', 'Isaura Pires', 'Wanderley Rezende',
  'Elzira Dias', 'Astrogildo Costa', 'Benedita Lima', 'Herculano Barbosa', 'Julieta Ribeiro',
  'Natalino Santos', 'Lurdes Alves', 'Anacleto Pereira', 'Felicidade Rocha', 'Eustáquio Gomes',
  'Aparecida Neto', 'Belarmino Batista', 'Ritinha Freitas', 'Arquimedes Cardoso', 'Creuza Cruz',
  'Almiro Nunes', 'Quitéria Borges', 'Belmiro Monteiro', 'Dulcinéia Vieira', 'Otacílio Soares',
  'Floripes Correia', 'Godofredo Ramos', 'Preciliana Campos', 'Geraldo Ferreira', 'Geralda Farias',
]

export default function WebinarRoom({ webinar, events }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
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
  const sessionOnBgRef = useRef(false)

  // Scheduled start countdown
  const [countdownToStart, setCountdownToStart] = useState(() => {
    if (!webinar.session_started_at) return 0
    return Math.max(0, Math.ceil((new Date(webinar.session_started_at).getTime() - Date.now()) / 1000))
  })
  const sessionIsScheduledFuture = countdownToStart > 0

  // Chat state (managed here, passed down to ChatPanel)
  const defaultTab = webinar.chat_default_tab ?? 'chat'
  const [qaMessages, setQaMessages] = useState<{ id: string; author: string; text: string; answered?: string }[]>([])
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

  // ---- Scheduled start countdown ticker ----
  useEffect(() => {
    if (!webinar.session_started_at) return
    const target = new Date(webinar.session_started_at).getTime()
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000))
      setCountdownToStart(remaining)
    }, 1000)
    return () => clearInterval(tick)
  }, [webinar.session_started_at])

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

  // ---- MediaSession API (background audio for native video) ----
  useEffect(() => {
    const video = videoRef.current
    const isNative = !!(webinar.video_url && !isYouTubeUrl(webinar.video_url) && !isVimeoUrl(webinar.video_url) && !isVturbUrl(webinar.video_url))
    if (!video || !isNative || !('mediaSession' in navigator)) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: webinar.display_name || webinar.name,
      artist: 'Webinar ao Vivo',
    })

    navigator.mediaSession.setActionHandler('play', () => video.play())
    navigator.mediaSession.setActionHandler('pause', null)
    navigator.mediaSession.setActionHandler('stop', null)
    navigator.mediaSession.setActionHandler('seekbackward', null)
    navigator.mediaSession.setActionHandler('seekforward', null)
    navigator.mediaSession.setActionHandler('seekto', null)

    return () => {
      ;(['play', 'pause', 'stop'] as MediaSessionAction[]).forEach(a =>
        navigator.mediaSession.setActionHandler(a, null)
      )
    }
  }, [webinar.video_url, webinar.name, webinar.display_name])

  // ---- Page Visibility: auto-resume + welcome-back toast ----
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        if (!sessionStorage.getItem('bg-audio-tip-shown')) {
          sessionStorage.setItem('bg-audio-tip-shown', '1')
          sessionOnBgRef.current = true
        }
      } else {
        const video = videoRef.current
        if (video?.paused) video.play().catch(() => {})
        if (isYouTubeUrl(webinar.video_url || '')) {
          ytIframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
          )
        }
        if (sessionOnBgRef.current) {
          sessionOnBgRef.current = false
          import('react-hot-toast').then(({ toast }) =>
            toast('👋 Bem-vindo de volta!', { duration: 2500 })
          )
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [webinar.video_url])

  // ---- Mobile tip: keep tab open for background audio (once per session) ----
  useEffect(() => {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent)
    if (!isMobile || sessionStorage.getItem('mobile-tip-shown')) return
    sessionStorage.setItem('mobile-tip-shown', '1')
    const t = setTimeout(() => {
      import('react-hot-toast').then(({ toast }) =>
        toast('🔊 Dica: mantenha a aba aberta para continuar ouvindo ao navegar', { duration: 5000 })
      )
    }, 8000)
    return () => clearTimeout(t)
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

  // ---- CPM-based chat simulation (supports segments + global mode) ----
  useEffect(() => {
    const poolNames = webinar.chat_names?.length ? webinar.chat_names : DEFAULT_NAMES
    const segments = webinar.chat_segments?.length ? webinar.chat_segments : null

    function getPhrasesForSegment(seg: ChatSegment): string[] {
      if (seg.phrases === 'elogios') return CHAT_PHRASES_ELOGIOS
      if (seg.phrases === 'vaga') return CHAT_PHRASES_VAGA
      if (seg.phrases === 'engajamento') return CHAT_PHRASES_ENGAJAMENTO
      return GENERIC_CHAT_PHRASES
    }

    if (segments) {
      // ---- Segment-based mode ----
      const segs: ChatSegment[] = segments
      function tick() {
        const currentTime = videoRef.current?.currentTime ?? 0
        const seg = findActiveSegment(segs, currentTime)

        if (!seg || seg.cpm <= 0) {
          cpmTimerRef.current = setTimeout(tick, 2000)
          return
        }

        const intervalMs = (60 / seg.cpm) * 1000
        const jitter = intervalMs * 0.35
        const delay = intervalMs + (Math.random() * jitter * 2 - jitter)

        cpmTimerRef.current = setTimeout(() => {
          const fireTime = videoRef.current?.currentTime ?? 0
          const activeSeg = findActiveSegment(segs, fireTime)
          if (activeSeg && activeSeg.cpm > 0) {
            const phrases = getPhrasesForSegment(activeSeg)
            const name = poolNames[Math.floor(Math.random() * poolNames.length)]
            const text = phrases[Math.floor(Math.random() * phrases.length)]
            setMessages(m => [...m, {
              id: Math.random().toString(36), author: name, text,
              timestamp: Math.floor(fireTime), isSimulated: true,
            }])
          }
          tick()
        }, delay)
      }
      tick()
      return () => { if (cpmTimerRef.current) clearTimeout(cpmTimerRef.current) }
    }

    // ---- Global CPM mode (fallback) ----
    const mode = webinar.chat_mode ?? 'cpm'
    const cpm = webinar.chat_cpm || 0
    const intervalMin = webinar.chat_interval_minutes ?? 5

    const intervalMs = mode === 'interval'
      ? intervalMin * 60 * 1000
      : cpm > 0 ? (60 / cpm) * 1000 : 0

    if (intervalMs <= 0) return

    const phrases = webinar.chat_phrases?.length ? webinar.chat_phrases : GENERIC_CHAT_PHRASES
    const startSec = webinar.chat_start_seconds ?? 0
    const endSec = webinar.chat_end_seconds ?? Infinity

    const jitterPct = intervalMs < 500 ? 0.15 : 0.4
    const jitter = intervalMs * jitterPct

    function scheduleNext() {
      const delay = intervalMs + (Math.random() * jitter * 2 - jitter)
      cpmTimerRef.current = setTimeout(() => {
        const currentTime = videoRef.current?.currentTime ?? 0
        if (currentTime >= startSec && currentTime <= endSec) {
          const name = poolNames[Math.floor(Math.random() * poolNames.length)]
          const text = phrases[Math.floor(Math.random() * phrases.length)]
          setMessages(m => [...m, {
            id: Math.random().toString(36),
            author: name,
            text,
            timestamp: Math.floor(currentTime),
            isSimulated: true,
          }])
        }
        scheduleNext()
      }, delay)
    }

    scheduleNext()
    return () => { if (cpmTimerRef.current) clearTimeout(cpmTimerRef.current) }
  }, [webinar.chat_cpm, webinar.chat_names, webinar.chat_mode,
      webinar.chat_interval_minutes, webinar.chat_start_seconds,
      webinar.chat_end_seconds, webinar.chat_phrases, webinar.chat_segments])

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
        image_url: p.image_url || undefined,
        link_url: p.link_url || undefined,
        link_text: p.link_text || undefined,
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

  // ---- Emoji reaction handler (called by ChatPanel.onFireReaction) ----
  function fireReaction(emoji: string) {
    setReactions(r => ({ ...r, [emoji]: (r[emoji] || 0) + 1 }))
    const id = Date.now() + Math.random()
    const x = 20 + Math.random() * 60
    setFlyingEmojis(f => [...f, { id, emoji, x }])
    setTimeout(() => setFlyingEmojis(f => f.filter(e => e.id !== id)), 2000)
    channelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji, x } })
  }

  // ---- Chat message sender (called by ChatPanel.onSendMessage) ----
  async function sendChatMessage(text: string) {
    const msg: ChatMessage = {
      id: Math.random().toString(36),
      author: userName,
      text,
      timestamp: Math.floor(videoRef.current?.currentTime || elapsedRef.current),
      isSimulated: false,
    }

    // Optimistic local update
    setMessages(m => [...m, msg])
    trackEvent('chat_sent', msg.timestamp)

    // Proxy through secure API
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...msg, webinar_id: webinar.id, session_id: sessionId.current }),
      })
    } catch (err) {
      console.warn('Failed to send message via API:', err)
    }

    // AI auto-response on questions
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

  // ---- Q&A sender (called by ChatPanel.onSendQa) ----
  async function sendQaMessage(text: string) {
    const qId = `qa-${Date.now()}`
    setQaMessages(q => [...q, { id: qId, author: userName, text }])

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
          {/* Countdown overlay when session is scheduled for the future */}
          {sessionIsScheduledFuture && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 20, background: '#000',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 12,
            }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em' }}>
                A TRANSMISSÃO COMEÇA EM
              </div>
              <div style={{ fontSize: 52, fontWeight: 800, fontFamily: 'monospace', color: '#fff', letterSpacing: '0.04em' }}>
                {(() => {
                  const h = Math.floor(countdownToStart / 3600)
                  const m = Math.floor((countdownToStart % 3600) / 60)
                  const s = countdownToStart % 60
                  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                })()}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                Aguarde o início da transmissão ao vivo
              </div>
            </div>
          )}

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
            ) : isVimeoUrl(webinar.video_url) ? (
              <iframe
                src={getVimeoEmbedUrl(webinar.video_url) || ''}
                style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen={false}
                title={webinar.name}
              />
            ) : isVturbUrl(webinar.video_url) ? (
              (() => {
                const pid = getVturbPlayerId(webinar.video_url)
                return pid ? (
                  <VturbPlayer scriptUrl={webinar.video_url} playerId={pid} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    URL do VTurb inválida
                  </div>
                )
              })()
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
                onError={(e) => console.error('Video playback error', e)}
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

      {/* CHAT SECTION — delegated to ChatPanel */}
      <ChatPanel
        messages={messages}
        qaMessages={qaMessages}
        visibleMaterials={visibleMaterials}
        materials={materials}
        elapsedSeconds={elapsedSeconds}
        flyingEmojis={flyingEmojis}
        reactions={reactions}
        aiTyping={aiTyping}
        defaultTab={defaultTab}
        onSendMessage={sendChatMessage}
        onSendQa={sendQaMessage}
        onFireReaction={fireReaction}
      />
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
