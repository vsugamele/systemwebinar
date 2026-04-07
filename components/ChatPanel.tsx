import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'

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

interface ChatPanelProps {
  messages: ChatMessage[]
  qaMessages: { id: string; author: string; text: string; answered?: string }[]
  visibleMaterials: Material[]
  materials: Material[]
  elapsedSeconds: number
  aiTyping: boolean
  defaultTab?: ChatTab
  onSendMessage: (text: string) => void
  onSendQa: (text: string) => void
}

export default function ChatPanel({
  messages,
  qaMessages,
  visibleMaterials,
  materials,
  elapsedSeconds,
  aiTyping,
  defaultTab = 'chat',
  onSendMessage,
  onSendQa,
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
