'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { EventEngine } from '@/lib/event-engine'
import {
  getAnalyticsTimestamp,
  getSessionModeFromPath,
  shouldEmitProgress50,
  shouldEmitProgressMilestone,
  shouldEmitWatchSample,
} from '@/lib/analytics-metrics.mjs'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Webinar, WebinarEvent, ChatMessage, ChatMessagePayload, OfferPopupPayload, PitchButtonPayload, ChatSegment, PollPayload, PinnedMessagePayload } from '@/types'
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
  current_run_id?: string | null
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
  video_orientation?: 'horizontal' | 'vertical'
  disable_qa?: boolean
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

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatSubscriberCount(peak: number): string {
  const subs = Math.max(12400, peak * 12);
  if (subs >= 1000000) {
    return (subs / 1000000).toFixed(1).replace('.', ',') + ' mi';
  }
  if (subs >= 1000) {
    return Math.round(subs / 1000) + ' mil';
  }
  return subs.toString();
}

function formatLikeCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace('.', ',') + ' mi';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace('.', ',') + ' mil';
  }
  return count.toString();
}

function formatCountdown(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Helper to extract URL from an iframe embed code */
function extractSrcFromIframe(input: string): string {
  if (!input) return ''
  if (input.includes('<iframe') && input.includes('src=')) {
    const match = input.match(/src=["']([^"']+)["']/)
    if (match) return match[1]
  }
  return input
}

/** Extracts video ID from any YouTube URL or iframe embed code */
function getYouTubeVideoId(url: string): string | null {
  try {
    const cleanUrl = extractSrcFromIframe(url)
    const u = new URL(cleanUrl)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1)
    if (['www.youtube.com','youtube.com','m.youtube.com'].includes(u.hostname)) {
      const v = u.searchParams.get('v')
      if (v) return v
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1]?.split('?')[0] ?? null
    }
    return null
  } catch { return null }
}

/** Converts any YouTube watch/share URL into an embed URL */
function getYouTubeEmbedUrl(url: string, startSeconds = 0): string | null {
  const videoId = getYouTubeVideoId(url)
  if (!videoId) return null
  const start = startSeconds > 0 ? `&start=${startSeconds}` : ''
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&disablekb=1&iv_load_policy=3&playsinline=1&fs=0&showinfo=0&enablejsapi=1${start}`
}

function isYouTubeUrl(url: string): boolean {
  try {
    const cleanUrl = extractSrcFromIframe(url)
    const u = new URL(cleanUrl)
    return ['youtu.be', 'www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname)
  } catch {
    return false
  }
}

function isVimeoUrl(url: string): boolean {
  try {
    const cleanUrl = extractSrcFromIframe(url)
    const u = new URL(cleanUrl)
    return ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(u.hostname)
  } catch {
    return false
  }
}

function getVimeoEmbedUrl(url: string, startSeconds = 0): string | null {
  try {
    const cleanUrl = extractSrcFromIframe(url)
    const u = new URL(cleanUrl)
    let videoId: string | null = null
    let hashParam = ''

    if (u.hostname === 'player.vimeo.com') {
      videoId = u.pathname.split('/video/')[1]?.split('/')[0] ?? null
      hashParam = u.searchParams.get('h') ? `&h=${u.searchParams.get('h')}` : ''
    } else {
      const parts = u.pathname.split('/').filter(Boolean)
      const last = parts[parts.length - 1] ?? null
      videoId = last && /^\d+$/.test(last) ? last : null
      // handle hash-based unlisted videos: vimeo.com/123456/abcdef
      if (parts.length >= 2 && /^[a-f0-9]+$/.test(parts[parts.length - 1] ?? '')) {
        videoId = parts[parts.length - 2] ?? null
        hashParam = `&h=${parts[parts.length - 1]}`
      }
    }

    if (!videoId) return null
    const startParam = startSeconds > 0 ? `#t=${startSeconds}s` : ''
    // muted=1, background=0 (background mode disables all API events)
    // api=1 enables postMessage events for play/pause/mute control
    return `https://player.vimeo.com/video/${videoId}?autoplay=1&muted=1&controls=0&title=0&byline=0&portrait=0&loop=0&playsinline=1&transparent=0&api=1${hashParam}${startParam}`
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

const YouTubeHeader = ({ userName }: { userName: string }) => {
  return (
    <header style={{
      height: 56,
      background: '#0f0f0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      color: '#fff',
      userSelect: 'none',
      flexShrink: 0,
      zIndex: 100,
    }}>
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }} disabled>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M21 6H3V5h18v1zm0 5H3v1h18v-1zm0 6H3v1h18v-1z" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 'bold', fontSize: 18, color: '#fff', letterSpacing: '-0.5px' }}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="#FF0000" style={{ display: 'block' }}>
            <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.524 3.545 12 3.545 12 3.545s-7.524 0-9.388.51a3.002 3.002 0 0 0-2.11 2.108C0 8.029 0 12 0 12s0 3.971.502 5.837a3.003 3.003 0 0 0 2.11 2.108c1.864.51 9.388.51 9.388.51s7.524 0 9.388-.51a3.002 3.002 0 0 0 2.11-2.108c.502-1.866.502-5.837.502-5.837s0-3.971-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <span style={{ fontFamily: '"Roboto", sans-serif', fontWeight: 900, fontSize: 18, letterSpacing: '-0.8px' }}>YouTube</span>
          <span style={{ fontSize: 10, color: '#aaaaaa', alignSelf: 'flex-start', marginTop: 2, marginLeft: 2, fontWeight: 400 }}>Premium</span>
          <span style={{ fontSize: 9, background: '#FF0000', color: '#fff', padding: '1px 4px', borderRadius: 2, marginLeft: 6, fontWeight: 700, letterSpacing: '0px' }}>AO VIVO</span>
        </div>
      </div>

      {/* Center: Search */}
      <div className="hidden-mobile" style={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: 600, margin: '0 16px' }}>
        <div style={{ display: 'flex', flex: 1, background: '#121212', borderRadius: '40px 0 0 40px', border: '1px solid #303030', borderRight: 'none', padding: '0 16px', height: 40, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Pesquisar"
            style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', fontSize: 14 }}
            disabled
          />
        </div>
        <button style={{ width: 64, height: 40, background: '#222222', border: '1px solid #303030', borderRadius: '0 40px 40px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }} disabled>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
        </button>
        <button style={{ width: 40, height: 40, background: '#272727', border: 'none', borderRadius: '50%', marginLeft: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }} disabled>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
          </svg>
        </button>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Criar" disabled>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z" />
          </svg>
        </button>
        <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Notificações" disabled>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
          </svg>
        </button>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 13, marginLeft: 8 }}>
          {getInitials(userName)}
        </div>
      </div>
    </header>
  )
}

export default function WebinarRoom({ webinar, events, initialCountdownSeconds = 0, guestMode, leadData }: Props) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const engineRef = useRef<EventEngine | null>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef(generateSessionId())
  const sentEmailsRef = useRef<Set<string>>(new Set())

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      sectionRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

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
  const broadcastTimerRef = useRef<NodeJS.Timeout | null>(null)
  const cpmTimerRef = useRef<NodeJS.Timeout | null>(null)
  const elapsedRef = useRef(0) // seconds watched (for non-YouTube videos)
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastVideoTimeRef = useRef(0)
  const joinedTrackedRef = useRef(false)
  const progress50FiredRef = useRef(false)
  const progressMilestonesFiredRef = useRef<Set<number>>(new Set())
  const milestone30FiredRef = useRef(false)
  const sentWatchSecondsRef = useRef<Set<number>>(new Set())
  const supabaseRef = useRef(createClient())
  const channelRef = useRef<RealtimeChannel | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [isBanned, setIsBanned] = useState(false)

  useEffect(() => {
    async function checkAdminAndBan() {
      // 1. Check URL query parameter for admin mode
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get('admin') === '1' || urlParams.get('test') === '1') {
          setIsAdmin(true)
        }
      }

      // 2. Check Supabase session (admins are authenticated users)
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      if (user) {
        setIsAdmin(true)
      }

      // 3. Check if current lead is banned
      const leadEmail = typeof window !== 'undefined' ? (localStorage.getItem(`webi_lead_email_${webinar.id}`) || '') : ''
      if (leadEmail) {
        const { data: ban } = await supabaseRef.current
          .from('webi_banned_leads')
          .select('id')
          .eq('webinar_id', webinar.id)
          .eq('lead_email', leadEmail.trim())
          .maybeSingle()
        if (ban) {
          setIsBanned(true)
        }
      }
    }
    checkAdminAndBan()
  }, [webinar.id])

  // ---- Live session start tracking ----
  // We keep session_started_at in state so the component re-renders when
  // the admin starts the session (the initial prop is static / server-rendered).
  const [liveSessionStartedAt, setLiveSessionStartedAt] = useState<string | null>(
    webinar.session_started_at ?? null
  )
  const [currentRunId, setCurrentRunId] = useState<string | null>(
    webinar.current_run_id ?? null
  )

  // Base time for converting relative video seconds into absolute UNIX timestamps for simulated messages.
  const sessionBaseTime = useMemo(() => {
    if (webinar.is_evergreen) {
      return Math.floor(Date.now() / 1000)
    }
    return liveSessionStartedAt
      ? Math.floor(new Date(liveSessionStartedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000)
  }, [liveSessionStartedAt, webinar.is_evergreen])
  
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

  const [realOnlineCount, setRealOnlineCount] = useState(0)
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
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [hasLiked, setHasLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(() => {
    const vPeak = webinar.fake_viewers_peak ?? Math.max(50, webinar.peak_viewers_max || 50)
    const base = vPeak * 2.4
    return Math.floor(base + Math.random() * (base * 0.15))
  })

  const handleLike = () => {
    if (hasLiked) {
      setLikeCount(prev => prev - 1)
      setHasLiked(false)
    } else {
      setLikeCount(prev => prev + 1)
      setHasLiked(true)
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsSubscribed(localStorage.getItem(`yt_subscribed_${webinar.id}`) === 'true')
    }
  }, [webinar.id])

  const toggleSubscribe = () => {
    const nextVal = !isSubscribed
    setIsSubscribed(nextVal)
    localStorage.setItem(`yt_subscribed_${webinar.id}`, nextVal ? 'true' : 'false')
  }

  const [quizOpen, setQuizOpen] = useState(false)
  // Seed elapsedSeconds with the real start offset so isSessionEnded is correct
  // from the very first render. Without this, the video player initialises and
  // starts auto-playing before the elapsed counter effect can set the true value,
  // causing audio to leak through the "Encerrado" overlay when a lead returns.
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (typeof window === 'undefined') return 0
    const sp = new URLSearchParams(window.location.search)
    const t = sp.get('t')
    const dt = sp.get('dev_t')
    const tOff = t ? parseInt(t) : null
    const dtOff = dt ? parseInt(dt) * 60 : null
    const override = tOff !== null ? tOff : (dtOff !== null ? dtOff : 0)
    if (override > 0) return override
    if (webinar.is_evergreen) return 0
    return getStartOffset(webinar.session_started_at)
  })
  const [actualDuration, setActualDuration] = useState<number | null>(null)
  const [aiTyping, setAiTyping] = useState(false)
  const aiTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saleToastActive, setSaleToastActive] = useState(false)

  // Pinned message state
  const [pinnedMessage, setPinnedMessage] = useState<{ text: string; author?: string } | null>(null)
  const pinnedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const tMatch = searchParams?.get('t')
  const devTMatch = searchParams?.get('dev_t')
  
  // Priority: 
  // 1. ?t=X (seconds)
  // 2. ?dev_t=X (minutes)
  // 3. Normal scheduled time
  const tOffset = tMatch ? parseInt(tMatch) : null
  const devOffset = devTMatch ? parseInt(devTMatch) * 60 : null
  
  const startOffsetOverride = tOffset !== null ? tOffset : (devOffset !== null ? devOffset : 0)
  
  // isDevMode: true when ?t or ?dev_t is explicitly present in the URL.
  // Only affects the local developer/admin view — leads arriving without these
  // params always follow the normal scheduling logic.
  const isDevMode = tOffset !== null || devOffset !== null
  
  const startOffset = startOffsetOverride > 0
    ? startOffsetOverride
    : (webinar.is_evergreen ? 0 : getStartOffset(webinar.session_started_at))
  const waitDelay = webinar.waiting_delay_seconds ?? 120
  const waitEnabled = !!webinar.waiting_room_enabled && startOffset > 0 && startOffset < waitDelay
  const [waitingDone, setWaitingDone] = useState(!waitEnabled)

  // ---- YouTube Player API state ----
  // ytPlayerRef: holds the YT.Player instance from the official Iframe API
  // Using the API directly (vs postMessage strings) gives us reliable unMute/setVolume on iOS
  const ytPlayerRef   = useRef<any>(null)
  const ytWrapperRef  = useRef<HTMLDivElement>(null)
  const ytUnmuteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ytPlaying, setYtPlaying]     = useState(false)
  const [ytBuffering, setYtBuffering] = useState(false)
  const [ytMuted, setYtMuted]         = useState(true)
  const [ytIframeLoaded, setYtIframeLoaded] = useState(false)
  // Once the video plays for the first time, keep this true forever.
  // This prevents the black poster overlay from covering the video during
  // mid-session pauses or re-buffers (e.g. at ~51min when YouTube re-buffers).
  const [ytEverPlayed, setYtEverPlayed] = useState(false)
  const ytStartOffset = useRef(0)

  // ---- Vimeo state ----
  const vimeoIframeRef = useRef<HTMLIFrameElement>(null)
  const [vimeoMuted, setVimeoMuted] = useState(true)
  const [vimeoPlaying, setVimeoPlaying] = useState(false)
  const [vimeoBuffering, setVimeoBuffering] = useState(false)
  const [vimeoIframeLoaded, setVimeoIframeLoaded] = useState(false)
  const [vimeoSrc, setVimeoSrc] = useState('')
  const sessionOnBgRef = useRef(false)
  const playStartedRef = useRef(false)
  const vimeoTimeRef = useRef(0)

  // ---- Native Video state ----
  const [nativeMuted, setNativeMuted] = useState(true)

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

  // Delayed masks: show for 1.8s every time ytPlaying transitions to true.
  // This covers YouTube's native title bar fade-out on EVERY play/resume
  // (including after screen lock/unlock on iOS).
  const [ytBrandingMasksVisible, setYtBrandingMasksVisible] = useState(true)
  useEffect(() => {
    if (!ytPlaying) {
      // Reset masks immediately when paused so they are ready for next play
      setYtBrandingMasksVisible(true)
      return
    }
    // Video is playing: keep masks for 1.8s then fade out
    const timer = setTimeout(() => setYtBrandingMasksVisible(false), 1800)
    return () => clearTimeout(timer)
  }, [ytPlaying])

  const duration = actualDuration || webinar.duration_seconds || 14400
  const isSessionEnded = elapsedSeconds >= duration

  const getCurrentAnalyticsTimestamp = useCallback(() => {
    return getAnalyticsTimestamp(videoRef.current?.currentTime, elapsedRef.current)
  }, [])

  const trackJoinedOnce = useCallback((metadata: Record<string, unknown>) => {
    if (joinedTrackedRef.current) return
    joinedTrackedRef.current = true
    trackEvent('joined', 0, metadata)
  }, [])

  const trackWatchSample = useCallback((currentTick: number, intervalSeconds: number) => {
    if (!shouldEmitWatchSample(currentTick, intervalSeconds, sentWatchSecondsRef.current)) return
    trackEvent('watch_second', currentTick, { watch_delta_seconds: intervalSeconds })
  }, [])

  const trackProgress50Once = useCallback((currentTick: number, durationOverride = duration) => {
    if (!shouldEmitProgress50(currentTick, durationOverride, progress50FiredRef.current)) return
    progress50FiredRef.current = true
    trackEvent('progress_50', currentTick)
  }, [duration])

  const trackProgressMilestones = useCallback((currentTick: number, durationOverride = duration) => {
    ;([25, 75, 90] as const).forEach(milestone => {
      if (shouldEmitProgressMilestone(currentTick, durationOverride, milestone, progressMilestonesFiredRef.current)) {
        trackEvent(`progress_${milestone}`, currentTick)
      }
    })
  }, [duration])

  const trackPlayStartedOnce = useCallback(() => {
    if (playStartedRef.current) return
    playStartedRef.current = true
    trackEvent('play_started', Math.max(0, elapsedSeconds))
  }, [elapsedSeconds])

  const isSessionEndedRef = useRef(isSessionEnded)
  useEffect(() => {
    isSessionEndedRef.current = isSessionEnded
  }, [isSessionEnded])

  // Scheduled start countdown — driven by next_scheduled_start (future occurrence)
  const nextScheduledStart = (webinar as unknown as Record<string, unknown>).next_scheduled_start as string | undefined

  // initialCountdownSeconds comes from the SERVER (computed at request time).
  // Using it directly eliminates the 0 → real-value flip that caused the flash.
  const [countdownToStart, setCountdownToStart] = useState<number>(initialCountdownSeconds)

  // A session is active only if session_started_at is set — OR if we are in dev mode
  // (the developer is testing with ?t= or ?dev_t= even without an active session).
  const hasStarted = !!liveSessionStartedAt || isDevMode
  // Compute startOffset from liveSessionStartedAt so it stays current
  const liveStartOffset = liveSessionStartedAt ? getStartOffset(liveSessionStartedAt) : 0
  // In dev mode, never mark session as ended — the developer is previewing the room.
  const isSessionActive = hasStarted && elapsedSeconds >= 0 && !isSessionEnded

  // Session is "offline" when countdown > 12h or there's no next schedule and no active session.
  // In dev mode, always treat the session as online so the video renders.
  const sessionIsOffline = !isDevMode && !hasStarted && (!nextScheduledStart || countdownToStart > 43200)

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
        .select('session_started_at, current_run_id')
        .eq('id', webinar.id)
        .single()
      if (data?.current_run_id !== undefined && data.current_run_id !== currentRunId) {
        setCurrentRunId(data.current_run_id ?? null)
      }
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
  }, [hasStarted, webinar.id, liveSessionStartedAt, currentRunId])

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
          try { ytPlayerRef.current?.playVideo() } catch {}
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

  // ---- Stop all video/audio as soon as the session is considered ended ----
  // This fires both when isSessionEnded flips to true mid-session (live end)
  // and — critically — when the component mounts while the session is already
  // over (returning lead).  Without this, the YT/Vimeo/native player could
  // initialise for a brief window and leak audio through the ended overlay.
  useEffect(() => {
    if (!isSessionEnded) return
    // YouTube IFrame API
    try { ytPlayerRef.current?.pauseVideo() } catch {}
    try { ytPlayerRef.current?.mute() } catch {}
    // Native <video>
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.muted = true
    }
    // Vimeo postMessage API
    try {
      vimeoIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: 'pause' }), '*'
      )
      vimeoIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: 'setVolume', value: 0 }), '*'
      )
    } catch {}
  }, [isSessionEnded])

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
          // Do NOT set ytMuted(false) here — the video starts playing while still muted.
          // ytMuted is only cleared when the user explicitly clicks "Clique para ativar o som".
          setYtPlaying(true)
          trackPlayStartedOnce()
        }
      } catch { /* ignore non-JSON messages */ }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [webinar.video_url, trackPlayStartedOnce])

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
      let isPaused = true

      if (isYouTubeUrl(webinar.video_url || '')) {
        try {
          const ytTime = ytPlayerRef.current?.getCurrentTime()
          if (ytTime !== undefined) {
            currentTick = Math.floor(ytTime)
          }
          const state = ytPlayerRef.current?.getPlayerState()
          isPaused = state !== 1 && state !== 3 // 1: playing, 3: buffering
        } catch {}
      } else if (isVimeoUrl(webinar.video_url || '')) {
        currentTick = vimeoTimeRef.current
        isPaused = !vimeoPlaying
      } else if (videoEl) {
        currentTick = Math.floor(videoEl.currentTime)
        isPaused = videoEl.paused
      } else {
        isPaused = !hasStartedRef.current
        if (!isPaused) {
          currentTick = elapsedRef.current + 1
        }
      }

      if (webinar.is_evergreen) {
        if (isPaused) {
          // Freeze ticking when the player is paused
          return
        }

        // Detect seeking (large delta change in current tick)
        const oldTick = elapsedRef.current
        if (Math.abs(currentTick - oldTick) > 3) {
          // Clear simulated chat logs
          setMessages(prev => prev.filter(m => !m.isSimulated))
          // Seek/reset EventEngine
          engineRef.current?.seek(currentTick)

          // Clear active overlays on seek
          setPitchVisible(false)
          setPitchPayload(null)
          setPopupVisible(false)
          setPopupPayload(null)
          setPinnedMessage(null)
        }
      } else {
        // Original non-evergreen logic
        if (videoEl) {
          if (!videoEl.paused) currentTick = Math.floor(videoEl.currentTime)
          const lsa = liveSessionStartedAtRef.current
          if (lsa && !videoEl.paused) {
            const wallClockTick = Math.floor((Date.now() - new Date(lsa).getTime()) / 1000)
            if (Math.abs(videoEl.currentTime - wallClockTick) > 5) {
              videoEl.currentTime = wallClockTick
              currentTick = wallClockTick
            }
          }
        } else {
          const lsa = liveSessionStartedAtRef.current
          if (lsa) {
            const wallClockTick = Math.floor((Date.now() - new Date(lsa).getTime()) / 1000)
            currentTick = Math.max(elapsedRef.current, wallClockTick)
            
            if (isYouTubeUrl(webinar.video_url || '')) {
              try {
                const ytTime = ytPlayerRef.current?.getCurrentTime()
                if (ytTime !== undefined && Math.abs(ytTime - wallClockTick) > 5) {
                  ytPlayerRef.current?.seekTo(wallClockTick, true)
                  if (!ytPlayingRef.current) ytPlayerRef.current?.playVideo()
                }
              } catch {}
            }
          }
        }
      }

      const timeAdvanced = currentTick !== elapsedRef.current
      elapsedRef.current = currentTick
      setElapsedSeconds(currentTick)
      engineRef.current?.tick(currentTick)

      // Geração Orgânica de Chat Dirigida pelo Player (Evergreen Ticker)
      if (webinar.is_evergreen && timeAdvanced) {
        const segments = webinar.chat_segments
        let currentCpm = webinar.chat_cpm || 0
        let phrases = webinar.chat_phrases?.length ? webinar.chat_phrases : GENERIC_CHAT_PHRASES

        if (segments && segments.length > 0) {
          const seg = findActiveSegment(segments, currentTick)
          if (seg) {
            currentCpm = seg.cpm
            phrases = getPhrasesForSegment(seg)
          } else {
            currentCpm = 0
          }
        } else {
          const mode = webinar.chat_mode ?? 'cpm'
          const startSec = webinar.chat_start_seconds ?? 0
          const endSec = webinar.chat_end_seconds ?? Infinity
          
          if (currentTick < startSec || currentTick > endSec) {
            currentCpm = 0
          } else if (mode === 'interval') {
            const intervalMin = webinar.chat_interval_minutes ?? 5
            const intervalMsgs = (webinar as any).chat_interval_messages as number || 1
            currentCpm = intervalMin > 0 ? (intervalMsgs / intervalMin) : 0
          }
        }

        if (currentCpm > 0 && Math.random() < currentCpm / 60) {
          const poolNames = webinar.chat_names?.length ? webinar.chat_names : DEFAULT_NAMES
          const name = poolNames[Math.floor(Math.random() * poolNames.length)]
          const text = phrases[Math.floor(Math.random() * phrases.length)]
          
          appendMessages([{
            id: Math.random().toString(36),
            author: name,
            text,
            timestamp: sessionBaseTime + Math.floor(currentTick),
            isSimulated: true,
          }])
        }
      }

      // For non-native videos (YouTube, Vimeo, VTurb), track watch_second every 10s.
      // Native videos use onTimeUpdate (every 5s) in the video setup effect.
      if (!isNativeVideo) {
        trackWatchSample(currentTick, 10)
        trackProgress50Once(currentTick)
        trackProgressMilestones(currentTick)
      }
      
      evaluateEmailTriggers(currentTick)

      // 30-minute milestone (fire once)
      if (!milestone30FiredRef.current && currentTick >= 1800) {
        milestone30FiredRef.current = true
        trackEvent('watch_milestone_30min', currentTick)
      }
    }, 1000)
    
    // Enrich joined with device fingerprint for analytics segmentation
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
    trackEvent('page_view', 0, { user_agent: ua, timezone: tz })
    trackJoinedOnce({ user_agent: ua, timezone: tz })
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Viewer counter simulation (4-phase curve + Real Users) ----
  useEffect(() => {
    const vStart  = webinar.fake_viewers_start  ?? 30
    const vPeak   = webinar.fake_viewers_peak   ?? Math.max(50, webinar.peak_viewers_max || 50)
    const vEnd    = webinar.fake_viewers_end    ?? Math.max(15, webinar.peak_viewers_min || 15)
    const peakPct = webinar.fake_viewers_peak_at_pct ?? 30
    
    // Use the component-level duration which is more robust
    const initial = getTargetViewers(startOffset / duration, vStart, vPeak, vEnd, peakPct)
    setViewers(initial + realOnlineCount)

    const interval = setInterval(() => {
      if (!waitingDoneRef.current) return // Only start viewer simulation when in room
      const elapsed = elapsedRef.current
      const pct = Math.min(elapsed / duration, 1)
      const target = getTargetViewers(pct, vStart, vPeak, vEnd, peakPct)
      // Add small noise (±2%) so the number feels organic
      const noise = Math.floor((Math.random() * 0.04 - 0.02) * target)
      const next = Math.max(1, target + noise + realOnlineCount)
      setViewers(prev => {
        if (next !== prev) {
          setViewersPulse(true)
          setTimeout(() => setViewersPulse(false), 400)
        }
        return next
      })
      setLikeCount(prev => prev + Math.floor(Math.random() * 4))
    }, 8000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar, realOnlineCount])

  // ---- Poll real online user count every 30 seconds ----
  useEffect(() => {
    let active = true
    async function fetchRealOnline() {
      try {
        const res = await fetch(`/api/analytics/realtime?webinar_id=${webinar.id}`)
        if (res.ok && active) {
          const data = await res.json()
          setRealOnlineCount(data.online_now || 0)
        }
      } catch {}
    }
    
    fetchRealOnline()
    const interval = setInterval(fetchRealOnline, 30000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [webinar.id])

  // ---- CPM-based chat simulation (supports segments + global mode) ----
  useEffect(() => {
    if (webinar.is_evergreen) {
      return
    }

    const poolNames = webinar.chat_names?.length ? webinar.chat_names : DEFAULT_NAMES
    const segments = webinar.chat_segments?.length ? webinar.chat_segments : null

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
        if (currentTime >= duration) return
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
          if (fireTime >= duration) return
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
        if (currentTime >= duration) return
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
      if (dbMsg.session_id === 'ai-moderator') {
        setAiTyping(false)
        if (aiTypingTimeoutRef.current) {
          clearTimeout(aiTypingTimeoutRef.current)
          aiTypingTimeoutRef.current = null
        }
      }
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
          session_id: dbMsg.session_id,
          lead_email: dbMsg.metadata?.lead_email || dbMsg.lead_email
        } as any])
      }
    })

    // Listen to Database deletes on webi_live_chat so deleted comments disappear for active clients
    channel.on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'webi_live_chat',
      filter: `webinar_id=eq.${webinar.id}`
    }, (payload) => {
      const dbMsg = payload.old
      if (dbMsg && dbMsg.id) {
        setMessages(prev => prev.filter(m => m.id !== dbMsg.id))
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
      .on('broadcast', { event: 'delete-message' }, ({ payload }) => {
        setMessages(prev => prev.filter(m => m.id !== payload.messageId))
      })
      .on('broadcast', { event: 'ban-user' }, ({ payload }) => {
        const myLeadEmail = typeof window !== 'undefined' ? (localStorage.getItem(`webi_lead_email_${webinar.id}`) || '') : ''
        if (sessionId.current === payload.sessionId || (payload.leadEmail && myLeadEmail.trim() === payload.leadEmail.trim())) {
          setIsBanned(true)
        }
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

    // Catch-up: fire events already past when user joins mid-session
    // This ensures late-joining users still see the pitch button & popups
    const catchUpTick = elapsedRef.current
    if (catchUpTick > 0) {
      // We tick once silently to mark past events as fired but don't show
      // pitch/popup for events >5 min old (user is well past those moments).
      // Events within last 5 minutes are still shown.
      const REFIRE_WINDOW = 300 // seconds
      events
        .filter(e => e.timestamp_seconds <= catchUpTick)
        .forEach(ev => {
          const age = catchUpTick - ev.timestamp_seconds
          if (age <= REFIRE_WINDOW) {
            // Within refire window: fire the event so user sees it
            engine.tick(catchUpTick)
          }
        })
    }

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

      // ── Inject offer card into the chat ──────────────────────────────
      // Appears 2s after the pitch fires so it feels natural (host shares link)
      setTimeout(() => {
        const hostName = webinar.display_name || webinar.ai_persona_name || 'Apresentador'
        const lines: string[] = []
        if (p.text_above) lines.push(`🔥 ${p.text_above}`)
        lines.push(p.cta_text ? `👉 ${p.cta_text}` : '👉 Acesse a oferta agora!')
        if (p.scarcity_spots && p.scarcity_spots > 0) {
          lines.push(`⚠️ Apenas ${p.scarcity_spots} vagas disponíveis!`)
        }
        appendMessages([{
          id: `pitch-chat-${ev.id}`,
          author: hostName,
          text: lines.join('\n'),
          timestamp: sessionBaseTime + ev.timestamp_seconds + 2,
          isSimulated: false,
          isBroadcast: false,
          image_url: p.image_url || undefined,
          link_url: p.cta_url || undefined,
          link_text: p.cta_text || 'Quero garantir minha vaga →',
        }])
      }, 2000)
      // ─────────────────────────────────────────────────────────────────

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

    engine.on('pinned_message', (ev) => {
      const p = ev.payload as PinnedMessagePayload
      if (!p.text?.trim()) {
        // Empty text clears the pinned banner
        setPinnedMessage(null)
        if (pinnedTimerRef.current) clearTimeout(pinnedTimerRef.current)
        return
      }
      setPinnedMessage({ text: p.text, author: p.author })
      // Auto-dismiss if duration_seconds is set
      if (pinnedTimerRef.current) clearTimeout(pinnedTimerRef.current)
      if (p.duration_seconds && p.duration_seconds > 0) {
        pinnedTimerRef.current = setTimeout(() => setPinnedMessage(null), p.duration_seconds * 1000)
      }
    })

    engineRef.current = engine
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  // ---- YouTube Iframe API: load the API script once and create the player ----
  useEffect(() => {
    if (!isYouTubeUrl(webinar.video_url || '')) return
    const videoId = getYouTubeVideoId(webinar.video_url!)
    if (!videoId) return

    // Compute start offset once
    ytStartOffset.current = startOffset > 0 ? startOffset : (webinar.evergreen_offset_seconds || 0)

    function createPlayer() {
      if (ytPlayerRef.current) return // already created
      if (!ytWrapperRef.current) return

      // Under React Strict Mode, the component mounts/unmounts/remounts.
      // YT.Player replaces the target element with an <iframe>. If we pass a React-managed
      // element directly, React loses track of it. Instead, we use a wrapper and manually
      // inject a fresh child element for YT to consume on every mount.
      ytWrapperRef.current.innerHTML = ''
      const playerDiv = document.createElement('div')
      ytWrapperRef.current.appendChild(playerDiv)

      ytPlayerRef.current = new (window as any).YT.Player(playerDiv, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay:        1,
          mute:            1,
          controls:        0,
          modestbranding:  1,
          rel:             0,
          disablekb:       1,
          iv_load_policy:  3,
          playsinline:     1,
          fs:              0,
          showinfo:        0,
          start:           ytStartOffset.current > 0 ? ytStartOffset.current : undefined,
          origin:          typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: (e: any) => {
            // Cancel fallback timer — onReady fired normally
            if (ytUnmuteTimer.current) { clearTimeout(ytUnmuteTimer.current); ytUnmuteTimer.current = null }
            setYtIframeLoaded(true)
            const d = e.target?.getDuration?.()
            if (d && d > 0) setActualDuration(Math.floor(d))
          },
          onStateChange: (e: any) => {
            // YT.PlayerState: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
            if (e.data === 1) {
              setYtPlaying(true)
              setYtEverPlayed(true)  // latch: never goes back to false
              setYtBuffering(false)
              const d = e.target?.getDuration?.()
              if (d && d > 0) setActualDuration(Math.floor(d))
            }
            if (e.data === 2) {
              setYtPlaying(false)
              setYtBuffering(false)
              // Auto-resume playback since it is a simulated live stream
              if (!isSessionEndedRef.current) {
                try {
                  e.target.playVideo()
                } catch (err) {
                  console.error('Auto-resume failed:', err)
                }
              }
            }
            if (e.data === 3) { setYtBuffering(true) }
          },
        },
      })

      // Fallback for old iOS Safari: onReady may not fire reliably.
      // Force ytIframeLoaded=true after 5s so the unmute button always appears.
      if (ytUnmuteTimer.current) clearTimeout(ytUnmuteTimer.current)
      ytUnmuteTimer.current = setTimeout(() => {
        setYtIframeLoaded(true)
        ytUnmuteTimer.current = null
      }, 5000)
    }

    // When waitingDone flips to true, React schedules a re-render but hasn't
    // committed the DOM yet — ytWrapperRef.current is still null at this point.
    // Double-RAF defers execution until AFTER React has painted the new DOM,
    // guaranteeing ytWrapperRef.current points to the mounted wrapper div.
    function createPlayerDeferred() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if ((window as any).YT?.Player) {
            createPlayer()
          } else {
            if (!document.getElementById('yt-iframe-api-script')) {
              const tag = document.createElement('script')
              tag.id  = 'yt-iframe-api-script'
              tag.src = 'https://www.youtube.com/iframe_api'
              document.head.appendChild(tag)
            }
            const prev = (window as any).onYouTubeIframeAPIReady
            ;(window as any).onYouTubeIframeAPIReady = () => {
              prev?.()
              createPlayer()
            }
          }
        })
      })
    }

    if ((window as any).YT?.Player) {
      // Defer when the wrapper div is only just being mounted:
      //   - waitingDone just became true (WaitingRoom ended)
      //   - sessionIsScheduledFuture just became false (countdown reached zero)
      // In both cases the ytWrapperRef div is mounting for the first time
      // and React hasn't painted it yet — we MUST defer.
      if (waitingDone && !sessionIsScheduledFuture) {
        createPlayerDeferred()
      } else {
        createPlayer()
      }
    } else {
      // Inject the API script only once globally
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script')
        tag.id  = 'yt-iframe-api-script'
        tag.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(tag)
      }
      // YT calls this global when ready
      const prev = (window as any).onYouTubeIframeAPIReady
      ;(window as any).onYouTubeIframeAPIReady = () => {
        prev?.()
        createPlayer()
      }
    }

    return () => {
      // Clear the fallback timer
      if (ytUnmuteTimer.current) { clearTimeout(ytUnmuteTimer.current); ytUnmuteTimer.current = null }
      // Destroy the player on unmount / video URL change / state transitions
      try { ytPlayerRef.current?.destroy() } catch {}
      ytPlayerRef.current = null
    }
  // sessionIsScheduledFuture is required: ytWrapperRef is inside {!sessionIsScheduledFuture && ...}
  // so when the live countdown reaches zero, the wrapper mounts for the first time
  // and we need to re-run this effect to initialize the player.
  // waitingDone is required for the same reason (wrapper is inside {waitingDone && ...}).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.video_url, waitingDone, sessionIsScheduledFuture])

  // ---- Vimeo: compute iframe src only on client (avoid SSR hydration mismatch) ----
  useEffect(() => {
    if (!isVimeoUrl(webinar.video_url || '')) return
    const offset = startOffset > 0 ? startOffset : (webinar.evergreen_offset_seconds || 0)
    setVimeoSrc(getVimeoEmbedUrl(webinar.video_url!, offset) || '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.video_url])

  // ---- Vimeo: postMessage listener → drives vimeoPlaying / vimeoBuffering state ----
  useEffect(() => {
    if (!isVimeoUrl(webinar.video_url || '')) return
    function onMessage(e: MessageEvent) {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (data?.player_id || data?.event) {
          // Vimeo Player API sends events like: { event: 'play' | 'pause' | 'bufferstart' | 'bufferend' }
          if (data.event === 'play') {
            setVimeoPlaying(true)
            setVimeoBuffering(false)
            trackPlayStartedOnce()
          }
          if (data.event === 'pause') {
            setVimeoPlaying(false)
            if (!isSessionEndedRef.current && vimeoIframeRef.current?.contentWindow) {
              try {
                vimeoIframeRef.current.contentWindow.postMessage(
                  JSON.stringify({ method: 'play' }), '*'
                )
              } catch {}
            }
          }
          if (data.event === 'bufferstart') setVimeoBuffering(true)
          if (data.event === 'bufferend') { setVimeoBuffering(false) }
          if (data.event === 'playProgress' || data.event === 'timeupdate') {
            setVimeoPlaying(true)
            setVimeoBuffering(false)
            trackPlayStartedOnce()
            if (data.data?.seconds !== undefined) {
              vimeoTimeRef.current = Math.floor(data.data.seconds)
            }
          }
          if (data.event === 'loaded' && data.data?.duration) {
            setActualDuration(Math.floor(data.data.duration))
          }
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('message', onMessage)

    // After iframe loads, send Vimeo API listener registration
    const register = setTimeout(() => {
      vimeoIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: 'addEventListener', value: 'play' }), '*'
      )
      vimeoIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: 'addEventListener', value: 'pause' }), '*'
      )
      vimeoIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: 'addEventListener', value: 'bufferstart' }), '*'
      )
      vimeoIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: 'addEventListener', value: 'bufferend' }), '*'
      )
      vimeoIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), '*'
      )
      vimeoIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: 'addEventListener', value: 'loaded' }), '*'
      )
    }, 1000)

    // Fallback: if Vimeo never reports playing after 10s, consider it playing
    const fallback = setTimeout(() => {
      setVimeoPlaying(prev => {
        if (!prev) {
          trackPlayStartedOnce()
          return true
        }
        return prev
      })
    }, 10000)

    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(register)
      clearTimeout(fallback)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.video_url, vimeoIframeLoaded, trackPlayStartedOnce])

  // ---- VTurb play started tracking ----
  useEffect(() => {
    if (isVturbUrl(webinar.video_url) && waitingDone) {
      trackPlayStartedOnce()
    }
  }, [webinar.video_url, waitingDone, trackPlayStartedOnce])

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

    const onTimeUpdate = () => {
      const t = Math.floor(video.currentTime)
      engineRef.current?.tick(t)

      // Track watch_second every 5s for finer retention buckets without duplicating ticks.
      trackWatchSample(t, 5)
      
      evaluateEmailTriggers(t)

      // Track progress_50 once when viewer watches past 50% of the video
      trackProgress50Once(t, video.duration)
      trackProgressMilestones(t, video.duration)
    }

    const onSeeking = () => {
      if (Math.abs(video.currentTime - lastVideoTimeRef.current) > 2) {
        video.currentTime = lastVideoTimeRef.current
      }
    }

    const onTimeUpdateStore = () => {
      lastVideoTimeRef.current = video.currentTime
    }

    const onLoadedMetadata = () => {
      if (video.duration > 0) setActualDuration(Math.floor(video.duration))
    }

    const onPlaying = () => {
      trackPlayStartedOnce()
    }
    video.addEventListener('playing', onPlaying)
    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('timeupdate', onTimeUpdateStore)
    video.addEventListener('seeking', onSeeking)

    // Enrich joined with device fingerprint for analytics segmentation
    const ua2 = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const tz2 = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
    trackJoinedOnce({ user_agent: ua2, timezone: tz2 })

    return () => {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('timeupdate', onTimeUpdateStore)
      video.removeEventListener('seeking', onSeeking)
      trackEvent('left', Math.floor(video.currentTime))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinar.evergreen_offset_seconds, trackPlayStartedOnce])

  async function trackEvent(type: string, timestampVideo: number, metadata: Record<string, unknown> = {}) {
    try {
      // Enrich with Imperio HQ context if available in localStorage
      const imperioProjectId = (webinar as unknown as Record<string, unknown>).imperio_project_id as string | undefined
      const leadEmail = typeof window !== 'undefined'
        ? (localStorage.getItem(`webi_lead_email_${webinar.id}`) || localStorage.getItem('webi_lead_email') || leadData?.email || '')
        : (leadData?.email || '')
      const leadName = typeof window !== 'undefined'
        ? (localStorage.getItem(`webi_lead_name_${webinar.id}`) || localStorage.getItem('webi_lead_name') || leadData?.nome || '')
        : (leadData?.nome || '')
      const leadPhone = typeof window !== 'undefined'
        ? (localStorage.getItem(`webi_lead_phone_${webinar.id}`) || localStorage.getItem('webi_lead_phone') || leadData?.phone || '')
        : (leadData?.phone || '')
      const sessionMode = typeof window !== 'undefined'
        ? getSessionModeFromPath(window.location.pathname, !!webinar.is_evergreen)
        : (webinar.is_evergreen ? 'evergreen' : 'live')

      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId.current,
          webinar_id: webinar.id,
          project_id: webinar.project_id,
          run_id: currentRunId || undefined,
          event_type: type,
          timestamp_video: timestampVideo,
          metadata: {
            ...metadata,
            run_id: currentRunId || undefined,
            session_mode: sessionMode,
            lead_email: leadEmail || undefined,
            lead_name: leadName || undefined,
            lead_phone: leadPhone || undefined,
            ...(imperioProjectId ? { imperio_project_id: imperioProjectId } : {}),
          },
        }),
      })
    } catch {}
  }

  const evaluateEmailTriggers = useCallback((currentTick: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inWebinarEmails = (webinar as any).in_webinar_emails || []
    if (!inWebinarEmails.length) return
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inWebinarEmails.forEach((em: any) => {
      if (em.enabled && currentTick >= em.trigger_minute * 60) {
        if (!sentEmailsRef.current.has(em.id)) {
          sentEmailsRef.current.add(em.id)
          trackEvent('trigger_in_webinar_email', currentTick, { 
            email_id: em.id, 
            subject: em.subject, 
            body: em.body,
            webinar_name: webinar.name
          })
        }
      }
    })
  }, [webinar])

  // ---- Chat moderation actions (called by ChatPanel) ----
  async function deleteChatMessage(messageId: string) {
    if (!isAdmin) return

    try {
      // 1. Delete from Supabase Database
      await supabaseRef.current.from('webi_live_chat').delete().eq('id', messageId)

      // 2. Broadcast deletion to all clients
      if (channelRef.current) {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'delete-message',
          payload: { messageId }
        })
      }

      // 3. Remove locally
      setMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (err) {
      console.error('Failed to delete comment:', err)
    }
  }

  async function banUser(leadEmail: string | null, messageSessionId: string) {
    if (!isAdmin) return

    try {
      // 1. Insert into banned leads table
      await supabaseRef.current.from('webi_banned_leads').insert({
        webinar_id: webinar.id,
        lead_email: leadEmail || null,
        session_id: messageSessionId
      })

      // 2. Broadcast ban to all clients
      if (channelRef.current) {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'ban-user',
          payload: { sessionId: messageSessionId, leadEmail: leadEmail || null }
        })
      }

      alert('Usuário suspenso do chat com sucesso.')
    } catch (err) {
      console.error('Failed to ban user:', err)
    }
  }

  // ---- Chat message sender (called by ChatPanel.onSendMessage) ----
  async function sendChatMessage(text: string) {
    if (isBanned) {
      alert("Você está suspenso deste chat.")
      return
    }

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

        // Registrar o lead em tempo real no banco de dados
        try {
          const utm_source = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('utm_source') || undefined : undefined
          const utm_medium = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('utm_medium') || undefined : undefined
          const utm_campaign = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('utm_campaign') || undefined : undefined

          fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              webinar_id: webinar.id,
              name: currentName,
              email: identity.email,
              utm_source,
              utm_medium,
              utm_campaign,
              page_url: typeof window !== 'undefined' ? window.location.href : undefined,
            })
          }).then(async res => {
            if (res.ok) {
              const resData = await res.json()
              if (resData.lead_id) {
                // Grava o lead_id nos cookies para manter a sessão no reload
                document.cookie = `webi_lead_id_${webinar.id}=${resData.lead_id}; path=/; max-age=31536000`
              }
            }
          }).catch(err => console.warn('Erro ao salvar lead do chat no banco:', err))
        } catch (err) {}
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
        body: JSON.stringify({ ...msg, webinar_id: webinar.id, session_id: sessionId.current, run_id: currentRunId || undefined }),
      })
    } catch (err) {
      console.warn('Failed to send message via API:', err)
    }

    // If AI is enabled and it is a question, show typing indicator
    const isQ = finalText.endsWith('?') || /como|quando|qual|quanto|posso|consigo|funciona|o que|por que|porque|dúvida|ajuda|não entendi/i.test(finalText)
    if (isQ && webinar.ai_enabled) {
      setAiTyping(true)
      if (aiTypingTimeoutRef.current) clearTimeout(aiTypingTimeoutRef.current)
      aiTypingTimeoutRef.current = setTimeout(() => {
        setAiTyping(false)
      }, 12000)
    }
  }

  function handleCTAClick() {
    if (!pitchPayload) return
    trackEvent('cta_clicked', getCurrentAnalyticsTimestamp(), { 
      source: 'pitch_button',
      pitch_image: pitchPayload.image_url || 'sem-imagem',
      pitch_text: pitchPayload.cta_text 
    })
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
    trackEvent('cta_dismissed', getCurrentAnalyticsTimestamp())
  }

  function handlePopupDismiss() {
    setPopupVisible(false)
    trackEvent('popup_dismissed', getCurrentAnalyticsTimestamp())
  }

  function handlePopupCTA() {
    if (!popupPayload) return
    trackEvent('cta_clicked', getCurrentAnalyticsTimestamp(), { source: 'popup' })
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
        data-layout={webinar.video_orientation === 'vertical' ? 'vertical' : 'horizontal'}
        style={webinar.custom_background_url ? { 
          backgroundImage: `url(${webinar.custom_background_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        } : undefined}
      >
        {webinar.theme === 'youtube' && <YouTubeHeader userName={userName} />}
        <div className="webinar-room">
      {/* VIDEO SECTION */}
      <div className="video-section" ref={sectionRef}>
        {webinar.theme !== 'youtube' && (
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
        )}

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

          {/* Session Ended overlay — hidden in dev mode so admins can test past the normal duration */}
          {isSessionEnded && !sessionIsScheduledFuture && !isDevMode && (
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

          {!sessionIsScheduledFuture && (!isSessionEnded || isDevMode) && webinar.video_url ? (
            isYouTubeUrl(webinar.video_url) ? (
                   <div style={{ position: 'relative', width: '100%', paddingTop: webinar.video_orientation === 'vertical' ? '177.78%' : '56.25%', overflow: 'hidden', background: '#000' }}>
                     <div style={{
                       position: 'absolute',
                       top: webinar.video_orientation === 'vertical' ? '0' : '-120px',
                       left: webinar.video_orientation === 'vertical' ? '0' : '-10%',
                       width: webinar.video_orientation === 'vertical' ? '100%' : '120%',
                       height: webinar.video_orientation === 'vertical' ? '100%' : 'calc(100% + 240px)',
                       pointerEvents: 'none',
                     }}>
                      {/* ── YouTube Iframe API Wrapper ───────────────────────────
                           We pass ytWrapperRef, and the effect creates an inner div
                           that YT.Player consumes. This survives Strict Mode remounts. ── */}
                      <div
                        ref={ytWrapperRef}
                        className="yt-iframe"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                      />

                    {/* ── Invisible Shield ───────────────────────────────────────
                         Intercepts ALL clicks, right-clicks and double-taps
                         so the user can never interact with the raw YouTube player.── */}
                    <div
                      style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'default' }}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
                      onDoubleClick={e => e.preventDefault()}
                    />

                    {/* ── Universal Branding Delayed Masks ────────────────────────
                         YouTube natively takes ~2 seconds to fade out its title bar
                         AFTER playback starts. This layer keeps black bars over the
                         top and bottom for an extra 1.8s after ytPlaying becomes true.
                         This prevents the "1 second flash" of YouTube data without
                         freezing the actual video content in the middle. ── */}
                    <div style={{
                      position: 'absolute', inset: 0, zIndex: 6,
                      opacity: ytBrandingMasksVisible ? 1 : 0,
                      transition: 'opacity 0.8s ease',
                      pointerEvents: 'none',
                    }}>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: '22%',
                        background: 'linear-gradient(to bottom, #000 0%, #000 65%, rgba(0,0,0,0) 100%)',
                      }} />
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, height: '18%',
                        background: 'linear-gradient(to top, #000 0%, #000 65%, rgba(0,0,0,0) 100%)',
                      }} />
                    </div>

                    {/* ── Universal Poster Overlay ───────────────────────────────
                         Covers 100% of the YouTube UI before every play (including
                         after screen lock/unlock). Disappears INSTANTLY when
                         ytPlaying=true so the YouTube UI never shows through. ── */}
                    {/* ── Universal Poster Overlay ───────────────────────────────
                         Shows before first play (thumbnail/black). Once the video
                         has EVER played (ytEverPlayed), never returns to opaque —
                         this fixes the black screen at ~51min caused by YouTube
                         sending state=2 (paused) during a mid-session re-buffer. ── */}
                    <div style={{
                      position: 'absolute', inset: 0, zIndex: 7,
                      backgroundImage: ytThumb ? `url(${ytThumb})` : undefined,
                      backgroundColor: '#000',
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      opacity: ytEverPlayed ? 0 : (!ytPlaying ? 1 : 0),
                      transition: ytPlaying || ytEverPlayed ? 'opacity 0.05s' : 'opacity 0s',
                      pointerEvents: 'none',
                    }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)' }} />
                    </div>

                    {/* ── Spinner while iframe loads or buffers (All platforms) ── */}
                    {(!ytIframeLoaded || ytBuffering) && (
                      <div style={{
                        position: 'absolute', inset: 0, zIndex: 4,
                        background: ytBuffering ? 'rgba(0,0,0,0.4)' : '#000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: 14, pointerEvents: 'none',
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          border: '3px solid rgba(255,255,255,0.12)',
                          borderTopColor: 'rgba(255,255,255,0.7)',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                        {!ytBuffering && (
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>
                            Carregando transmissão...
                          </span>
                        )}
                      </div>
                    )}

                    {/* ── Unmute button: shows when muted and iframe ready ──
                         On iOS, Safari blocks autoplay with sound. The video starts
                         paused+muted and ytPlaying never becomes true before the
                         user interacts. So we MUST NOT gate this on ytPlaying.
                         We only wait for ytIframeLoaded so ytPlayerRef is valid. ── */}
                    {ytMuted && ytIframeLoaded && (
                      <div style={{
                        position: 'absolute', inset: 0, zIndex: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
                        pointerEvents: 'auto',
                      }}>
                        <button
                          onClick={() => {
                            const player = ytPlayerRef.current
                            if (!player) return
                            try {
                              // 1. Unlock iOS audio context within the user gesture
                              try {
                                const AC = window.AudioContext || (window as any).webkitAudioContext
                                if (AC) new AC().resume()
                              } catch {}
                              // 2. playVideo() FIRST — required on iOS to start audio
                              player.playVideo()
                              player.unMute()
                              player.setVolume(100)
                              setYtMuted(false)
                            } catch {
                              // API threw — keep button visible so user can retry
                            }
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
                </div>
              </div>
            ) : isVimeoUrl(webinar.video_url) ? (
              <div style={{ position: 'relative', width: '100%', paddingTop: webinar.video_orientation === 'vertical' ? '177.78%' : '56.25%', overflow: 'hidden', background: '#000' }}>
                <iframe
                  ref={vimeoIframeRef}
                  src={vimeoSrc}
                  className="yt-iframe"
                  style={{ position: 'absolute', left: 0, width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen={false}
                  title={webinar.name}
                  onLoad={() => setVimeoIframeLoaded(true)}
                />

                {/* ── Vimeo: Branding Masks (top + bottom fade) ────────── */}
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 6,
                  opacity: vimeoPlaying ? 0 : 1,
                  transition: 'opacity 1s ease',
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '18%',
                    background: 'linear-gradient(to bottom, #000 0%, #000 60%, rgba(0,0,0,0) 100%)',
                  }} />
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '18%',
                    background: 'linear-gradient(to top, #000 0%, #000 60%, rgba(0,0,0,0) 100%)',
                  }} />
                </div>

                {/* ── Vimeo: Poster overlay — fades out when video plays ── */}
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 7,
                  backgroundColor: '#000',
                  opacity: vimeoPlaying ? 0 : 1,
                  transition: 'opacity 0.5s ease',
                  pointerEvents: 'none',
                }} />

                {/* ── Vimeo: Spinner while loading or buffering ──────────── */}
                {(!vimeoIframeLoaded || vimeoBuffering) && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      border: '3px solid rgba(255,255,255,0.12)',
                      borderTopColor: 'rgba(255,255,255,0.7)',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                  </div>
                )}

                {/* ── Vimeo: Unmute button ───────────────────────────────── */}
                {vimeoMuted && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
                  }}>
                    <button
                      onClick={() => {
                        if (vimeoIframeRef.current?.contentWindow) {
                          vimeoIframeRef.current.contentWindow.postMessage(
                            JSON.stringify({ method: 'setVolume', value: 1 }), '*'
                          )
                          vimeoIframeRef.current.contentWindow.postMessage(
                            JSON.stringify({ method: 'setMuted', value: false }), '*'
                          )
                          vimeoIframeRef.current.contentWindow.postMessage(
                            JSON.stringify({ method: 'play' }), '*'
                          )
                        }
                        setVimeoMuted(false)
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
              </div>

            ) : isVturbUrl(webinar.video_url) ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden', width: '100%', height: '100%' }}>
                <iframe
                  src={getVturbEmbedUrl(webinar.video_url)}
                  style={{ border: 'none', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', aspectRatio: webinar.video_orientation === 'vertical' ? '9/16' : '16/9' }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  title={webinar.name}
                />
              </div>
            ) : (
              <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
                <video
                  ref={videoRef}
                  src={webinar.video_url}
                  autoPlay
                  playsInline
                  muted={nativeMuted}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: webinar.video_orientation === 'vertical' ? 'cover' : 'contain',
                    pointerEvents: 'none',
                  }}
                  onPause={() => {
                    if (!isSessionEndedRef.current && videoRef.current) {
                      videoRef.current.play().catch(() => {})
                    }
                  }}
                  onError={(e) => console.error('Video playback error', e)}
                  onContextMenu={e => e.preventDefault()}
                />

                {/* ── Native: Unmute button ── */}
                {nativeMuted && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
                    pointerEvents: 'auto',
                  }}>
                    <button
                      onClick={() => {
                        const video = videoRef.current
                        if (video) {
                          try {
                            video.muted = false
                            video.play().catch(() => {})
                            setNativeMuted(false)
                          } catch {}
                        }
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
              </div>
            )
          ) : !sessionIsScheduledFuture ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48 }}>🎬</div>
              <p>Vídeo não configurado para este webinar</p>
            </div>
          ) : null}

          {/* Live red progress bar */}
          {webinar.theme === 'youtube' && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              background: '#cc0000',
              zIndex: 10,
              boxShadow: '0 0 8px rgba(204,0,0,0.8)',
              pointerEvents: 'none'
            }} />
          )}
        </div>

        {/* YOUTUBE THEME: VIDEO DETAILS */}
        {webinar.theme === 'youtube' && (
          <div className="yt-video-details-container">
            <h1 className="yt-video-title">
              {webinar.display_name || webinar.name}
            </h1>
            
            <div className="yt-channel-actions-row">
              <div className="yt-channel-left">
                <div 
                  className="yt-channel-avatar"
                  style={{
                    backgroundImage: webinar.ai_persona_avatar ? `url(${webinar.ai_persona_avatar})` : undefined,
                    backgroundSize: 'cover',
                  }}
                >
                  {!webinar.ai_persona_avatar && getInitials(webinar.display_name || webinar.name)}
                </div>
                <div className="yt-channel-info">
                  <div className="yt-channel-name">
                    <span>{webinar.display_name || webinar.name}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#aaa" style={{ marginLeft: 4 }}>
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zM10 17l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  </div>
                  <div className="yt-sub-count">
                    {formatSubscriberCount(webinar.fake_viewers_peak || 25000)} de inscritos
                  </div>
                </div>
                
                <button className="yt-btn-member" disabled style={{ cursor: 'not-allowed', opacity: 0.8 }}>
                  Seja membro
                </button>
                
                <button 
                  className={`yt-btn-subscribe ${isSubscribed ? 'subscribed' : ''}`}
                  onClick={toggleSubscribe}
                >
                  {isSubscribed ? (
                    <>
                      <span>Inscrito</span>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                      </svg>
                    </>
                  ) : 'Inscrever-se'}
                </button>
              </div>
              
              <div className="yt-actions-right">
                {/* Double button: Like / Dislike */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#272727',
                  borderRadius: 18,
                  overflow: 'hidden',
                  height: 36,
                }}>
                  <button
                    onClick={handleLike}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#fff',
                      padding: '0 12px 0 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      height: '100%',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill={hasLiked ? '#3ea6ff' : 'currentColor'}>
                      <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
                    </svg>
                    <span>{formatLikeCount(likeCount)}</span>
                  </button>
                  <div style={{ width: 1, height: 18, background: '#3f3f3f' }} />
                  <button
                    disabled
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#fff',
                      padding: '0 12px',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'not-allowed',
                      opacity: 0.6,
                      height: '100%',
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M23 3h-4v12h4V3zm-22 11c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2H6c-.83 0-1.54.5-1.84 1.22L1.14 11.27c-.09.23-.14.47-.14.73v-2z" />
                    </svg>
                  </button>
                </div>

                {!!(webinar as unknown as Record<string, unknown>).has_quiz && (
                  <button
                    className="yt-action-btn"
                    onClick={() => setQuizOpen(true)}
                    style={{ background: 'var(--brand-glow)', border: '1px solid var(--brand)', color: '#fff' }}
                  >
                    <span>📝 Quiz</span>
                  </button>
                )}
                <button className="yt-action-btn" disabled style={{ cursor: 'not-allowed', opacity: 0.8 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" />
                  </svg>
                  <span>Compartilhar</span>
                </button>
                <button className="yt-action-btn" disabled style={{ cursor: 'not-allowed', opacity: 0.8 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                  </svg>
                  <span>Salvar</span>
                </button>
                <button className="yt-action-btn-more" disabled style={{ cursor: 'not-allowed', opacity: 0.8 }}>
                  •••
                </button>
              </div>
            </div>
            
            {/* Description Box */}
            <div className="yt-description-box" onClick={() => setDescriptionExpanded(e => !e)} style={{ cursor: 'pointer' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>
                {viewers.toLocaleString()} assistindo agora • Transmissão iniciada há {Math.max(1, Math.floor(elapsedSeconds / 60)) || 1} minutos
              </div>
              <p style={{
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: descriptionExpanded ? 'unset' : 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                color: '#f1f1f1'
              }}>
                {webinar.description || 'Assista a esta super transmissão ao vivo e tire todas as suas dúvidas no chat.'}
              </p>
              <div style={{ fontSize: 12, fontWeight: 'bold', marginTop: 8, color: '#aaa' }}>
                {descriptionExpanded ? 'Mostrar menos' : '... mais'}
              </div>
            </div>
          </div>
        )}
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
        hasBottomBar={pitchVisible && !!pitchPayload}
        pinnedMessage={pinnedMessage}
        isAdmin={isAdmin}
        isBanned={isBanned}
        onDeleteMessage={deleteChatMessage}
        onBanUser={banUser}
        theme={webinar.theme}
        userName={userName}
        disableQa={!!webinar.disable_qa}
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

      {/* PITCH BUTTON — renderizado FORA do .video-wrapper para que position:fixed
          funcione corretamente no iOS Safari (clip-path/overflow:hidden no pai
          quebram fixed positioning quando o elemento está dentro desse contêiner) */}
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
            {pitchPayload.text_above && (
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', textAlign: 'center', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {pitchPayload.text_above}
              </p>
            )}
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
            <button className="pitch-cta" onClick={handleCTAClick}>
              {pitchPayload.cta_text}
            </button>
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

      {/* OFFER POPUP — renderizado fora do video-wrapper pelo mesmo motivo */}
      {popupVisible && popupPayload && (
        <div className="offer-overlay" style={{ position: 'fixed', zIndex: 99990 }}>
          <div className="offer-modal">
            <button
              onClick={handlePopupDismiss}
              style={{
                position: 'absolute', top: 16, right: 16,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '50%', width: 32, height: 32,
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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

      {/* POLL OVERLAY — renderizado fora do video-wrapper pelo mesmo motivo */}
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
