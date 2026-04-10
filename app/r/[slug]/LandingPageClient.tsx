'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface LandingProps {
  webinarId: string
  projectId: string
  slug: string
  params: { [key: string]: string | string[] | undefined }
  brandColor: string
  headline: string
  subheadline: string
  buttonText: string
  customBackgroundUrl?: string | null
}

export default function LandingPageClient({
  webinarId,
  projectId,
  slug,
  params,
  brandColor,
  headline,
  subheadline,
  buttonText,
  customBackgroundUrl,
}: LandingProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '' })

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

    const metadata = {
      utm_source: params?.utm_source || null,
      utm_medium: params?.utm_medium || null,
      utm_campaign: params?.utm_campaign || null,
      utm_term: params?.utm_term || null,
      utm_content: params?.utm_content || null,
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
        throw new Error(err.message || 'Erro ao processar inscrição.')
      }

      // Instead of waiting or showing thank you, redirect immediately to room 
      // where room logic dictates if it's counting down or live.
      router.push(`/w/${slug}`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: customBackgroundUrl ? `url(${customBackgroundUrl}) center/cover no-repeat fixed` : 'var(--bg-base)',
      padding: '24px',
      position: 'relative',
    }}>
      {/* Overlay to ensure text readability over any background */}
      {customBackgroundUrl && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 5, 8, 0.70)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 0
        }} />
      )}

      <div style={{
        maxWidth: 540,
        width: '100%',
        position: 'relative',
        zIndex: 1,
        animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}>
        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        
        {/* Box */}
        <div style={{
          background: 'rgba(20, 20, 25, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 24,
          padding: '48px 40px',
          boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
        }}>
          {/* Typo */}
          <h1 style={{ 
            fontSize: headline.length > 50 ? 28 : 34, 
            fontWeight: 800, 
            lineHeight: 1.2, 
            textAlign: 'center', 
            background: 'linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 16
          }}>
            {headline}
          </h1>

          {subheadline && (
            <p style={{
              fontSize: 16,
              color: '#A1A1AA',
              textAlign: 'center',
              lineHeight: 1.5,
              marginBottom: 36
            }}>
              {subheadline}
            </p>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && (
              <div style={{ color: '#ef4444', fontSize: 13, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}
            
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#E4E4E7' }}>Seu melhor e-mail</label>
              <input
                type="email"
                required
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: '16px',
                  fontSize: 15,
                  color: '#fff',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => e.target.style.borderColor = brandColor}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                placeholder="nome@email.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#E4E4E7' }}>Seu Nome</label>
              <input
                type="text"
                required
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: '16px',
                  fontSize: 15,
                  color: '#fff',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => e.target.style.borderColor = brandColor}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                placeholder="Ex: Ana Silva"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#E4E4E7' }}>WhatsApp (Opcional)</label>
              <input
                type="tel"
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: '16px',
                  fontSize: 15,
                  color: '#fff',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => e.target.style.borderColor = brandColor}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                placeholder="(11) 99999-9999"
                value={form.phone}
                onChange={handlePhoneChange}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                marginTop: 8,
                padding: '18px 24px',
                background: brandColor,
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 12,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: `0 8px 16px ${brandColor}40`,
                transition: 'all 0.2s ease',
                transform: loading ? 'scale(0.98)' : 'scale(1)',
              }}
              onMouseOver={(e) => !loading && ((e.target as HTMLButtonElement).style.filter = 'brightness(1.1)')}
              onMouseOut={(e) => !loading && ((e.target as HTMLButtonElement).style.filter = 'brightness(1)')}
            >
              {loading ? 'Processando acesso...' : buttonText}
            </button>

            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#71717A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span>🔒</span> Seus dados estão criptografados e seguros.
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
