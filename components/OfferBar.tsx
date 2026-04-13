'use client'

import { useEffect, useState } from 'react'

interface OfferBarProps {
  visible: boolean
  ctaText: string
  ctaUrl: string
  countdown: number        // seconds remaining (0 = no countdown)
  scarcitySpots: number   // 0 = no scarcity
  imageUrl?: string
  onCTAClick: () => void
}

function fmt(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

export default function OfferBar({ visible, ctaText, ctaUrl, countdown, scarcitySpots, imageUrl, onCTAClick }: OfferBarProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (visible) {
      // slight delay to trigger CSS transition
      const t = setTimeout(() => setMounted(true), 20)
      return () => clearTimeout(t)
    } else {
      setMounted(false)
    }
  }, [visible])

  if (!visible) return null

  const urgentSpots = scarcitySpots > 0 && scarcitySpots <= 5
  const urgentCountdown = countdown > 0 && countdown <= 300 // last 5 min

  return (
    <div
      className="offer-bar"
      style={{
        transform: mounted ? 'translateY(0)' : 'translateY(100%)',
        opacity: mounted ? 1 : 0,
        transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease',
      }}
    >
      {/* Left side: scarcity or image */}
      <div className="offer-bar-left">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="offer-bar-img" />
        )}
        {scarcitySpots > 0 && (
          <div className={`offer-bar-scarcity ${urgentSpots ? 'urgent' : ''}`}>
            <span className="offer-bar-scarcity-dot" />
            <span>
              {urgentSpots ? '🔴' : '🟡'}{' '}
              <strong>{scarcitySpots}</strong>{' '}
              {scarcitySpots === 1 ? 'vaga restante' : 'vagas restantes'}
            </span>
          </div>
        )}
      </div>

      {/* Center: CTA button */}
      <div className="offer-bar-center">
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="offer-bar-cta"
          onClick={onCTAClick}
        >
          {ctaText}
          <span className="offer-bar-arrow">→</span>
        </a>
        <div className="offer-bar-pulse" />
      </div>

      {/* Right side: countdown */}
      {countdown > 0 && (
        <div className={`offer-bar-right ${urgentCountdown ? 'urgent' : ''}`}>
          <div className="offer-bar-countdown-label">⏳ A oferta expira em</div>
          <div className="offer-bar-countdown-value">{fmt(countdown)}</div>
        </div>
      )}
    </div>
  )
}
