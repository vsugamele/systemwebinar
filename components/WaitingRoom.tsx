'use client'

import { useEffect, useState } from 'react'

interface Props {
  message: string
  delaySeconds: number
  /** Seconds already elapsed since session_started_at (0 if no session clock) */
  startOffset: number
  webinarName: string
  brandColor?: string
  onEnter: () => void
}

function pad(n: number) { return String(n).padStart(2, '0') }

export default function WaitingRoom({ message, delaySeconds, startOffset, webinarName, brandColor = '#6366f1', onEnter }: Props) {
  // Remaining = how many seconds the viewer still needs to wait.
  // If startOffset >= delaySeconds the viewer should skip waiting entirely.
  const initialRemaining = Math.max(0, delaySeconds - startOffset)
  const [remaining, setRemaining] = useState(initialRemaining)
  const [dots, setDots] = useState('.')

  // Animated dots
  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500)
    return () => clearInterval(iv)
  }, [])

  // Countdown — uses wall-clock so the remaining time is always in sync
  useEffect(() => {
    if (initialRemaining <= 0) { onEnter(); return }
    const deadline = Date.now() + initialRemaining * 1000
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) { clearInterval(iv); onEnter() }
    }, 500)
    return () => clearInterval(iv)
  }, []) // eslint-disable-line

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  // Progress based on original full delay (not startOffset-adjusted) so the
  // arc fills from its current position rather than always starting empty.
  const progress = delaySeconds > 0 ? 1 - remaining / delaySeconds : 1

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)', padding: 24, textAlign: 'center',
    }}>
      {/* Animated pulsing ring */}
      <div style={{ position: 'relative', marginBottom: 40 }}>
        <div style={{
          width: 140, height: 140, borderRadius: '50%',
          border: `3px solid ${brandColor}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {/* SVG circular progress */}
          <svg style={{ position: 'absolute', inset: -3, width: 146, height: 146 }} viewBox="0 0 146 146">
            <circle cx="73" cy="73" r="70" fill="none" stroke={`${brandColor}22`} strokeWidth="3" />
            <circle
              cx="73" cy="73" r="70" fill="none" stroke={brandColor} strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 70}`}
              strokeDashoffset={`${2 * Math.PI * 70 * (1 - progress)}`}
              strokeLinecap="round"
              transform="rotate(-90 73 73)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, color: brandColor, fontFamily: 'monospace', letterSpacing: 2 }}>
              {pad(minutes)}:{pad(seconds)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>restantes</div>
          </div>
        </div>

        {/* Pulsing rings */}
        <div style={{
          position: 'absolute', inset: -20, borderRadius: '50%',
          border: `1px solid ${brandColor}33`,
          animation: 'waitPulse 2s ease-out infinite',
          pointerEvents: 'none',
        }} />
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: `${brandColor}15`, border: `1px solid ${brandColor}40`,
        borderRadius: 99, padding: '6px 16px', marginBottom: 20,
        fontSize: 12, color: brandColor, fontWeight: 600,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
          display: 'inline-block', animation: 'livePulse 1.2s ease-in-out infinite'
        }} />
        AO VIVO EM BREVE
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 12, maxWidth: 480 }}>
        {webinarName}
      </h1>

      <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 400, lineHeight: 1.6, marginBottom: 32 }}>
        {message}{dots}
      </p>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '16px 24px', display: 'flex', gap: 32,
        fontSize: 13, color: 'var(--text-muted)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>🎙️</div>
          <div>Apresentação <br />Exclusiva</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>💡</div>
          <div>Conteúdo <br />Aplicável</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>🎁</div>
          <div>Bônus <br />Exclusivos</div>
        </div>
      </div>

      <style>{`
        @keyframes waitPulse {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
