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

// ---- QuizCard inline component ----
interface QuizCardProps {
  card: QuizCardData
  userAnswer: number | null
  voteCounts: number[]
  onVote: (optionIdx: number) => void
}

function QuizCard({ card, userAnswer, voteCounts, onVote }: QuizCardProps) {
  const voted = userAnswer !== null
  const totalVotes = voteCounts.reduce((a, b) => a + b, 0)

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
            {totalVotes} respostas
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
  onQuizVote,
}: ChatPanelProps) {
  const [chatTab, setChatTab] = useState<ChatTab>(defaultTab)
  const [chatInput, setChatInput] = useState('')
  const [qaInput, setQaInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div className={`chat-section${mobileChatOpen ? ' mobile-chat-open' : ''}`}>
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
                />
              )
            }

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
      <div className="chat-input-area">
        {chatTab === 'chat' && (
          <>
            <input
              type="text"
              className="chat-input"
              placeholder="Digite sua mensagem..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSendChat}>→</button>
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
              onKeyDown={e => e.key === 'Enter' && handleSendQa()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSendQa}>→</button>
          </>
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
