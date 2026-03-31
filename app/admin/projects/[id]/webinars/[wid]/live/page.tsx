'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

function elapsedLabel(iso: string | null): string {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 0) return 'ainda não iniciou'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m rodando`
  if (m > 0) return `${m}m ${s}s rodando`
  return `${s}s rodando`
}

export default function LivePage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const tickRef = useRef<NodeJS.Timeout | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [webinarName, setWebinarName] = useState('')
  const [webinarSlug, setWebinarSlug] = useState('')
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState('')
  const [form, setForm] = useState({
    fake_viewers_start: 50,
    fake_viewers_peak: 500,
    fake_viewers_end: 150,
    fake_viewers_peak_at_pct: 30,
  })

  useEffect(() => {
    supabase
      .from('webi_webinars')
      .select('name, slug, session_started_at, fake_viewers_start, fake_viewers_peak, fake_viewers_end, fake_viewers_peak_at_pct')
      .eq('id', wid)
      .single()
      .then(({ data }) => {
        if (data) {
          setWebinarName(data.name)
          setWebinarSlug(data.slug)
          setSessionStartedAt(data.session_started_at ?? null)
          setForm({
            fake_viewers_start: data.fake_viewers_start ?? 50,
            fake_viewers_peak: data.fake_viewers_peak ?? 500,
            fake_viewers_end: data.fake_viewers_end ?? 150,
            fake_viewers_peak_at_pct: data.fake_viewers_peak_at_pct ?? 30,
          })
        }
        setLoading(false)
      })
  }, [wid])

  // Live elapsed ticker
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setElapsed(elapsedLabel(sessionStartedAt))
    }, 1000)
    setElapsed(elapsedLabel(sessionStartedAt))
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [sessionStartedAt])

  async function startSession() {
    setRestarting(true)
    const now = new Date().toISOString()
    await supabase.from('webi_webinars').update({ session_started_at: now }).eq('id', wid)
    setSessionStartedAt(now)
    setRestarting(false)
  }

  async function stopSession() {
    await supabase.from('webi_webinars').update({ session_started_at: null }).eq('id', wid)
    setSessionStartedAt(null)
  }

  async function saveViewers(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('webi_webinars').update(form).eq('id', wid)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const isLive = !!sessionStartedAt

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">🎬 Ao Vivo</h1>
          <p className="page-subtitle">Controle a sessão e a audiência da sua live</p>
        </div>

        <Link
          href={`/w/${webinarSlug}?test=1`}
          target="_blank"
          className="btn btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          👁 Pré-visualizar sala
        </Link>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>

        {/* SESSION CLOCK — primary action */}
        <div className="card" style={{
          border: isLive ? '1px solid rgba(34,197,94,0.4)' : '1px solid var(--border)',
          background: isLive ? 'rgba(34,197,94,0.04)' : 'var(--bg-card)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: isLive ? '#22c55e' : 'var(--border)',
                  boxShadow: isLive ? '0 0 8px #22c55e' : 'none',
                  animation: isLive ? 'livePulse 1.5s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontWeight: 700, fontSize: 16 }}>
                  {isLive ? 'Sessão em andamento' : 'Sessão não iniciada'}
                </span>
              </div>
              {isLive && (
                <div style={{ fontSize: 13, color: 'var(--success)', fontFamily: 'monospace', marginBottom: 4 }}>
                  ⏱ {elapsed}
                </div>
              )}
              <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 420 }}>
                {isLive
                  ? `Todos os participantes que entrarem verão o vídeo a partir do segundo correto. Reiniciar zerou o clock.`
                  : 'Clique em Iniciar para que todos os participantes vejam o mesmo ponto do vídeo em tempo real.'}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
              <button
                className="btn btn-primary"
                style={{ minWidth: 200 }}
                onClick={startSession}
                disabled={restarting}
              >
                {restarting ? '⏳ Iniciando...' : isLive ? '🔄 Reiniciar Sessão' : '▶ Iniciar Sessão'}
              </button>
              {isLive && (
                <button className="btn btn-ghost btn-sm" onClick={stopSession} style={{ textAlign: 'center' }}>
                  ✕ Parar e remover clock
                </button>
              )}
            </div>
          </div>
        </div>

        {/* VIEWER CURVE */}
        <form onSubmit={saveViewers}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👥 Curva de Audiência</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Como o contador de espectadores se comporta ao longo do webinar.
            </div>

            {/* Visual curve preview */}
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 4, height: 48,
              marginBottom: 20, padding: '0 4px',
            }}>
              {Array.from({ length: 20 }).map((_, i) => {
                const pct = i / 19
                const peakAt = form.fake_viewers_peak_at_pct / 100
                const peakEnd = Math.min(peakAt + 0.15, 0.8)
                let h: number
                if (pct <= peakAt) {
                  h = peakAt > 0 ? pct / peakAt : 1
                } else if (pct <= peakEnd) {
                  h = 1
                } else if (pct <= 0.85) {
                  h = 1 - (pct - peakEnd) / (0.85 - peakEnd)
                } else {
                  h = form.fake_viewers_end / form.fake_viewers_peak
                }
                const height = Math.max(4, Math.round(h * 44))
                return (
                  <div key={i} style={{
                    flex: 1, height, borderRadius: 3,
                    background: `hsl(252,90%,${45 + h * 20}%)`,
                    opacity: 0.8 + h * 0.2,
                  }} />
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {([
                { key: 'fake_viewers_start', label: 'Início', hint: 'Viewers quando a sala abre (t=0)' },
                { key: 'fake_viewers_peak', label: 'Pico', hint: 'Número máximo exibido' },
                { key: 'fake_viewers_end', label: 'Final', hint: 'Viewers ao fim do vídeo' },
                { key: 'fake_viewers_peak_at_pct', label: 'Pico em % do vídeo', hint: 'Ex: 30 = atingido em 30% do vídeo' },
              ] as const).map(({ key, label, hint }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{label}</label>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{hint}</div>
                  <input
                    type="number"
                    min={0}
                    max={key === 'fake_viewers_peak_at_pct' ? 100 : 100000}
                    className="form-input"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: +e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>

            <div style={{
              fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 16,
            }}>
              📈 {form.fake_viewers_start.toLocaleString('pt-BR')} → pico <strong>{form.fake_viewers_peak.toLocaleString('pt-BR')}</strong> em {form.fake_viewers_peak_at_pct}% → {form.fake_viewers_end.toLocaleString('pt-BR')}
            </div>

            <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? '⏳ Salvando...' : saved ? '✅ Salvo!' : '💾 Salvar curva'}
            </button>
          </div>
        </form>

        <style>{`
          @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        `}</style>
      </div>
    </>
  )
}
