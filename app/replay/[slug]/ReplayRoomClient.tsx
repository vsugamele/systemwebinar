'use client'

import { useEffect, useRef, useState } from 'react'
import type { Webinar } from '@/types'

function isVimeoUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(u.hostname)
  } catch { return false }
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
    return `https://player.vimeo.com/video/${videoId}?autoplay=1&muted=1&controls=1&title=0&byline=0&portrait=0&playsinline=1`
  } catch { return null }
}

function isVturbUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname === 'scripts.converteai.net' || u.hostname.includes('vturb')
  } catch { return false }
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
    return () => { document.getElementById(`scr_${playerId}`)?.remove() }
  }, [scriptUrl, playerId])

  return <div id={`vid_${playerId}`} style={{ position: 'relative', width: '100%', height: '100%' }} />
}

interface Props {
  webinar: Webinar & { webi_projects?: { name: string; accent_color: string } }
}

export default function ReplayRoomClient({ webinar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const accentColor = webinar.webi_projects?.accent_color || '#6366f1'

  useEffect(() => {
    document.documentElement.style.setProperty('--brand', accentColor)
  }, [accentColor])

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value)
    if (videoRef.current) videoRef.current.currentTime = t
    setCurrentTime(t)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 20px', fontFamily: 'Inter, sans-serif'
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 900, marginBottom: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '12px 20px',
        }}>
          <span style={{
            background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700,
            padding: '3px 10px', borderRadius: 20, letterSpacing: 1
          }}>🔁 REPLAY</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>{webinar.name}</span>
          <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 12 }}>
            {webinar.webi_projects?.name}
          </span>
        </div>
      </div>

      {/* Video */}
      <div style={{ width: '100%', maxWidth: 900, position: 'relative' }}>
        <div style={{
          background: webinar.video_url && (isVimeoUrl(webinar.video_url) || isVturbUrl(webinar.video_url)) ? 'transparent' : '#000',
          borderRadius: 16, overflow: 'hidden',
          aspectRatio: '16/9', border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6)'
        }}>
          {webinar.video_url ? (
            isVimeoUrl(webinar.video_url) ? (
              <iframe
                src={getVimeoEmbedUrl(webinar.video_url) || ''}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                title={webinar.name}
              />
            ) : isVturbUrl(webinar.video_url) ? (
              (() => {
                const pid = getVturbPlayerId(webinar.video_url)
                return pid ? (
                  <VturbPlayer scriptUrl={webinar.video_url} playerId={pid} />
                ) : null
              })()
            ) : (
              <video
                ref={videoRef}
                src={webinar.video_url}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            )
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: '#475569', flexDirection: 'column', gap: 12
            }}>
              <div style={{ fontSize: 48 }}>🎬</div>
              <div style={{ fontSize: 14 }}>Nenhum vídeo configurado</div>
            </div>
          )}
        </div>

        {/* Controls — only for native video (MP4/HLS); Vimeo and VTurb have their own controls */}
        {webinar.video_url && !isVimeoUrl(webinar.video_url) && !isVturbUrl(webinar.video_url) && (
          <div style={{
            marginTop: 12, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '16px 20px',
          }}>
            <input
              type="range" min={0} max={duration || 100} step={0.5}
              value={currentTime}
              onChange={handleSeek}
              style={{ width: '100%', accentColor, marginBottom: 8, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => { if (playing) { videoRef.current?.pause() } else { void videoRef.current?.play() } }}
                style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: accentColor, border: 'none', cursor: 'pointer',
                  color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                {playing ? '⏸' : '▶'}
              </button>
              <span style={{ color: '#cbd5e1', fontSize: 13, fontFamily: 'monospace' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <span style={{ marginLeft: 'auto', background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: 0.5 }}>
                🔁 REPLAY
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      {webinar.description && (
        <div style={{
          width: '100%', maxWidth: 900, marginTop: 24,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: '20px 24px',
          color: '#94a3b8', fontSize: 14, lineHeight: 1.7
        }}>
          {webinar.description}
        </div>
      )}
    </div>
  )
}
