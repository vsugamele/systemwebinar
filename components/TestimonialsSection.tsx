'use client'

import { useEffect, useState } from 'react'

interface Testimonial {
  id: string
  name: string
  role: string
  text: string
  avatar_url: string
  rating: number
  show_at_seconds: number
}

interface Props {
  webinarId: string
  webinarName: string
  currentTime: number // seconds of video elapsed
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: 14, color: i <= rating ? '#f59e0b' : '#374151' }}>★</span>
      ))}
    </div>
  )
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) return (
    <img src={url} alt={name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
  )
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16, fontWeight: 800, color: 'white', flexShrink: 0,
    }}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

export default function TestimonialsSection({ webinarId, webinarName, currentTime }: Props) {
  const [allTestimonials, setAllTestimonials] = useState<Testimonial[]>([])
  const [visible, setVisible] = useState<Testimonial[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', role: '', text: '', rating: 5 })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/testimonials?webinar_id=${webinarId}`)
      .then(r => r.json())
      .then(data => setAllTestimonials(data))
      .catch(() => {})
  }, [webinarId])

  // Reveal testimonials as video progresses
  useEffect(() => {
    const toShow = allTestimonials.filter(t => t.show_at_seconds <= currentTime)
    setVisible(toShow)
  }, [currentTime, allTestimonials])

  async function submitTestimonial(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.text.trim()) return
    setSubmitting(true)
    await fetch('/api/testimonials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webinar_id: webinarId, ...form }),
    }).catch(() => {})
    setSubmitting(false)
    setSubmitted(true)
    setShowForm(false)
  }

  return (
    <div style={{ padding: '32px 24px', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
              💬 O que dizem sobre o webinar
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Experiências reais de quem assistiu
            </p>
          </div>
          {!submitted && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowForm(v => !v)}
            >
              {showForm ? '✕ Cancelar' : '✍️ Deixar depoimento'}
            </button>
          )}
        </div>

        {/* Submit form */}
        {showForm && !submitted && (
          <form onSubmit={submitTestimonial} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 24, marginBottom: 28,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Compartilhe sua experiência</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Seu nome</label>
                <input className="form-input" placeholder="João Silva" required
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Cargo / Área</label>
                <input className="form-input" placeholder="Empreendedor"
                  value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Seu depoimento</label>
              <textarea className="form-input" rows={3} required
                placeholder="O que você achou do webinar? Como ele te ajudou?"
                value={form.text}
                onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Avaliação</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <button key={i} type="button"
                    onClick={() => setForm(f => ({ ...f, rating: i }))}
                    style={{
                      fontSize: 24, background: 'none', border: 'none',
                      cursor: 'pointer', opacity: i <= form.rating ? 1 : 0.3,
                      transition: 'opacity 0.15s',
                    }}>
                    ★
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : '✅ Enviar depoimento'}
            </button>
          </form>
        )}

        {submitted && (
          <div style={{
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 12, padding: 16, marginBottom: 24, textAlign: 'center',
          }}>
            🎉 Obrigado pelo seu depoimento! Ele será revisado e publicado em breve.
          </div>
        )}

        {/* Testimonials grid */}
        {visible.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}>
            {visible.map(t => (
              <div key={t.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 20,
                animation: 'fadeIn 0.4s ease',
              }}>
                <StarRating rating={t.rating} />
                <p style={{
                  fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6,
                  margin: '12px 0', fontStyle: 'italic',
                }}>
                  "{t.text}"
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={t.name} url={t.avatar_url} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    {t.role && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.role}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !showForm && !submitted ? (
          <div style={{
            textAlign: 'center', padding: '24px 16px',
            color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6,
          }}>
            ✍️ Seja o primeiro a deixar um depoimento sobre este webinar!
          </div>
        ) : null}
      </div>
    </div>
  )
}
