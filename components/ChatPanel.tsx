import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, QuizCardData } from '@/types'

export interface Material {
  id: string
  label: string
  url: string
  icon: string
  show_at_seconds: number
}

export type ChatTab = 'chat' | 'qa' | 'materials'

export function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getSuperChatColors(amount: string) {
  const num = parseFloat(amount.replace(/[^0-9]/g, '')) || 20
  if (num >= 100) {
    return { headerBg: '#d00000', bodyBg: '#e53935', text: '#ffffff' } // Red
  } else if (num >= 50) {
    return { headerBg: '#e65100', bodyBg: '#f57c00', text: '#ffffff' } // Orange
  } else if (num >= 20) {
    return { headerBg: '#ffd600', bodyBg: '#ffea00', text: '#000000' } // Yellow
  } else if (num >= 10) {
    return { headerBg: '#00b0ff', bodyBg: '#00e5ff', text: '#000000' } // Cyan
  } else {
    return { headerBg: '#1565c0', bodyBg: '#1e88e5', text: '#ffffff' } // Blue
  }
}

function parseMarkdownLinks(text: string) {
  const parts: any[] = []
  let lastIndex = 0
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }
    parts.push(
      <a
        key={match.index}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: 'inherit',
          textDecoration: 'underline',
          fontWeight: 700,
        }}
      >
        {match[1]}
      </a>
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }
  return parts.length > 0 ? parts : text
}

const TRANSLATIONS = {
  pt: {
    liveChat: 'Chat ao vivo',
    chatTab: '💬 Chat',
    qaTab: '❓ Q&A',
    materialsTab: '📂 Materiais',
    sendPlaceholder: 'Enviar mensagem...',
    qaPlaceholder: 'Faça sua pergunta...',
    learnMore: 'Saiba mais',
    pinnedLabel: 'Fixado no topo',
    writeQuestion: 'Escrever uma pergunta...',
    firstComment: 'Seja o primeiro a comentar! 👋',
    liveChatPoll: '📊 Enquete do chat ao vivo',
    vote: 'Votar',
    voted: 'Voto computado',
    voteText: 'voto',
    votesText: 'votos',
  },
  en: {
    liveChat: 'Live chat',
    chatTab: '💬 Chat',
    qaTab: '❓ Q&A',
    materialsTab: '📂 Materials',
    sendPlaceholder: 'Send message...',
    qaPlaceholder: 'Ask a question...',
    learnMore: 'Learn more',
    pinnedLabel: 'Pinned',
    writeQuestion: 'Write a question...',
    firstComment: 'Be the first to comment! 👋',
    liveChatPoll: '📊 Live chat poll',
    vote: 'Vote',
    voted: 'Vote cast',
    voteText: 'vote',
    votesText: 'votes',
  },
  es: {
    liveChat: 'Chat en vivo',
    chatTab: '💬 Chat',
    qaTab: '❓ P&R',
    materialsTab: '📂 Materiales',
    sendPlaceholder: 'Enviar mensaje...',
    qaPlaceholder: 'Haz una pregunta...',
    learnMore: 'Más información',
    pinnedLabel: 'Fijado',
    writeQuestion: 'Escribir una pregunta...',
    firstComment: '¡Sé el primero en comentar! 👋',
    liveChatPoll: '📊 Encuesta de chat en vivo',
    vote: 'Votar',
    voted: 'Voto computado',
    voteText: 'voto',
    votesText: 'votos',
  },
}

// ---- QuizCard inline component ----
interface QuizCardProps {
  card: QuizCardData
  userAnswer: number | null
  voteCounts: number[]
  onVote: (optionIdx: number) => void
  theme?: 'dark' | 'light' | 'youtube'
  lang?: 'pt' | 'en' | 'es'
}

function QuizCard({ card, userAnswer, voteCounts, onVote, theme, lang = 'pt' }: QuizCardProps) {
  const voted = userAnswer !== null
  const totalVotes = voteCounts.reduce((a, b) => a + b, 0)
  const t = TRANSLATIONS[lang]

  if (theme === 'youtube') {
    return (
      <div style={{
        background: '#212121',
        border: '1px solid #303030',
        borderRadius: 12,
        padding: '12px 16px',
        margin: '8px 0',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, color: '#aaaaaa', fontWeight: 600 }}>
          <span>📊</span>
          <span>{t.liveChatPoll}</span>
        </div>

        {/* Question */}
        <p style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', marginBottom: 12, lineHeight: 1.45, marginTop: 0 }}>
          {card.question}
        </p>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {card.options.map((opt, i) => {
            const isSelected = userAnswer === i
            const pct = totalVotes > 0 ? Math.round((voteCounts[i] || 0) / totalVotes * 100) : 0

            if (voted) {
              return (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    height: 36,
                    borderRadius: 4,
                    background: '#3e3e3e',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 500,
                    color: '#ffffff',
                    border: isSelected ? '1px solid #3ea6ff' : '1px solid transparent',
                  }}
                >
                  {/* progress bar */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${pct}%`,
                    background: isSelected ? '#3ea6ff' : '#606060',
                    opacity: isSelected ? 0.35 : 0.2,
                    transition: 'width 0.6s ease',
                    zIndex: 0,
                  }} />
                  <span style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {opt} {isSelected && <span>✓</span>}
                  </span>
                  <span style={{ position: 'relative', zIndex: 1, fontSize: 12, fontWeight: 700, color: isSelected ? '#3ea6ff' : '#aaaaaa' }}>
                    {pct}%
                  </span>
                </div>
              )
            } else {
              return (
                <button
                  key={i}
                  onClick={() => onVote(i)}
                  style={{
                    background: 'none',
                    border: '1px solid #3ea6ff',
                    color: '#3ea6ff',
                    borderRadius: 18,
                    padding: '8px 16px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(62, 166, 255, 0.1)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none'
                  }}
                >
                  {opt}
                </button>
              )
            }
          })}
        </div>

        {/* Footer */}
        <div style={{ fontSize: 11, color: '#aaaaaa', marginTop: 10, fontWeight: 500 }}>
          {totalVotes} {totalVotes === 1 ? t.voteText : t.votesText}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
      border: '1px solid rgba(99,102,241,0.35)',
      borderRadius: 14, padding: '14px 16px', margin: '6px 0',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          background: 'var(--brand)', borderRadius: 8, padding: '3px 8px',
          fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.05em',
        }}>
          📝 QUIZ
        </div>
        {totalVotes > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {totalVotes} {totalVotes === 1 ? (lang === 'pt' ? 'resposta' : lang === 'es' ? 'respuesta' : 'answer') : (lang === 'pt' ? 'respostas' : lang === 'es' ? 'respuestas' : 'answers')}
          </span>
        )}
      </div>

      {/* Question */}
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.45 }}>
        {card.question}
      </p>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {card.options.map((opt, i) => {
          const label = String.fromCharCode(65 + i)
          const isSelected = userAnswer === i
          const isCorrect = voted && i === card.correct_index
          const pct = totalVotes > 0 ? Math.round((voteCounts[i] || 0) / totalVotes * 100) : 0

          let borderColor = 'rgba(99,102,241,0.25)'
          let bg = 'rgba(255,255,255,0.03)'
          let textColor = 'var(--text-secondary)'

          if (voted) {
            if (isCorrect) { borderColor = '#22c55e'; bg = 'rgba(34,197,94,0.1)'; textColor = '#22c55e' }
            else if (isSelected) { borderColor = '#ef4444'; bg = 'rgba(239,68,68,0.08)'; textColor = 'var(--text-primary)' }
          } else if (isSelected) {
            borderColor = 'var(--brand)'; bg = 'rgba(99,102,241,0.15)'; textColor = 'var(--text-primary)'
          }

          return (
            <button
              key={i}
              disabled={voted}
              onClick={() => onVote(i)}
              style={{
                position: 'relative', overflow: 'hidden',
                background: bg, border: `1.5px solid ${borderColor}`,
                borderRadius: 9, padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: voted ? 'default' : 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left', width: '100%',
              }}
            >
              {/* vote bar background */}
              {voted && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`,
                  background: isCorrect ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                  transition: 'width 0.6s ease',
                  pointerEvents: 'none',
                }} />
              )}
              <span style={{
                position: 'relative', zIndex: 1,
                fontSize: 11, fontWeight: 800, color: isCorrect ? '#22c55e' : 'var(--brand)',
                minWidth: 18,
              }}>
                {label}
              </span>
              <span style={{ position: 'relative', zIndex: 1, fontSize: 12, color: textColor, flex: 1 }}>
                {opt}
              </span>
              {voted && (
                <span style={{
                  position: 'relative', zIndex: 1,
                  fontSize: 11, fontWeight: 700,
                  color: isCorrect ? '#22c55e' : 'var(--text-muted)',
                  minWidth: 32, textAlign: 'right',
                }}>
                  {pct}%
                </span>
              )}
              {voted && isCorrect && (
                <span style={{ position: 'relative', zIndex: 1, fontSize: 13 }}>✅</span>
              )}
              {voted && isSelected && !isCorrect && (
                <span style={{ position: 'relative', zIndex: 1, fontSize: 13 }}>❌</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Feedback after voting */}
      {voted && (
        <div style={{
          marginTop: 10, fontSize: 12, textAlign: 'center',
          color: userAnswer === card.correct_index ? '#22c55e' : '#f59e0b',
          fontWeight: 600,
        }}>
          {userAnswer === card.correct_index
            ? '🎉 Correto! Muito bem!'
            : `💡 A resposta correta era: ${String.fromCharCode(65 + card.correct_index)}`
          }
        </div>
      )}
    </div>
  )
}

interface ChatPanelProps {
  messages: ChatMessage[]
  qaMessages: { id: string; author: string; text: string; answered?: string }[]
  visibleMaterials: Material[]
  materials: Material[]
  elapsedSeconds: number
  aiTyping: boolean
  defaultTab?: ChatTab
  mobileChatOpen?: boolean
  onSendMessage: (text: string) => void
  onSendQa: (text: string) => void
  quizAnswers?: Record<string, number>
  quizVoteCounts?: Record<string, number[]>
  onQuizVote?: (questionId: string, optionIdx: number) => void
  hasBottomBar?: boolean
  pinnedMessage?: { text: string; author?: string } | null
  isAdmin?: boolean
  isBanned?: boolean
  onDeleteMessage?: (messageId: string) => void
  onBanUser?: (leadEmail: string | null, sessionId: string) => void
  theme?: 'dark' | 'light' | 'youtube'
  userName?: string
  disableQa?: boolean
  className?: string
  lang?: 'pt' | 'en' | 'es'
}

function formatYtHandle(name: string): string {
  if (name.startsWith('@')) return name
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-zA-Z0-9\s_]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
  return `@${clean}`
}

export default function ChatPanel({
  messages,
  qaMessages,
  visibleMaterials,
  materials,
  elapsedSeconds,
  aiTyping,
  defaultTab = 'chat',
  mobileChatOpen = false,
  onSendMessage,
  onSendQa,
  quizAnswers = {},
  quizVoteCounts = {},
  onQuizVote = () => {},
  hasBottomBar = false,
  pinnedMessage = null,
  isAdmin = false,
  isBanned = false,
  onDeleteMessage,
  onBanUser,
  theme,
  userName = 'Você',
  disableQa = false,
  className = '',
  lang = 'pt',
}: ChatPanelProps) {
  const t = TRANSLATIONS[lang]
  const [chatTab, setChatTab] = useState<ChatTab>(defaultTab)
  const [chatInput, setChatInput] = useState('')
  const [qaInput, setQaInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fallback from Q&A if disabled
  useEffect(() => {
    if (disableQa && chatTab === 'qa') {
      setChatTab('chat')
    }
  }, [disableQa, chatTab])

  function handleSendChat() {
    if (!chatInput.trim()) return
    onSendMessage(chatInput.trim())
    setChatInput('')
  }

  function handleSendQa() {
    if (!qaInput.trim()) return
    onSendQa(qaInput.trim())
    setQaInput('')
  }

  return (
    <div className={`chat-section ${className} ${mobileChatOpen ? ' mobile-chat-open' : ''}`}>
      {/* YT CHAT HEADER */}
      {theme === 'youtube' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #303030',
          background: '#0f0f0f',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{t.liveChat}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff">
              <path d="M12 15.25L6 9.25L7.41 7.84L12 12.43L16.59 7.84L18 9.25L12 15.25Z" />
            </svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#aaaaaa' }}>{t.learnMore}</span>
            <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 2 }} disabled>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* TABS HEADER */}
      <div style={theme === 'youtube' ? {
        display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid #303030',
        background: '#0f0f0f',
      } : {
        display: 'flex', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}>
        {([
          { id: 'chat', label: t.chatTab, count: messages.filter(m => !m.isBroadcast).length },
          ...(!disableQa ? [{ id: 'qa', label: t.qaTab, count: qaMessages.length }] : []),
          ...(visibleMaterials.length > 0 || materials.length > 0
            ? [{ id: 'materials', label: t.materialsTab, count: visibleMaterials.length }]
            : []),
        ] as any[]).map(tab => {
          const isActive = chatTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setChatTab(tab.id)}
              className={`chat-tab-btn ${isActive ? 'active' : ''}`}
              style={theme === 'youtube' ? {
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                background: isActive ? '#ffffff' : '#272727',
                color: isActive ? '#0f0f0f' : '#ffffff',
                borderRadius: 100, border: 'none', cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              } : {
                flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 600,
                background: 'none', border: 'none', cursor: 'pointer',
                color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              {theme === 'youtube' ? (
                tab.id === 'chat' ? (lang === 'pt' ? 'Chat' : lang === 'es' ? 'Chat' : 'Chat') : tab.id === 'qa' ? (lang === 'pt' ? 'Q&A' : lang === 'es' ? 'P&R' : 'Q&A') : (lang === 'pt' ? 'Materiais' : lang === 'es' ? 'Materiales' : 'Materials')
              ) : tab.label}
              {tab.count > 0 && (
                <span style={{
                  background: isActive ? (theme === 'youtube' ? '#0f0f0f' : 'var(--brand)') : (theme === 'youtube' ? '#3e3e3e' : 'var(--border)'),
                  color: isActive ? (theme === 'youtube' ? '#ffffff' : '#fff') : (theme === 'youtube' ? '#aaaaaa' : 'var(--text-muted)'),
                  borderRadius: 99, padding: '0px 6px', fontSize: 10, fontWeight: 700,
                }}>{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* PINNED MESSAGE BANNER */}
      {pinnedMessage && chatTab === 'chat' && (
        <div className="pinned-message-banner">
          <span className="pinned-message-icon">📌</span>
          <div className="pinned-message-body">
            <div className="pinned-message-label">Mensagem Fixada</div>
            <div className="pinned-message-text">{pinnedMessage.text}</div>
            {pinnedMessage.author && (
              <div className="pinned-message-author">— {pinnedMessage.author}</div>
            )}
          </div>
        </div>
      )}

      {/* CHAT TAB */}
      {chatTab === 'chat' && (
        <div className="chat-messages">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 32 }}>
              Seja o primeiro a comentar! 👋
            </div>
          )}
          {messages.slice(-150).map((msg, i) => {
            // Quiz card message
            if (msg.quiz_card) {
              return (
                <QuizCard
                  key={msg.id || i}
                  card={msg.quiz_card}
                  userAnswer={quizAnswers[msg.quiz_card.question_id] ?? null}
                  voteCounts={quizVoteCounts[msg.quiz_card.question_id] || new Array(msg.quiz_card.options.length).fill(0)}
                  onVote={(optIdx) => onQuizVote?.(msg.quiz_card!.question_id, optIdx)}
                  theme={theme}
                />
              )
            }

            // Super Chat message parsing
            const isBroadcast = msg.isBroadcast
            const superChatMatch = !isBroadcast && msg.text ? msg.text.match(/^\[SUPERCHAT:([^\]]+)\]\s*([\s\S]*)/i) : null
            if (superChatMatch) {
              const amount = superChatMatch[1].trim()
              const messageText = superChatMatch[2].trim()
              const colors = getSuperChatColors(amount)
              
              return (
                <div key={msg.id || i} style={{
                  background: colors.headerBg,
                  borderRadius: 8,
                  margin: '8px 0',
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  fontSize: 13,
                  width: '100%',
                }}>
                  {/* Header */}
                  <div style={{
                    background: colors.headerBg,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: colors.text,
                    fontWeight: 700,
                  }}>
                    <div
                      style={{
                        background: 'var(--brand)',
                        backgroundImage: msg.avatar ? `url(${msg.avatar})` : undefined,
                        backgroundSize: 'cover',
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: '#fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}
                    >
                      {!msg.avatar && getInitials(msg.author)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 12, opacity: 0.85, color: colors.text }}>{msg.author}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>{amount}</span>
                    </div>
                  </div>
                  {/* Body */}
                  {messageText && (
                    <div style={{
                      background: colors.bodyBg,
                      padding: '10px 12px',
                      color: colors.text,
                      lineHeight: 1.45,
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      {parseMarkdownLinks(messageText)}
                    </div>
                  )}
                </div>
              )
            }

            const isAi = msg.author?.startsWith('🤖')
            const isPitchCard = msg.id?.startsWith('pitch-chat-')
            return (
              <div key={msg.id || i} className="chat-message" style={isPitchCard ? {
                background: 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(99,102,241,0.08))',
                borderRadius: 10, padding: '8px 10px',
                border: '1px solid rgba(34,197,94,0.35)', margin: '4px 0',
              } : isBroadcast ? {
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
                      background: isPitchCard ? 'linear-gradient(135deg, #22c55e, #6366f1)'
                        : isAi ? 'var(--brand)'
                        : msg.isSimulated
                          ? `hsl(${(msg.author.charCodeAt(0) * 37) % 360}, 70%, 40%)`
                          : 'var(--brand)',
                      backgroundImage: msg.avatar ? `url(${msg.avatar})` : undefined,
                      backgroundSize: 'cover',
                      width: theme === 'youtube' ? 24 : undefined,
                      height: theme === 'youtube' ? 24 : undefined,
                    }}
                  >
                    {!msg.avatar && (isPitchCard ? '🎁' : getInitials(msg.author))}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!isBroadcast && theme === 'youtube' ? (
                    <div style={{ display: 'inline', alignItems: 'baseline', fontSize: 13, lineHeight: '1.4' }}>
                      <span style={{
                        fontWeight: 600,
                        color: isPitchCard ? '#22c55e' : isAi ? '#3ea6ff' : (msg.author.charCodeAt(0) % 5 === 0 ? '#2ba640' : '#aaaaaa'),
                        marginRight: 8,
                        cursor: 'pointer'
                      }}>
                        {formatYtHandle(msg.author)}
                      </span>
                      <span style={{ color: '#f1f1f1', whiteSpace: 'pre-line' }}>{msg.text}</span>
                      {isAdmin && !isPitchCard && (
                        <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8, verticalAlign: 'middle' }}>
                          <button
                            title="Deletar comentário"
                            onClick={() => msg.id && onDeleteMessage?.(msg.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, opacity: 0.6 }}
                          >
                            🗑️
                          </button>
                          {!msg.isSimulated && (
                            <button
                              title="Banir usuário"
                              onClick={() => {
                                const confirmBan = confirm(`Tem certeza que deseja suspender ${msg.author} do chat?`)
                                if (confirmBan) {
                                  onBanUser?.((msg as any).lead_email || null, (msg as any).session_id || '')
                                }
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, opacity: 0.6 }}
                            >
                              🚫
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  ) : !isBroadcast ? (
                    <div className="chat-msg-author" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                      ...(isPitchCard ? { color: '#22c55e' } : isAi ? { color: 'var(--brand)' } : {})
                    }}>
                      <span>{msg.author}{isPitchCard && ' 🎯'}</span>

                      {/* Admin badges */}
                      {isAdmin && !isPitchCard && (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: msg.isSimulated ? 'rgba(167, 139, 250, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                          color: msg.isSimulated ? '#a78bfa' : '#22c55e',
                          border: msg.isSimulated ? '1px solid rgba(167, 139, 250, 0.2)' : '1px solid rgba(34, 197, 94, 0.2)',
                        }} title={msg.isSimulated ? 'Espectador simulado por agendamento' : `Usuário real do webinar`}>
                          {msg.isSimulated ? '🤖 Simulado' : '👤 Real'}
                        </span>
                      )}

                      {/* Admin actions */}
                      {isAdmin && !isPitchCard && (
                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
                          <button
                            title="Deletar comentário"
                            onClick={() => msg.id && onDeleteMessage?.(msg.id)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: 2, fontSize: 11, opacity: 0.6,
                              transition: 'opacity 0.2s', outline: 'none'
                            }}
                            onMouseOver={e => e.currentTarget.style.opacity = '1'}
                            onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
                          >
                            🗑️
                          </button>
                          {!msg.isSimulated && (
                            <button
                              title="Banir usuário"
                              onClick={() => {
                                const confirmBan = confirm(`Tem certeza que deseja suspender ${msg.author} do chat?`)
                                if (confirmBan) {
                                  onBanUser?.((msg as any).lead_email || null, (msg as any).session_id || '')
                                }
                              }}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: 2, fontSize: 11, opacity: 0.6,
                                transition: 'opacity 0.2s', outline: 'none'
                              }}
                              onMouseOver={e => e.currentTarget.style.opacity = '1'}
                              onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
                            >
                              🚫
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {theme !== 'youtube' && (
                    <div className="chat-msg-text" style={{
                      ...(isBroadcast ? { color: 'var(--success)', fontWeight: 600 } : {}),
                      whiteSpace: 'pre-line',
                    }}>
                      {msg.text}
                    </div>
                  )}

                  {isBroadcast && theme === 'youtube' && (
                    <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600, whiteSpace: 'pre-line' }}>
                      {msg.text}
                    </div>
                  )}

                  {msg.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.image_url}
                      alt="Produto"
                      style={{
                        width: '100%', borderRadius: 8, marginTop: 6,
                        maxHeight: 160, objectFit: 'cover',
                        cursor: msg.link_url ? 'pointer' : 'default',
                      }}
                      onClick={() => msg.link_url && window.open(msg.link_url, '_blank')}
                    />
                  )}
                  {msg.link_url && (
                    <a
                      href={msg.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block', marginTop: 6, padding: '8px 12px',
                        background: 'var(--brand)', color: '#fff',
                        borderRadius: 8, fontSize: 12, fontWeight: 700,
                        textAlign: 'center', textDecoration: 'none',
                      }}
                    >
                      {msg.link_text || 'Ver agora →'}
                    </a>
                  )}
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
              rel="noopener noreferrer"
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

      {/* DYNAMIC INPUT BY TAB */}
      <div className="chat-input-area" style={{
        paddingBottom: hasBottomBar ? 'calc(72px + env(safe-area-inset-bottom, 0px))' : undefined,
        borderTop: theme === 'youtube' ? '1px solid #303030' : undefined,
        background: theme === 'youtube' ? '#0f0f0f' : undefined,
      }}>
        {chatTab === 'chat' && (
          theme === 'youtube' ? (
            <div style={{ display: 'flex', gap: 12, padding: '12px 16px', width: '100%', alignItems: 'center' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--brand)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 'bold', flexShrink: 0
              }}>
                {getInitials(userName)}
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#272727', borderRadius: 20, padding: '4px 12px' }}>
                <input
                  type="text"
                  placeholder={isBanned ? "Você foi suspenso deste chat." : "Diga algo..."}
                  disabled={isBanned}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    outline: 'none',
                    fontSize: 13,
                    padding: '6px 0',
                  }}
                />
                <button
                  onClick={handleSendChat}
                  disabled={isBanned || !chatInput.trim()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: chatInput.trim() ? '#3ea6ff' : '#717171',
                    cursor: chatInput.trim() ? 'pointer' : 'default',
                    fontSize: 13,
                    fontWeight: 'bold',
                    padding: '4px 8px',
                  }}
                >
                  Enviar
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                type="text"
                className="chat-input"
                placeholder={isBanned ? "Você foi suspenso deste chat." : "Digite sua mensagem..."}
                disabled={isBanned}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
              />
              <button className="btn btn-primary btn-sm" disabled={isBanned} onClick={handleSendChat}>→</button>
            </>
          )
        )}
        {chatTab === 'qa' && (
          theme === 'youtube' ? (
            <div style={{ display: 'flex', gap: 12, padding: '12px 16px', width: '100%', alignItems: 'center' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--brand)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 'bold', flexShrink: 0
              }}>
                {getInitials(userName)}
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#272727', borderRadius: 20, padding: '4px 12px' }}>
                <input
                  type="text"
                  placeholder={isBanned ? "Você foi suspenso deste chat." : "Envie sua dúvida..."}
                  disabled={isBanned}
                  value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendQa()}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    outline: 'none',
                    fontSize: 13,
                    padding: '6px 0',
                  }}
                />
                <button
                  onClick={handleSendQa}
                  disabled={isBanned || !qaInput.trim()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: qaInput.trim() ? '#3ea6ff' : '#717171',
                    cursor: qaInput.trim() ? 'pointer' : 'default',
                    fontSize: 13,
                    fontWeight: 'bold',
                    padding: '4px 8px',
                  }}
                >
                  Enviar
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                type="text"
                className="chat-input"
                placeholder={isBanned ? "Você foi suspenso deste chat." : "Envie sua dúvida..."}
                disabled={isBanned}
                value={qaInput}
                onChange={e => setQaInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendQa()}
              />
              <button className="btn btn-primary btn-sm" disabled={isBanned} onClick={handleSendQa}>→</button>
            </>
          )
        )}
        {chatTab === 'materials' && (
          <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
            🔒 Materiais são liberados pelo apresentador durante o webinar
          </div>
        )}
      </div>
    </div>
  )
}
