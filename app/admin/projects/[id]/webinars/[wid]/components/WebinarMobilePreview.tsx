'use client'

import { useEffect, useRef, useState } from 'react'
import type { WebinarEvent, ChatMessagePayload, PitchButtonPayload, OfferPopupPayload } from '@/types'

interface WebinarMobilePreviewProps {
  currentTime: number // seconds
  events: WebinarEvent[]
  theme?: 'dark' | 'light' | 'youtube' | 'clear_vsl'
  accentColor?: string
}

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getAvatarColor(name: string) {
  const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function WebinarMobilePreview({ currentTime, events, theme = 'dark', accentColor = '#6366f1' }: WebinarMobilePreviewProps) {
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const [prevTime, setPrevTime] = useState(currentTime)

  const isDark = theme === 'dark' || theme === 'youtube'
  const bgMain = isDark ? '#121214' : '#f9fafb'
  const bgCard = isDark ? '#1e1e24' : '#ffffff'
  const textMain = isDark ? '#f3f4f6' : '#111827'
  const textMuted = isDark ? '#9ca3af' : '#6b7280'
  const border = isDark ? '#27272a' : '#e5e7eb'

  // Filter and sort events up to currentTime
  const activeEvents = events.filter(e => e.timestamp_seconds <= currentTime)
  
  // Chat messages
  const chatMessages = activeEvents
    .filter(e => e.type === 'chat_message')
    .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)

  // Auto-scroll chat when new messages appear or when skipping forward
  useEffect(() => {
    if (chatScrollRef.current && currentTime >= prevTime) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
    setPrevTime(currentTime)
  }, [chatMessages.length, currentTime, prevTime])

  // Active Pitch (latest pitch button that hasn't been hidden or expired)
  let activePitch: WebinarEvent | null = null
  const pitchEvents = activeEvents.filter(e => ['pitch_button', 'hide_pitch_button'].includes(e.type)).sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
  if (pitchEvents.length > 0) {
    const last = pitchEvents[pitchEvents.length - 1]
    if (last.type === 'pitch_button') {
      const p = last.payload as PitchButtonPayload
      if (!p.exit_at_seconds || p.exit_at_seconds > currentTime) {
        activePitch = last
      }
    }
  }

  // Active Popup (latest popup that hasn't expired)
  let activePopup: WebinarEvent | null = null
  const popupEvents = activeEvents.filter(e => e.type === 'offer_popup').sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
  if (popupEvents.length > 0) {
    const last = popupEvents[popupEvents.length - 1]
    const p = last.payload as OfferPopupPayload
    if (last.timestamp_seconds + (p.duration_seconds || 30) > currentTime) {
      activePopup = last
    }
  }

  return (
    <div style={{
      width: 320,
      height: 600,
      margin: '0 auto',
      background: bgMain,
      borderRadius: 40,
      border: '8px solid #000',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 2px #333',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Smartphone Notch / Top Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 120,
        height: 24,
        background: '#000',
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        zIndex: 20
      }} />

      {/* Video Area (Fake) */}
      <div style={{
        height: 220,
        background: '#000',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        {/* Playback time indicator */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          backdropFilter: 'blur(4px)'
        }}>
          <span style={{ color: '#ef4444', marginRight: 4 }}>●</span>
          {formatTime(currentTime)}
        </div>
        
        {/* Fake Video Content */}
        <div style={{ textAlign: 'center', color: '#fff', opacity: 0.8 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>▶</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Transmissão</div>
        </div>

        {/* Floating Offer Popup */}
        {activePopup && (
          <div style={{
            position: 'absolute',
            top: 40,
            left: 20,
            right: 20,
            background: bgCard,
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            border: `1px solid ${accentColor}44`,
            zIndex: 10,
            animation: 'slideDown 0.3s ease'
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: textMain, marginBottom: 4 }}>
              {(activePopup.payload as OfferPopupPayload).title}
            </div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 10 }}>
              {(activePopup.payload as OfferPopupPayload).subtitle || 'Não perca essa oportunidade.'}
            </div>
            <div style={{
              background: accentColor,
              color: '#fff',
              textAlign: 'center',
              padding: '6px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700
            }}>
              {(activePopup.payload as OfferPopupPayload).cta_text}
            </div>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Chat Header */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, background: bgMain, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: textMain }}>Bate-papo ao vivo</div>
        </div>

        {/* Messages */}
        <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, scrollBehavior: 'smooth' }}>
          {chatMessages.length === 0 ? (
            <div style={{ textAlign: 'center', color: textMuted, fontSize: 12, marginTop: 20 }}>
              Nenhuma mensagem no momento.
            </div>
          ) : (
            chatMessages.map(ev => {
              const p = ev.payload as ChatMessagePayload
              const name = p.author || 'Anônimo'
              const color = getAvatarColor(name)
              const initial = name.charAt(0).toUpperCase()
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 10, animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{name}</span>
                      <span style={{ fontSize: 10, color: textMuted }}>{formatTime(ev.timestamp_seconds)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: textMain, lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {p.text}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Input box mockup */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${border}`, background: bgMain, flexShrink: 0, paddingBottom: activePitch ? 80 : 24 }}>
          <div style={{ background: bgCard, border: `1px solid ${border}`, borderRadius: 20, padding: '8px 16px', color: textMuted, fontSize: 13 }}>
            Diga algo...
          </div>
        </div>

        {/* Sticky Offer Bar (Pitch) */}
        {activePitch && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: bgCard,
            padding: '16px',
            borderTop: `1px solid ${border}`,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            boxShadow: '0 -4px 15px rgba(0,0,0,0.05)',
            animation: 'slideUp 0.3s ease',
            zIndex: 10
          }}>
            <div style={{
              background: accentColor,
              color: '#fff',
              textAlign: 'center',
              padding: '12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 800,
              boxShadow: `0 4px 12px ${accentColor}44`,
              animation: 'pulse 2s infinite'
            }}>
              {(activePitch.payload as PitchButtonPayload).cta_text || 'Ver Oferta Completa'}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
      `}</style>
    </div>
  )
}
