'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface RegistrationGateProps {
  webinarId: string
  webinarName: string
  thumbnailUrl: string | null
  description: string | null
  projectId: string
  onRegistered?: (leadId: string) => void
}

export default function RegistrationGate({
  webinarId,
  webinarName,
  thumbnailUrl,
  description,
  projectId,
  onRegistered
}: RegistrationGateProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '')
    if (value.length > 11) value = value.slice(0, 11)
    if (value.length > 2) {
      value = `(${value.slice(0, 2)}) ` + value.slice(2)
    }
    if (value.length > 10) {
      value = value.slice(0, 10) + '-' + value.slice(10)
    }
    setForm({ ...form, phone: value })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const urlParams = new URL(window.location.href).searchParams
    const metadata = {
      utm_source: urlParams.get('utm_source') || null,
      utm_medium: urlParams.get('utm_medium') || null,
      utm_campaign: urlParams.get('utm_campaign') || null,
      utm_term: urlParams.get('utm_term') || null,
      utm_content: urlParams.get('utm_content') || null,
    }

    try {
      const res = await fetch('/api/leads/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webinarId,
          projectId,
          name: form.name,
          email: form.email,
          phone: form.phone,
          metadata
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Erro ao registrar. Tente novamente.')
      }

      const { leadId } = await res.json()
      if (onRegistered) onRegistered(leadId)
      else window.location.reload()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div className="card" style={{ maxWidth: 500, width: '100%', margin: '24px', overflow: 'hidden', padding: 0 }}>
        {thumbnailUrl && (
          <div style={{ width: '100%', height: 200, background: `url(${thumbnailUrl}) center/cover no-repeat` }} />
        )}
        <div style={{ padding: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>{webinarName}</h1>
          {description && <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>{description}</p>}
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <div style={{ color: '#ef4444', fontSize: 13, padding: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>{error}</div>}
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Seu Nome</label>
              <input
                type="text"
                required
                className="form-input"
                style={{ width: '100%' }}
                placeholder="Ex: João da Silva"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>E-mail</label>
              <input
                type="email"
                required
                className="form-input"
                style={{ width: '100%' }}
                placeholder="joao@email.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>WhatsApp (Opcional)</label>
              <input
                type="tel"
                className="form-input"
                style={{ width: '100%' }}
                placeholder="(11) 99999-9999"
                value={form.phone}
                onChange={handlePhoneChange}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: 15, width: '100%', marginTop: 8 }}
            >
              {loading ? 'Acessando...' : 'Liberar Acesso Agora'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--text-muted)' }}>
            Seus dados estão 100% seguros. Não enviamos spam.
          </div>
        </div>
      </div>
    </div>
  )
}
