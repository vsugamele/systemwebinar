'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Webinar } from '@/types'

type FormFieldConfig = string | { key: string; label?: string; required?: boolean }

interface Props {
  webinar: Webinar & { webi_projects?: { name?: string; accent_color?: string }; form_fields?: FormFieldConfig[] }
  slug: string
}

const FIELD_META: Record<string, { label: string; placeholder: string; type?: string }> = {
  phone:    { label: 'Telefone / WhatsApp', placeholder: '(11) 99999-9999', type: 'tel' },
  whatsapp: { label: 'WhatsApp com DDD', placeholder: '(11) 99999-9999', type: 'tel' },
  cpf:      { label: 'CPF', placeholder: '000.000.000-00' },
  company:  { label: 'Empresa', placeholder: 'Nome da sua empresa' },
  role:     { label: 'Cargo ou Profissão', placeholder: 'Ex.: Empresário, Médico...' },
  custom_1: { label: 'Informação adicional', placeholder: 'Resposta...' },
}

export default function RegisterForm({ webinar, slug }: Props) {
  const router = useRouter()
  const accent = webinar.webi_projects?.accent_color || '#6366f1'

  // Parse form_fields config
  const rawFields = webinar.form_fields ?? null
  const extraFields: Array<{ key: string; label: string; placeholder: string; type?: string; required?: boolean }> =
    (Array.isArray(rawFields) ? rawFields : [{ key: 'phone' }])
      .map((f: FormFieldConfig) => {
        const key = typeof f === 'string' ? f : f.key
        const meta = FIELD_META[key] || { label: key, placeholder: '' }
        const label = (typeof f === 'object' && f.label) ? f.label : meta.label
        return { key, label, placeholder: meta.placeholder, type: meta.type }
      })
      .filter(f => f.key !== 'name' && f.key !== 'email') // name & email are always present
  const [form, setForm] = useState<Record<string, string>>({ name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const sp = new URLSearchParams(window.location.search)
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          webinar_id: webinar.id,
          utm_source: sp.get('utm_source'),
          utm_medium: sp.get('utm_medium'),
          utm_campaign: sp.get('utm_campaign'),
          page_url: window.location.href,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao registrar')
      }

      // Store lead data for Imperio HQ room tracking
      try {
        localStorage.setItem('webi_lead_email', form.email)
        localStorage.setItem('webi_lead_name', form.name)
        localStorage.setItem('webi_lead_phone', form.phone || '')
      } catch {}

      // Redirect to live webinar room
      router.push(`/w/${slug}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao realizar inscrição. Tente novamente.')
    } finally {
      setLoading(false)
    }
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

            {/* Dynamic extra fields */}
            {extraFields.map(field => (
              <div key={field.key} className="form-group">
                <label className="form-label">{field.label}</label>
                <input
                  type={field.type || 'text'}
                  className="form-input"
                  placeholder={field.placeholder}
                  value={form[field.key] || ''}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                />
              </div>
            ))}

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
