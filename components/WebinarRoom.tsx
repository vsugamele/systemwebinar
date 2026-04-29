'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { EventEngine } from '@/lib/event-engine'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Webinar, WebinarEvent, ChatMessage, ChatMessagePayload, OfferPopupPayload, PitchButtonPayload, ChatSegment, PollPayload } from '@/types'
import dynamic from 'next/dynamic'
import ChatPanel from './ChatPanel'
import type { Material } from './ChatPanel'
import OfferBar from './OfferBar'
import SaleToast from './SaleToast'

const WebinarQuiz = dynamic(() => import('./WebinarQuiz'), { ssr: false })
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
  bad_words_filter?: boolean
  fallback_url?: string | null
  is_panic_active?: boolean
  custom_background_url?: string | null
}

const PT_BAD_WORDS = [
  'porra', 'caralho', 'buceta', 'puta', 'merda', 'bosta', 'filho da puta', 'fdp',
  'cu', 'cú', 'arrombado', 'viado', 'corno', 'pau', 'cacete', 'caceta',
  'foder', 'foda', 'foda-se', 'fodase', 'krl', 'vtnc', 'vsf'
]

function filterBadWords(text: string): string {
  let filtered = text
  PT_BAD_WORDS.forEach(word => {
    // Escape regex chars just to be safe, though our list is safe
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    filtered = filtered.replace(regex, '***')
  })
  return filtered
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
  webinar: Webinar & WebinarConfig & { project_id?: string }
  events: WebinarEvent[]
  /** Pre-computed server-side countdown (seconds until next_scheduled_start). Prevents client flash. */
  initialCountdownSeconds?: number
  /** If true, visitor bypassed registration (active live mode) */
  guestMode?: boolean
  leadData?: { email?: string; nome?: string; phone?: string } | null
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
    // NOTE: mute=1 intentionally REMOVED — we silence via postMessage setVolume(0) instead.
    // mute=1 in the URL makes the player ignore unMute() commands, which breaks our sound button.
    // origin= is required for enablejsapi=1 postMessage events to work across origins.
    const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''
    const originParam = origin ? `&origin=${origin}` : ''
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&modestbranding=1&rel=0&disablekb=1&iv_load_policy=3&playsinline=1&fs=0&showinfo=0&enablejsapi=1${originParam}${start}`
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
    return `https://player.vimeo.com/video/${videoId}?autoplay=1&muted=1&controls=0&title=0&byline=0&portrait=0&loop=0&playsinline=1&background=1`
  } catch {
    return null
  }
}

function isVturbUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.includes('scripts.converteai.net') || url.includes('vturb')
}

function getVturbEmbedUrl(input: string): string {
  const match = input.match(/https:\/\/[^"'\s<>]+/i)
  const base = match ? match[0] : input
  return base.replace(/\/v4\/player\.js/i, '/embed.html').replace(/\/player\.js/i, '/embed.html')
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
  'Melhor aula que já assisti! 🔥',
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
  'Conteúdo de R$ 10.000 de graça!',
  'Cada minuto aqui vale muito',
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

export default function WebinarRoom({ webinar, events, initialCountdownSeconds = 0, guestMode, leadData }: Props) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const engineRef = useRef<EventEngine | null>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef(generateSessionId())

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      sectionRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }
  const broadcastTimerRef = useRef<NodeJS.Timeout | null>(null)
  const cpmTimerRef = useRef<NodeJS.Timeout | null>(null)
  const elapsedRef = useRef(0) // seconds watched (for non-YouTube videos)
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastVideoTimeRef = useRef(0)
  const supabaseRef = useRef(createClient())
  const channelRef = useRef<RealtimeChannel | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])

  // ---- Live session start tracking ----
  // We keep session_started_at in state so the component re-renders when
  // the admin starts the session (the initial prop is static / server-rendered).
  const [liveSessionStartedAt, setLiveSessionStartedAt] = useState<string | null>(
    webinar.session_started_at ?? null
  )

  // Base time for converting relative video seconds into absolute UNIX timestamps for simulated messages.
  const sessionBaseTime = useMemo(() => {
    return liveSessionStartedAt
      ? Math.floor(new Date(liveSessionStartedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000)
  }, [liveSessionStartedAt])
  
  // ---- O(1) Deduplication and Fast-Forward Buffering ----
  const messageMapRef = useRef(new Map<string, boolean>())
  const msgBufferRef = useRef<ChatMessage[]>([])
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const appendMessages = useCallback((newMsgs: ChatMessage[]) => {
    const map = messageMapRef.current
    const added: ChatMessage[] = []
    
    for (const msg of newMsgs) {
      if (!map.has(msg.id)) {
        map.set(msg.id, true)
        added.push(msg)
      }
    }
    
    if (added.length > 0) {
      setMessages(prev => {
        const combined = [...prev, ...added]
        combined.sort((a, b) => a.timestamp - b.timestamp)
        // Keep only the last 200 to avoid memory bloat
        return combined.length > 200 ? combined.slice(-200) : combined
      })
    }
  }, [])

  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [userName, setUserName] = useState('Você')

  // Set User Name for chat from localStorage OR test mode OR guest mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isTest = new URLSearchParams(window.location.search).get('test') === '1'
      const leadName = leadData?.nome || localStorage.getItem(`webi_lead_name_${webinar.id}`) || ''
      if (isTest) {
        setUserName('Você')
      } else if (guestMode) {
        setUserName(`Visitante ${sessionId.current.slice(-4).toUpperCase()}`)
      } else if (leadName) {
        setUserName(leadName)
      } else {
        setUserName('Anônimo')
      }
    }
  }, [webinar.id, guestMode, leadData])

  // ---- Webhook: webinar_assistido ----
  // Fired when the webinar starts playing (liveSessionStartedAt is set, or if fake live hasStarted is true eventually)
  // We will trigger it when liveSessionStartedAt is valid OR if there's no countdown
  useEffect(() => {
    // Determine if the webinar is currently playing for the user
    const isPlaying = !!liveSessionStartedAt || initialCountdownSeconds === 0
    
    if (isPlaying && leadData && webinar.project_id) {
      const firedKey = `webhook_assistido_${webinar.id}`
      if (!sessionStorage.getItem(firedKey)) {
        sessionStorage.setItem(firedKey, 'true')
        import('@/lib/imperio').then(({ enviarParaImperio }) => {
          enviarParaImperio('webinar_assistido', webinar.project_id!, leadData, {
            origem: 'webinar-live',
          })
        })
      }
    }
  }, [liveSessionStartedAt, initialCountdownSeconds, leadData, webinar.id, webinar.project_id])

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

  // Poll state
  const [pollVisible, setPollVisible] = useState(false)
  const [pollPayload, setPollPayload] = useState<PollPayload | null>(null)
  const [pollVotedOption, setPollVotedOption] = useState<string | null>(null)
  const [pollResults, setPollResults] = useState<Record<string, number>>({})

  // New feature state
  const [quizOpen, setQuizOpen] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [aiTyping, setAiTyping] = useState(false)
  const [saleToastActive, setSaleToastActive] = useState(false)

  // Chat identity modal (name + email capture)
  const [identityModalOpen, setIdentityModalOpen] = useState(false)
  const [identityModalName, setIdentityModalName] = useState('')
  const [identityModalEmail, setIdentityModalEmail] = useState('')
  const identityResolveRef = useRef<((value: { name: string; email: string } | null) => void) | null>(null)

  // Quiz-in-chat state
  const [quizQuestions, setQuizQuestions] = useState<Record<string, { question: string; options: string[]; correct_index: number }>>({}) // keyed by question_id
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({}) // question_id → chosen option
  const [quizVoteCounts, setQuizVoteCounts] = useState<Record<string, number[]>>({}) // question_id → count per option
  const hasQuiz = !!(webinar as unknown as Record<string, unknown>).has_quiz
  // Ref so event engine closure can access quiz questions without stale closure
  const quizQuestionsRef = useRef<Record<string, { question: string; options: string[]; correct_index: number }>>({})
  useEffect(() => { quizQuestionsRef.current = quizQuestions }, [quizQuestions])

  // Waiting room + session clock
  const brandColor = webinar.brand_color || '#6366f1'
  const startOffset = getStartOffset(webinar.session_started_at)
  const waitDelay = webinar.waiting_delay_seconds ?? 120
  const waitEnabled = !!webinar.waiting_room_enabled && startOffset > 0 && startOffset < waitDelay
  const [waitingDone, setWaitingDone] = useState(!waitEnabled)

  // YouTube overlay state
  const ytIframeRef = useRef<HTMLIFrameElement>(null)
  const [ytPlaying, setYtPlaying] = useState(false)
  // ytMuted tracks whether user has explicitly clicked to unmute
  const [ytMuted, setYtMuted] = useState(true)
  // ytKey: incrementing forces the iframe to remount (used when unmuting)
  const [ytKey, setYtKey] = useState(0)
  // When true, the next iframe load should NOT be silenced (user unmuted)
  const ytUnmutedRef = useRef(false)
  // Stable YouTube src — empty string during SSR, set on client after mount
  const [ytSrc, setYtSrc] = useState('')
  // ytIframeLoaded: true once the iframe onLoad fires — reveals the video background
  const [ytIframeLoaded, setYtIframeLoaded] = useState(false)
  const sessionOnBgRef = useRef(false)

  // Detect iOS — Safari requires user to click INSIDE the iframe to start video
  const [isIOS, setIsIOS] = useState(false)
  useEffect(() => {
    setIsIOS(
      typeof navigator !== 'undefined' &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as any).MSStream
    )
  }, [])

  // iOS state machine: poster → loading → playing
  const [iosCaptureDone, setIosCaptureDone] = useState(false) // user tapped
  const [iosLoading, setIosLoading]         = useState(false) // iframe injected, waiting for play
  // Container where we inject the iframe via DOM on iOS tap (user-gesture context)
  const iosIframeContainerRef = useRef<HTMLDivElement>(null)

  const duration = webinar.duration_seconds || 3600
  const isSessionEnded = elapsedSeconds >= duration

  // Scheduled start countdown — driven by next_scheduled_start (future occurrence)
  const nextScheduledStart = (webinar as unknown as Record<string, unknown>).next_scheduled_start as string | undefined

  // initialCountdownSeconds comes from the SERVER (computed at request time).
  // Using it directly eliminates the 0 → real-value flip that caused the flash.
  const [countdownToStart, setCountdownToStart] = useState<number>(initialCountdownSeconds)

  // A session is active only if session_started_at is set
  const hasStarted = !!liveSessionStartedAt
  // Compute startOffset from liveSessionStartedAt so it stays current
  const liveStartOffset = liveSessionStartedAt ? getStartOffset(liveSessionStartedAt) : 0
  const isSessionActive = hasStarted && elapsedSeconds >= 0 && !isSessionEnded

  // Session is "offline" when countdown > 12h or there's no next schedule and no active session
  const sessionIsOffline = !hasStarted && (!nextScheduledStart || countdownToStart > 43200)

  // Ref for use inside interval closures
  const hasStartedRef = useRef(hasStarted)
  useEffect(() => { hasStartedRef.current = hasStarted }, [hasStarted])

  // Show countdown ONLY if the session hasn't started yet OR if it ended and the next one is <= 12h away.
  const sessionIsScheduledFuture = countdownToStart > 0 && !isSessionActive && !sessionIsOffline && (!isSessionEnded || countdownToStart <= 43200)

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

  // Load quiz questions for in-chat quiz (fetched upfront so cards can render)
  useEffect(() => {
    if (!hasQuiz) return
    fetch(`/api/quiz?webinar_id=${webinar.id}`)
      .then(r => r.json())
      .then((data: { id: string; question: string; options: string[]; correct_index: number }[]) => {
        const map: Record<string, { question: string; options: string[]; correct_index: number }> = {}
        data.forEach(q => { map[q.id] = { question: q.question, options: q.options, correct_index: q.correct_index } })
        setQuizQuestions(map)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.id, hasQuiz])

  // Reveal materials as time progresses
  useEffect(() => {
    setVisibleMaterials(materials.filter(m => m.show_at_seconds <= elapsedSeconds))
  }, [elapsedSeconds, materials])

  // ---- Polling: detect when admin starts the session ----
  // Runs every 10s when session hasn't started. When session_started_at appears,
  // updates state so hasStarted/sessionBaseTime recalculate without a page reload.
  useEffect(() => {
    if (hasStarted) return // already live — nothing to poll
    const supabase = supabaseRef.current
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('webi_webinars')
        .select('session_started_at')
        .eq('id', webinar.id)
        .single()
      if (data?.session_started_at && data.session_started_at !== liveSessionStartedAt) {
        setLiveSessionStartedAt(data.session_started_at)
        // Re-seed elapsedRef so CPM starts from the correct wall-clock offset
        const newOffset = getStartOffset(data.session_started_at)
        elapsedRef.current = newOffset
        setElapsedSeconds(newOffset)
        // Reset countdown to 0 so the UI switches from "EM BREVE" to "AO VIVO"
        setCountdownToStart(0)
        clearInterval(pollInterval)
      }
    }, 10000)
    return () => clearInterval(pollInterval)
  }, [hasStarted, webinar.id, liveSessionStartedAt])

  // ---- Scheduled start countdown ticker ----
  useEffect(() => {
    if (!nextScheduledStart) return
    const targetMs = new Date(nextScheduledStart).getTime()
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000))
      setCountdownToStart(remaining)
      if (remaining === 0) {
        clearInterval(tick)
        
        // Optimistically start the session locally for an instant, seamless transition.
        // This prevents the UI from relying solely on the server response which might
        // suffer from slight clock skew.
        setLiveSessionStartedAt(nextScheduledStart)
        setElapsedSeconds(0)
        elapsedRef.current = 0

        // Delay the server refresh slightly to guarantee the server's clock has safely
        // crossed the threshold, avoiding the edge case where it returns tomorrow's schedule.
        setTimeout(() => {
          router.refresh()
        }, 3000)
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [nextScheduledStart, router])

  // ---- Fix mobile viewport height ----
  // visualViewport.height is the most accurate measure: it excludes the Android nav bar
  // overlay, on-screen keyboard, and browser chrome. Falls back to innerHeight.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const setAppHeight = () => {
      const h = window.visualViewport?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${h}px`)
    }
    setAppHeight()
    window.addEventListener('resize', setAppHeight)
    window.visualViewport?.addEventListener('resize', setAppHeight)
    return () => {
      window.removeEventListener('resize', setAppHeight)
      window.visualViewport?.removeEventListener('resize', setAppHeight)
      document.documentElement.style.removeProperty('--app-height')
    }
  }, [])

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
      '@keyframes pulse-btn {',
      '  0%, 100% { transform: scale(1); box-shadow: 0 4px 32px rgba(0,0,0,0.5); }',
      '  50% { transform: scale(1.06); box-shadow: 0 8px 40px rgba(255,255,255,0.25); }',
      '}',
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
      artist: 'Aula Ao Vivo',
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

  // ---- YouTube postMessage: detect when video starts playing ----
  // YouTube sends playerState=1 (playing) via postMessage when the user starts the video.
  // This is how we dismiss the iOS "Toque no vídeo para iniciar" overlay automatically.
  useEffect(() => {
    if (!isYouTubeUrl(webinar.video_url || '')) return
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        // playerState 1 = playing, -1 = unstarted, 0 = ended, 2 = paused, 3 = buffering
        if (data?.event === 'infoDelivery' && data?.info?.playerState === 1) {
          setYtMuted(false)
          setYtPlaying(true)
        }
      } catch { /* ignore non-JSON messages */ }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
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

  // Sync state to refs for interval closures
  const waitingDoneRef = useRef(waitingDone)
  useEffect(() => { waitingDoneRef.current = waitingDone }, [waitingDone])

  // IMPORTANT: liveSessionStartedAt is used inside a setInterval closure that is created
  // once at mount (deps=[]). Using state directly would produce a stale closure — the
  // interval would always see the initial null value even after the countdown ends and we
  // optimistically set liveSessionStartedAt. A ref solves this.
  const liveSessionStartedAtRef = useRef(liveSessionStartedAt)
  useEffect(() => { liveSessionStartedAtRef.current = liveSessionStartedAt }, [liveSessionStartedAt])
  
  const ytPlayingRef = useRef(ytPlaying)
  useEffect(() => { ytPlayingRef.current = ytPlaying }, [ytPlaying])

  // Reset ytIframeLoaded when the iframe remounts (ytKey increments)
  useEffect(() => { setYtIframeLoaded(false) }, [ytKey])

  // iOS: dismiss the loading overlay as soon as YouTube confirms it is playing
  // (ytPlaying is driven by the global postMessage listener that catches all YT iframes)
  useEffect(() => {
    if (isIOS && iosLoading && ytPlaying) {
      setIosLoading(false)
    }
  }, [isIOS, iosLoading, ytPlaying])

  // ---- Elapsed time counter (wall-clock aware) ----
  useEffect(() => {
    // Seed with startOffset so the counter reflects real session time
    elapsedRef.current = startOffset
    setElapsedSeconds(startOffset)

    const isNativeVideo = !!(
      webinar.video_url &&
      !isYouTubeUrl(webinar.video_url) &&
      !isVimeoUrl(webinar.video_url) &&
      !isVturbUrl(webinar.video_url)
    )

    elapsedIntervalRef.current = setInterval(() => {
      // Pause ticking if still in Waiting Room
      if (!waitingDoneRef.current) return

      const videoEl = videoRef.current
      let currentTick = elapsedRef.current

        if (videoEl) {
        // Native video: sync with actual playback position
        if (!videoEl.paused) currentTick = Math.floor(videoEl.currentTime)
      } else {
        // Non-native videos (YouTube, Vimeo, VTurb, etc)
        // Only advance the clock if the session has actually started.
        // Use liveSessionStartedAtRef (not the state value) to avoid stale closure:
        // this setInterval was created at mount with deps=[], so direct state access
        // would freeze on the initial null value even after an optimistic update.
        const lsa = liveSessionStartedAtRef.current
        if (lsa) {
          const wallClockTick = Math.floor((Date.now() - new Date(lsa).getTime()) / 1000)
          currentTick = Math.max(elapsedRef.current, wallClockTick)
        }
        // else: no session started yet → keep elapsed frozen at 0
      }

      elapsedRef.current = currentTick
      setElapsedSeconds(currentTick)
      engineRef.current?.tick(currentTick)

      // For non-native videos (YouTube, Vimeo, VTurb), track watch_second every 30s
      // Native videos use onTimeUpdate (every 10s) in the video setup effect
      if (!isNativeVideo && currentTick > 0 && currentTick % 30 === 0) {
        trackEvent('watch_second', currentTick)
      }

      // 30-minute milestone (fire once)
      if (currentTick === 1800) {
        trackEvent('watch_milestone_30min', currentTick)
      }
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
      if (!waitingDoneRef.current) return // Only start viewer simulation when in room
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
      const w = webinar as any;
      if (seg.phrases === 'elogios') {
        const p = w.chat_phrases_elogios as string[];
        return p?.length ? p : CHAT_PHRASES_ELOGIOS;
      }
      if (seg.phrases === 'vaga') {
        const p = w.chat_phrases_vaga as string[];
        return p?.length ? p : CHAT_PHRASES_VAGA;
      }
      if (seg.phrases === 'engajamento') {
        const p = w.chat_phrases_engajamento as string[];
        return p?.length ? p : CHAT_PHRASES_ENGAJAMENTO;
      }
      return webinar.chat_phrases?.length ? webinar.chat_phrases : GENERIC_CHAT_PHRASES;
    }

    if (segments) {
      // ---- Segment-based mode ----
      const segs: ChatSegment[] = segments
      function tick() {
        // Don't fire chat if still in waiting room OR if session hasn't started yet
        if (!waitingDoneRef.current || !hasStartedRef.current) {
          cpmTimerRef.current = setTimeout(tick, 2000)
          return
        }
        // Use wall-clock elapsed time so chat works even without video play
        const currentTime = elapsedRef.current
        // Stop firing chat messages after session ends
        if (currentTime >= (webinar.duration_seconds || 3600)) return
        const seg = findActiveSegment(segs, currentTime)

        if (!seg || seg.cpm <= 0) {
          cpmTimerRef.current = setTimeout(tick, 2000)
          return
        }

        const intervalMs = (60 / seg.cpm) * 1000
        const jitter = intervalMs * 0.35
        const delay = intervalMs + (Math.random() * jitter * 2 - jitter)

        cpmTimerRef.current = setTimeout(() => {
          if (!waitingDoneRef.current || !hasStartedRef.current) { tick(); return }
          const fireTime = elapsedRef.current
          // Guard: stop when session ended
          if (fireTime >= (webinar.duration_seconds || 3600)) return
          const activeSeg = findActiveSegment(segs, fireTime)
          if (activeSeg && activeSeg.cpm > 0) {
            const phrases = getPhrasesForSegment(activeSeg)
            const name = poolNames[Math.floor(Math.random() * poolNames.length)]
            const text = phrases[Math.floor(Math.random() * phrases.length)]
            appendMessages([{
              id: Math.random().toString(36), author: name, text,
              timestamp: sessionBaseTime + Math.floor(fireTime), isSimulated: true,
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
    const intervalMsgs = (webinar as any).chat_interval_messages as number || 1

    const intervalMs = mode === 'interval'
      ? (intervalMin * 60 * 1000) / intervalMsgs
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
        // Guard: don't fire if waiting room active OR if live session hasn't started yet
        if (!waitingDoneRef.current || !hasStartedRef.current) {
          scheduleNext()
          return
        }
        // Use wall-clock elapsed time so chat works even without video play
        const currentTime = elapsedRef.current
        // Stop firing chat messages after session ends
        if (currentTime >= (webinar.duration_seconds || 3600)) return
        if (currentTime >= startSec && currentTime <= endSec) {
          const name = poolNames[Math.floor(Math.random() * poolNames.length)]
          const text = phrases[Math.floor(Math.random() * phrases.length)]
          appendMessages([{
            id: Math.random().toString(36),
            author: name,
            text,
            timestamp: sessionBaseTime + Math.floor(currentTime),
            isSimulated: true,
          }])
        }
        scheduleNext()
      }, delay)
    }

    scheduleNext()
    return () => { if (cpmTimerRef.current) clearTimeout(cpmTimerRef.current) }
  }, [webinar.chat_cpm, webinar.chat_names, webinar.chat_mode,
      webinar.chat_interval_minutes, (webinar as any).chat_interval_messages,
      webinar.chat_start_seconds, webinar.chat_end_seconds, 
      webinar.chat_phrases, webinar.chat_segments])

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
        // Use created_at (absolute Unix epoch) so real messages sort correctly with simulated ones
        const ts = dbMsg.created_at
          ? Math.floor(new Date(dbMsg.created_at).getTime() / 1000)
          : Math.floor(Date.now() / 1000)
        appendMessages([{
          id: dbMsg.id,
          author: dbMsg.author,
          avatar: dbMsg.avatar,
          text: dbMsg.text,
          timestamp: ts,
          isSimulated: dbMsg.is_simulated || false,
          isBroadcast: dbMsg.is_broadcast || false,
        }])
      }
    })

    // Listen to webinar updates (like Panic Button)
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'webi_webinars',
      filter: `id=eq.${webinar.id}`
    }, (payload) => {
      const data = payload.new
      if (data.is_panic_active && data.fallback_url) {
        window.location.href = data.fallback_url
      }
    })

    // Listen to fallbacks/broadcasts
    channel
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        if (payload.session_id !== sessionId.current) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { session_id: _sid, ...msg } = payload as ChatMessage & { session_id: string }
          // Ensure the broadcast message also uses absolute Unix epoch timestamp
          const tsNow = Math.floor(Date.now() / 1000)
          appendMessages([{ ...msg, timestamp: (msg as ChatMessage).timestamp > 1_000_000_000 ? (msg as ChatMessage).timestamp : tsNow } as ChatMessage])
        }
      })
      .on('broadcast', { event: 'reaction' }, () => {
        // reactions removed
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      void supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [webinar.id])

  // ---- Fetch historical real messages for the current session ----
  useEffect(() => {
    if (!webinar.session_started_at) return
    
    async function fetchHistory() {
      try {
        const { data, error } = await supabaseRef.current
          .from('webi_live_chat')
          .select('*')
          .eq('webinar_id', webinar.id)
          .gte('created_at', webinar.session_started_at)
          .order('created_at', { ascending: true })
          .limit(100)
          
        if (error) throw error
          
        if (data && data.length > 0) {
          const newMessages = data.map(dbMsg => ({
            id: dbMsg.id,
            author: dbMsg.author,
            avatar: dbMsg.avatar,
            text: dbMsg.text,
            // Use absolute timestamp (created_at) so history sorts correctly with simulated messages
            timestamp: dbMsg.created_at
              ? Math.floor(new Date(dbMsg.created_at).getTime() / 1000)
              : Math.floor(Date.now() / 1000),
            isSimulated: dbMsg.is_simulated || false,
            isBroadcast: dbMsg.is_broadcast || false,
          }))
          appendMessages(newMessages)
        }
      } catch (err) {
        console.warn('Failed to fetch chat history', err)
      }
    }
    
    fetchHistory()
  }, [webinar.id, webinar.session_started_at])


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
      appendMessages([{
        id: `broadcast-${idx}`,
        author: '🛒 Notificação',
        text: `${firstName} acabou de comprar! 🎉`,
        timestamp: sessionBaseTime + Math.floor(videoRef.current?.currentTime || 0),
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

    engine.on('poll', (ev) => {
      const p = ev.payload as PollPayload
      setPollPayload(p)
      setPollVisible(true)
      setPollVotedOption(null)
      // Simulate initial votes
      const results: Record<string, number> = {}
      p.options.forEach(opt => {
        results[opt] = Math.floor(Math.random() * 15) + 3
      })
      setPollResults(results)
    })

    engine.on('chat_message', (ev) => {
      const p = ev.payload as ChatMessagePayload
      appendMessages([{
        id: ev.id,
        author: p.author,
        avatar: p.avatar,
        text: p.text,
        timestamp: sessionBaseTime + ev.timestamp_seconds,
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
        setSaleToastActive(true)
      }
    })

    engine.on('hide_pitch_button', () => {
      setPitchVisible(false)
      setSaleToastActive(false)
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current)
    })

    engine.on('quiz_question', (ev) => {
      const p = ev.payload as { question_id: string }
      const qData = quizQuestionsRef.current[p.question_id]
      if (!qData) return

      // Insert quiz card message into chat
      setMessages(m => [...m, {
        id: `quiz-${p.question_id}`,
        author: 'Quiz',
        text: '',
        timestamp: ev.timestamp_seconds,
        isSimulated: false,
        quiz_card: {
          question_id: p.question_id,
          question: qData.question,
          options: qData.options,
          correct_index: qData.correct_index,
        },
      }])

      // Simulate fake votes after 2-6s
      const numOptions = qData.options.length
      const correctIdx = qData.correct_index
      const baseVoters = Math.floor(Math.random() * 35) + 30 // 30-65 fake voters
      const rawDist = qData.options.map((_, i) => {
        if (i === correctIdx) return 0.55 + Math.random() * 0.12 // 55-67% na correta
        return (0.33 / (numOptions - 1)) * (0.6 + Math.random() * 0.8)
      })
      const totalDist = rawDist.reduce((a, b) => a + b, 0)
      const counts = rawDist.map(d => Math.max(1, Math.round((d / totalDist) * baseVoters)))

      setTimeout(() => {
        setQuizVoteCounts(prev => ({ ...prev, [p.question_id]: counts }))
      }, 2000 + Math.random() * 4000)

      // Fake voters send chat messages
      const poolNames = webinar.chat_names?.length ? webinar.chat_names : DEFAULT_NAMES
      const fakeMsgCount = Math.min(4, Math.floor(Math.random() * 3) + 2)
      for (let fi = 0; fi < fakeMsgCount; fi++) {
        setTimeout(() => {
          // Pick a random option weighted by counts
          const total = counts.reduce((a, b) => a + b, 0)
          let rnd = Math.random() * total
          let chosenOpt = 0
          for (let ci = 0; ci < counts.length; ci++) {
            rnd -= counts[ci]
            if (rnd <= 0) { chosenOpt = ci; break }
          }
          const label = String.fromCharCode(65 + chosenOpt)
          const name = poolNames[Math.floor(Math.random() * poolNames.length)]
          const texts = [`Marquei a ${label}! 🤔`, `Letra ${label} com certeza!`, `Acho que é ${label}`, `${label} pra mim!`, `Respondi ${label}`]
          const text = texts[Math.floor(Math.random() * texts.length)]
          appendMessages([{
            id: `quiz-voter-${p.question_id}-${fi}`,
            author: name,
            text,
            timestamp: sessionBaseTime + ev.timestamp_seconds,
            isSimulated: true,
          }])
        }, 3000 + fi * (800 + Math.random() * 1200))
      }
    })

    engineRef.current = engine
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  // ---- YouTube: compute iframe src only on client to avoid SSR hydration mismatch ----
  useEffect(() => {
    if (!isYouTubeUrl(webinar.video_url || '')) return
    const offset = ytKey > 0
      ? Math.floor(elapsedRef.current)
      : (startOffset > 0 ? startOffset : (webinar.evergreen_offset_seconds || 0))
    setYtSrc(getYouTubeEmbedUrl(webinar.video_url!, offset) || '')
  // startOffset intentionally excluded: we only want the src to change when ytKey changes
  // (router.refresh changes startOffset but must NOT reload the iframe mid-session)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.video_url, ytKey])

  // ---- YouTube: always-on playerState listener → drives ytPlaying state ----
  useEffect(() => {
    if (!isYouTubeUrl(webinar.video_url || '')) return
    function onMessage(e: MessageEvent) {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        // Handle both infoDelivery (polling) and onStateChange (event-driven)
        if (data?.event === 'infoDelivery' && typeof data?.info?.playerState === 'number') {
          setYtPlaying(data.info.playerState === 1)
        } else if (data?.event === 'onStateChange' && typeof data?.info === 'number') {
          // playerState 1 = playing
          setYtPlaying(data.info === 1)
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('message', onMessage)

    // Fallback: if YT never fires a playing event within 8s (e.g. blocked by browser
    // policies), force the loading overlay away so users aren't stuck.
    const fallback = setTimeout(() => {
      setYtPlaying(prev => {
        if (!prev) {
          console.warn('[WebinarRoom] YouTube playerState never received — removing loading overlay via fallback')
          return true
        }
        return prev
      })
    }, 8000)

    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(fallback)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.video_url, ytKey])

  // ---- YouTube: silence on initial load; re-runs on ytKey (iframe remount) ----
  useEffect(() => {
    if (!isYouTubeUrl(webinar.video_url || '')) return

    const shouldSilence = !ytUnmutedRef.current
    ytUnmutedRef.current = false // reset for next run

    if (!shouldSilence) return // user unmuted — don't silence, let autoplay run

    let done = false
    function post(fn: string, args: unknown[] = []) {
      ytIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: fn, args }), '*'
      )
    }
    function silence() {
      if (done) return
      post('playVideo')
      post('setVolume', [0])
    }
    const interval = setInterval(silence, 600)
    // After 5s give up silencing (player confirmed playing via the other effect)
    const timeout = setTimeout(() => {
      done = true
      clearInterval(interval)
      post('setVolume', [0])
    }, 5000)
    return () => { done = true; clearInterval(interval); clearTimeout(timeout) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.video_url, ytKey])

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
      // Enrich with Imperio HQ context if available in localStorage
      const imperioProjectId = (webinar as unknown as Record<string, unknown>).imperio_project_id as string | undefined
      const leadEmail = typeof window !== 'undefined' ? (localStorage.getItem('webi_lead_email') || '') : ''
      const leadName = typeof window !== 'undefined' ? (localStorage.getItem('webi_lead_name') || '') : ''
      const leadPhone = typeof window !== 'undefined' ? (localStorage.getItem('webi_lead_phone') || '') : ''

      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId.current,
          webinar_id: webinar.id,
          project_id: webinar.project_id,
          event_type: type,
          timestamp_video: timestampVideo,
          metadata: {
            ...metadata,
            ...(imperioProjectId ? { imperio_project_id: imperioProjectId, lead_email: leadEmail, lead_name: leadName, lead_phone: leadPhone } : {}),
          },
        }),
      })
    } catch {}
  }

  // ---- Chat message sender (called by ChatPanel.onSendMessage) ----
  async function sendChatMessage(text: string) {
    let finalText = text
    if (webinar.bad_words_filter) {
      finalText = filterBadWords(finalText)
    }

    // Show custom identity modal if name is unknown
    let currentName = userName
    const needsIdentity = currentName === 'Anônimo' || currentName.startsWith('Visitante ')
    if (needsIdentity) {
      // Pre-fill from localStorage if partial data exists
      const savedName = localStorage.getItem(`webi_lead_name_${webinar.id}`) || ''
      const savedEmail = localStorage.getItem(`webi_lead_email_${webinar.id}`) || ''
      setIdentityModalName(savedName)
      setIdentityModalEmail(savedEmail)
      setIdentityModalOpen(true)

      const identity = await new Promise<{ name: string; email: string } | null>(resolve => {
        identityResolveRef.current = resolve
      })

      if (!identity) return // user cancelled

      currentName = identity.name
      setUserName(currentName)
      localStorage.setItem(`webi_lead_name_${webinar.id}`, currentName)
      if (identity.email) {
        localStorage.setItem(`webi_lead_email_${webinar.id}`, identity.email)
      }
    }

    const msg: ChatMessage = {
      id: Math.random().toString(36),
      author: currentName,
      text: finalText,
      // Use absolute Unix epoch so this message sorts correctly with simulated messages
      timestamp: Math.floor(Date.now() / 1000),
      isSimulated: false,
    }

    // Optimistic local update
    appendMessages([msg])
    trackEvent('chat_sent', msg.timestamp)

    // Broadcast directly to other connected clients for zero-latency
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: { ...msg, session_id: sessionId.current }
      }).catch(err => console.warn('Failed to broadcast directly:', err))
    }

    // Proxy through secure API to save in database
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
              appendMessages([{
                id: `ai-${Date.now()}`,
                author: aiName,
                avatar: aiAvatar || undefined,
                text: data.answer,
                timestamp: Math.floor(Date.now() / 1000),
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
    // Trigger the webhook in the background
    fetch('/api/webhooks/pitch-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webinarId: webinar.id, sessionId: sessionId.current })
    }).catch(e => console.error('Error triggering pitch click webhook:', e))

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

  // ---- Quiz vote handler ----
  function handleQuizVote(questionId: string, optionIdx: number) {
    if (quizAnswers[questionId] !== undefined) return // already voted
    setQuizAnswers(prev => ({ ...prev, [questionId]: optionIdx }))

    // Register user's vote in the vote counts
    setQuizVoteCounts(prev => {
      const curr = prev[questionId] || []
      const updated = [...curr]
      updated[optionIdx] = (updated[optionIdx] || 0) + 1
      return { ...prev, [questionId]: updated }
    })

    // Save response to API (async, fire-and-forget)
    const qData = quizQuestionsRef.current[questionId]
    if (qData) {
      const isCorrect = optionIdx === qData.correct_index
      const score = isCorrect ? 100 : 0
      const leadName = typeof window !== 'undefined' ? (localStorage.getItem(`webi_lead_name_${webinar.id}`) || '') : ''
      const leadEmail = typeof window !== 'undefined' ? (localStorage.getItem(`webi_lead_email_${webinar.id}`) || '') : ''
      fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webinar_id: webinar.id,
          lead_name: leadName,
          lead_email: leadEmail,
          answers: [optionIdx],
          score,
          total: 1,
        }),
      }).catch(() => {})
    }
  }

  // ---- Q&A sender (called by ChatPanel.onSendQa) ----
  async function sendQaMessage(text: string) {
    let finalText = text
    if (webinar.bad_words_filter) {
      finalText = filterBadWords(finalText)
    }

    const qId = `qa-${Date.now()}`
    setQaMessages(q => [...q, { id: qId, author: userName, text: finalText }])

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

  // YouTube thumbnail for iOS poster (shows video frame so it looks live before user taps)
  const ytVideoId = webinar.video_url?.match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/)([^&?/]+)/)?.[1]
  const ytThumb   = ytVideoId ? `https://img.youtube.com/vi/${ytVideoId}/maxresdefault.jpg` : ''

  return (
    <>
      {/* IDENTITY MODAL — captures name + email before first chat message */}
      {identityModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 400,
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)', animation: 'slideUp 0.25s ease',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                Como posso te chamar?
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Preencha para participar do chat ao vivo
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                autoFocus
                type="text"
                placeholder="Seu nome *"
                value={identityModalName}
                onChange={e => setIdentityModalName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && identityModalName.trim()) {
                    setIdentityModalOpen(false)
                    identityResolveRef.current?.({ name: identityModalName.trim(), email: identityModalEmail.trim() })
                  }
                }}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: 15, outline: 'none',
                }}
              />
              <input
                type="email"
                placeholder="Seu e-mail (opcional)"
                value={identityModalEmail}
                onChange={e => setIdentityModalEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && identityModalName.trim()) {
                    setIdentityModalOpen(false)
                    identityResolveRef.current?.({ name: identityModalName.trim(), email: identityModalEmail.trim() })
                  }
                }}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: 15, outline: 'none',
                }}
              />
              <button
                disabled={!identityModalName.trim()}
                onClick={() => {
                  setIdentityModalOpen(false)
                  identityResolveRef.current?.({ name: identityModalName.trim(), email: identityModalEmail.trim() })
                }}
                style={{
                  width: '100%', padding: '13px', borderRadius: 10,
                  background: identityModalName.trim() ? 'var(--brand)' : 'var(--bg-elevated)',
                  color: identityModalName.trim() ? '#fff' : 'var(--text-muted)',
                  border: 'none', fontSize: 15, fontWeight: 700,
                  cursor: identityModalName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  marginTop: 4,
                }}
              >
                Entrar no Chat 🚀
              </button>
              <button
                onClick={() => {
                  setIdentityModalOpen(false)
                  identityResolveRef.current?.(null)
                }}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: 13, cursor: 'pointer', padding: '4px 0',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
      <div 
        className="webinar-page-wrapper" 
        data-theme={webinar.theme || 'dark'}
        style={webinar.custom_background_url ? { 
          backgroundImage: `url(${webinar.custom_background_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        } : undefined}
      >
      <div className="webinar-room">
      {/* VIDEO SECTION */}
      <div className="video-section" ref={sectionRef}>
        <div className="video-header">
          <div className="webinar-title-bar">
            {isSessionEnded ? (
              <div className="live-badge" style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)', color: '#22c55e' }}>
                <div className="live-dot" style={{ background: '#22c55e', animation: 'none', boxShadow: 'none' }} />
                ENCERRADO
              </div>
            ) : sessionIsOffline ? (
              <div className="live-badge" style={{ background: 'rgba(107,114,128,0.12)', borderColor: 'rgba(107,114,128,0.3)', color: '#9ca3af' }}>
                <div className="live-dot" style={{ background: '#4b5563', boxShadow: 'none', animation: 'none' }} />
                OFFLINE
              </div>
            ) : (
              <div className="live-badge" style={sessionIsScheduledFuture ? { background: 'rgba(156,163,175,0.15)', borderColor: 'rgba(156,163,175,0.3)' } : {}}>
                <div className="live-dot" style={sessionIsScheduledFuture ? { background: '#9ca3af', boxShadow: 'none', animation: 'none' } : {}} />
                {sessionIsScheduledFuture ? 'EM BREVE' : 'AO VIVO'}
                {!sessionIsScheduledFuture && (
                  <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 4 }}>
                    {String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:{String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
            )}
            <span style={{ 
              fontSize: 14, fontWeight: 600, 
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', 
              maxWidth: '30vw' 
            }} title={webinar.display_name || webinar.name}>
              {webinar.display_name || webinar.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!!(webinar as unknown as Record<string, unknown>).has_quiz && (
              <button
                onClick={() => setQuizOpen(true)}
                style={{
                  background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#a5b4fc',
                  cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                📝 <span className="hidden-mobile">Quiz</span>
              </button>
            )}
            <button
              onClick={toggleFullscreen}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '6px 10px', fontSize: 13, color: 'var(--text-secondary)',
                cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
              }}
              title="Alternar Tela Cheia"
            >
              ⛶ 
              <span className="hidden-mobile" style={{ fontSize: 11 }}>Expandir</span>
            </button>
            {!isSessionEnded && (
              <div className="viewer-count" style={{ marginLeft: 4 }}>
                <div className="viewer-dot" />
                <span className={viewersPulse ? 'bump-anim' : ''}>{viewers.toLocaleString()}</span>
                <span className="hidden-mobile" style={{ marginLeft: 4 }}>assistindo</span>
              </div>
            )}
          </div>
        </div>

        <div className={`video-wrapper${(webinar.video_url && (isVimeoUrl(webinar.video_url) || isVturbUrl(webinar.video_url))) ? ' video-wrapper-cover' : ''}`} style={{ position: 'relative' }}>
          {/* OFFLINE screen — no session in the next 12h */}
          {sessionIsOffline && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 25, background: '#000',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 12,
            }}>
              <div style={{ fontSize: 48 }}>📡</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '0.04em', textAlign: 'center' }}>
                Fora do Ar
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 320 }}>
                Nenhuma transmissão programada nas próximas 12 horas. Volte em breve!
              </div>
            </div>
          )}

          {/* Countdown overlay when session is scheduled for the future */}
          {sessionIsScheduledFuture && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 20, background: '#000',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 12,
            }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em' }}>
                A AULA AO VIVO COMEÇA EM
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
                Aguarde o início da aula ao vivo
              </div>
            </div>
          )}

          {/* Session Ended overlay */}
          {isSessionEnded && !sessionIsScheduledFuture && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 30, background: '#000',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 16,
            }}>
              <div style={{ fontSize: 48 }}>✅</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '0.04em', textAlign: 'center' }}>
                Transmissão Encerrada
              </div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                Obrigado por participar! Fique atento às próximas sessões.
              </div>
            </div>
          )}

          {/* Camada invisível APENAS para vídeo nativo para capturar qualquer clique/hover indevido */}
          {(!webinar.video_url || (!isYouTubeUrl(webinar.video_url) && !isVimeoUrl(webinar.video_url) && !isVturbUrl(webinar.video_url))) && (
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
          )}

          {!sessionIsScheduledFuture && webinar.video_url ? (
            isYouTubeUrl(webinar.video_url) ? (
                  <>
                    {/* ── Unified iframe (iOS + non-iOS) ───────────────────────────
                         iOS CANNOT autoplay an iframe injected programmatically, even
                         inside a user gesture. The ONLY reliable way to start a YouTube
                         video on iOS is the user tapping directly on the iframe's own
                         play button. So we keep the iframe in the DOM with
                         pointer-events:auto on iOS and guide the user with an overlay
                         label (pointer-events:none) that disappears on ytPlaying. ── */}
                    <iframe
                      key={ytKey}
                      ref={ytIframeRef}
                      src={ytSrc}
                      className="yt-iframe"
                      style={{
                        position: 'absolute', left: 0, width: '100%', border: 'none',
                        // iOS: pointer-events auto so the user's tap reaches the YT player
                        // Non-iOS: none so our overlay buttons capture the interaction
                        pointerEvents: isIOS ? 'auto' : 'none',
                      }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen={false}
                      title={webinar.name}
                      onLoad={() => setYtIframeLoaded(true)}
                    />

                    {/* ── Universal gradient masks (always visible) ────────────────
                         Reliably hides YouTube title bar (top) and watermark (bottom)
                         on every browser. CSS overflow:hidden doesn't clip GPU-composited
                         iframe layers. pointer-events:none so taps reach the iframe. ── */}
                    <>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: '18%',
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.7) 55%, transparent 100%)',
                        zIndex: 7, pointerEvents: 'none',
                      }} />
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, height: '16%',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)',
                        zIndex: 7, pointerEvents: 'none',
                      }} />
                    </>

                    {/* ── Non-iOS: spinner while iframe loads ─────────────────── */}
                    {!isIOS && !ytIframeLoaded && (
                      <div style={{
                        position: 'absolute', inset: 0, zIndex: 4,
                        background: '#000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: 14, pointerEvents: 'none',
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          border: '3px solid rgba(255,255,255,0.12)',
                          borderTopColor: 'rgba(255,255,255,0.7)',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>
                          Carregando transmissão...
                        </span>
                      </div>
                    )}

                    {/* ── Non-iOS: unmute button (shows after iframe loaded + muted) ── */}
                    {!isIOS && ytIframeLoaded && ytMuted && (
                      <div style={{
                        position: 'absolute', inset: 0, zIndex: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
                      }}>
                        <button
                          onClick={() => {
                            ytUnmutedRef.current = true
                            const lsa = liveSessionStartedAtRef.current
                            const offset = lsa
                              ? Math.floor((Date.now() - new Date(lsa).getTime()) / 1000)
                              : Math.floor(elapsedRef.current)
                            setYtSrc(getYouTubeEmbedUrl(webinar.video_url!, offset) || '')
                            setYtMuted(false)
                            setYtKey(k => k + 1)
                          }}
                          style={{
                            background: 'rgba(255,255,255,0.95)', color: '#111',
                            border: 'none', borderRadius: 50, padding: '16px 32px',
                            fontSize: 16, fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 10,
                            boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
                            animation: 'pulse-btn 1.8s ease-in-out infinite',
                          }}
                        >
                          🔊 Clique para ativar o som
                        </button>
                      </div>
                    )}

                    {/* ── iOS: instruction label ───────────────────────────────────
                         pointer-events:none — taps pass through directly to the iframe.
                         Dismissed automatically when YouTube sends playerState=1 via
                         postMessage (ytPlaying). Gradient masks above cover the branding.
                         The user taps the YouTube play button directly → video starts. ── */}
                    {isIOS && !ytPlaying && ytIframeLoaded && (
                      <div style={{
                        position: 'absolute', bottom: '20%', left: 0, right: 0,
                        zIndex: 8, display: 'flex', justifyContent: 'center',
                        pointerEvents: 'none',
                      }}>
                        <div style={{
                          background: 'rgba(0,0,0,0.72)', borderRadius: 24,
                          padding: '10px 22px', backdropFilter: 'blur(6px)',
                          fontSize: 14, fontWeight: 600, letterSpacing: '0.02em',
                          color: 'rgba(255,255,255,0.92)',
                          display: 'flex', alignItems: 'center', gap: 8,
                          boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
                        }}>
                          ▶ Toque no vídeo para iniciar
                        </div>
                      </div>
                    )}
              </>
            ) : isVimeoUrl(webinar.video_url) ? (
              <iframe
                src={getVimeoEmbedUrl(webinar.video_url) || ''}
                className="iframe-cover"
                style={{ border: 'none', pointerEvents: 'none' }}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen={false}
                title={webinar.name}
              />
            ) : isVturbUrl(webinar.video_url) ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}>
                <iframe
                  src={getVturbEmbedUrl(webinar.video_url)}
                  style={{ border: 'none', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', aspectRatio: '16/9' }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  title={webinar.name}
                />
              </div>
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
          ) : !sessionIsScheduledFuture ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48 }}>🎬</div>
              <p>Vídeo não configurado para este webinar</p>
            </div>
          ) : null}

          {/* PITCH BUTTON */}
          {pitchVisible && pitchPayload && (
            <div className="pitch-button">
              <button className="pitch-close" onClick={handleCTADismiss}>✕</button>
              {pitchPayload.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={pitchPayload.image_url} 
                  alt="Oferta" 
                  className="pitch-image" 
                  onClick={handleCTAClick}
                  style={{ cursor: 'pointer' }}
                />
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

          {/* POLL OVERLAY */}
          {pollVisible && pollPayload && (
            <div className="offer-overlay">
              <div className="offer-modal" style={{ maxWidth: 400, textAlign: 'left', padding: '24px 24px 32px 24px' }}>
                <button
                  onClick={() => setPollVisible(false)}
                  style={{
                    position: 'absolute', top: 16, right: 16,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: '50%', width: 32, height: 32,
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                  ✕
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: 'var(--brand-glow)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    📊
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#fff' }}>Enquete</h3>
                </div>
                
                <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 20, color: '#f3f4f6', lineHeight: 1.4 }}>
                  {pollPayload.question}
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pollPayload.options.map((opt, i) => {
                    const isVoted = pollVotedOption === opt
                    let totalVotes = Object.values(pollResults).reduce((a, b) => a + b, 0)
                    if (pollVotedOption) totalVotes++
                    const myVotes = (pollResults[opt] || 0) + (isVoted ? 1 : 0)
                    const pct = totalVotes > 0 ? Math.round((myVotes / totalVotes) * 100) : 0
                    
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (!pollVotedOption) {
                            setPollVotedOption(opt)
                            // Simulate small bounce of votes after clicking
                            setTimeout(() => {
                              setPollResults(prev => ({ ...prev, [opt]: (prev[opt] || 0) + 4 }))
                            }, 800)
                          }
                        }}
                        disabled={!!pollVotedOption}
                        className="poll-option-btn"
                        style={{
                          position: 'relative',
                          background: isVoted ? 'var(--brand-glow)' : 'var(--bg-elevated)',
                          border: `1px solid ${isVoted ? 'var(--brand)' : 'var(--border)'}`,
                          padding: '14px 16px',
                          borderRadius: 8,
                          cursor: pollVotedOption ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          overflow: 'hidden',
                          transition: 'all 0.2s',
                          color: '#fff',
                        }}
                      >
                        {/* Progress bar background (only shows after voting) */}
                        {pollVotedOption && (
                          <div style={{
                            position: 'absolute', top: 0, left: 0, bottom: 0,
                            width: `${pct}%`,
                            background: isVoted ? 'var(--brand-glow)' : 'rgba(255,255,255,0.06)',
                            zIndex: 1,
                            transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
                          }} />
                        )}
                        
                        <span style={{ position: 'relative', zIndex: 2, fontWeight: isVoted ? 600 : 400, color: isVoted ? 'var(--brand)' : '#d1d5db', textAlign: 'left', lineHeight: 1.3, paddingRight: 32 }}>
                          {opt}
                        </span>
                        
                        {pollVotedOption && (
                          <span style={{ position: 'relative', zIndex: 2, fontSize: 13, fontWeight: 600, color: isVoted ? 'var(--brand)' : '#9ca3af' }}>
                            {pct}%
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
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
        aiTyping={aiTyping}
        defaultTab={defaultTab}
        mobileChatOpen={mobileChatOpen}
        onSendMessage={sendChatMessage}
        onSendQa={sendQaMessage}
        quizAnswers={quizAnswers}
        quizVoteCounts={quizVoteCounts}
        onQuizVote={handleQuizVote}
      />
      {/* Mobile landscape chat toggle button */}
      <button
        className="mobile-chat-toggle"
        onClick={() => setMobileChatOpen(o => !o)}
        aria-label={mobileChatOpen ? 'Fechar chat' : 'Abrir chat'}
      >
        {mobileChatOpen ? '✕' : '💬'}
      </button>
      </div>{/* end .webinar-room */}

      {/* OFFER BAR — sticky bottom bar when pitch fires */}
      <OfferBar
        visible={pitchVisible && !!pitchPayload}
        ctaText={pitchPayload?.cta_text ?? ''}
        ctaUrl={pitchPayload?.cta_url ?? '#'}
        countdown={countdown}
        scarcitySpots={scarcitySpots}
        imageUrl={pitchPayload?.image_url}
        onCTAClick={handleCTAClick}
      />

      {/* SALE TOAST — purchase notifications bottom-left */}
      <SaleToast
        active={saleToastActive}
        namesPool={
          pitchPayload?.broadcast_names
            ? pitchPayload.broadcast_names.split(',').map(n => n.trim()).filter(Boolean)
            : webinar.chat_names?.length ? webinar.chat_names
            : DEFAULT_NAMES
        }
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
