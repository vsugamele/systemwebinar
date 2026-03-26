'use client'

import { useState } from 'react'
import type { Webinar } from '@/types'

interface Props {
  webinar: Webinar & { projects?: { name?: string; accent_color?: string } }
}

export default function RegisterForm({ webinar }: Props) {
  const accent = (webinar as any).projects?.accent_color || '#6366f1'
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, webinar_id: webinar.id }),
      })

      if (!res.ok) throw new Error('Erro ao registrar')
      setSuccess(true)
    } catch (err) {
      setError('Erro ao realizar inscrição. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', flexDirection: 'column', gap: 24, textAlign: 'center', padding: 24
      }}>
        <div style={{ fontSize: 64 }}>🎉</div>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Inscrição confirmada!</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 400 }}>
          Você receberá um e-mail de confirmação em breve com o link de acesso ao webinar.
        </p>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24, maxWidth: 360
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Webinar</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{webinar.name}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="register-page">
      <style>{`
        :root {
          --brand: ${accent};
          --brand-dark: ${accent}dd;
          --brand-glow: ${accent}44;
        }
      `}</style>

      <div className="register-hero">
        <div className="register-bg-glow" />
        <div className="register-eyebrow">
          <span>🔴</span>
          WEBINAR GRATUITO
        </div>

        <h1 className="register-hero-title">{webinar.name}</h1>

        {webinar.description && (
          <p className="register-hero-desc">{webinar.description}</p>
        )}

        {/* Registration form card */}
        <div className="register-form-card">
          <p className="register-form-title">Garantir Minha Vaga Gratuita</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Seu nome completo</label>
              <input
                className="form-input"
                placeholder="João da Silva"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Seu melhor e-mail</label>
              <input
                type="email"
                className="form-input"
                placeholder="joao@email.com"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">WhatsApp (opcional)</label>
              <input
                className="form-input"
                placeholder="(11) 99999-9999"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>

            {error && <p className="form-error">⚠ {error}</p>}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                color: 'white', border: 'none', borderRadius: 12,
                padding: '16px 24px', fontSize: 16, fontWeight: 700,
                cursor: 'pointer', marginTop: 8,
                transition: 'all 0.2s ease',
                boxShadow: `0 8px 32px ${accent}44`,
              }}
            >
              {loading ? '⏳ Inscrevendo...' : '🎯 Garantir Minha Vaga Gratuita →'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
            🔒 Seus dados estão seguros. Sem spam.
          </p>
        </div>

        {/* Benefits */}
        <div className="register-info-grid" style={{ marginTop: 48 }}>
          <div className="register-info-item">
            <div className="register-info-icon">🎓</div>
            <div className="register-info-label">Conteúdo</div>
            <div className="register-info-value">100% gratuito</div>
          </div>
          <div className="register-info-item">
            <div className="register-info-icon">⏱️</div>
            <div className="register-info-label">Acesso</div>
            <div className="register-info-value">Imediato</div>
          </div>
          <div className="register-info-item">
            <div className="register-info-icon">💬</div>
            <div className="register-info-label">Chat</div>
            <div className="register-info-value">Ao vivo</div>
          </div>
          <div className="register-info-item">
            <div className="register-info-icon">🔔</div>
            <div className="register-info-label">Lembrete</div>
            <div className="register-info-value">Por e-mail</div>
          </div>
        </div>
      </div>
    </div>
  )
}
