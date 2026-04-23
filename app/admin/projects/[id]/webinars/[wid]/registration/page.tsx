'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { Webinar } from '@/types'

export default function RegistrationPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [brandColor, setBrandColor] = useState('#6366f1')

  const [form, setForm] = useState({
    landing_headline: '',
    landing_subheadline: '',
    landing_button_text: '',
  })

  useEffect(() => {
    async function load() {
      const { data: w } = await supabase.from('webi_webinars').select('*').eq('id', wid).single()
      if (w) {
        setWebinar(w)
        setBrandColor((w as Record<string, unknown>).brand_color as string || '#6366f1')
        setForm({
          landing_headline: w.landing_headline || '',
          landing_subheadline: w.landing_subheadline || '',
          landing_button_text: w.landing_button_text || 'Quero me inscrever',
        })
      }
      setLoading(false)
    }
    load()
  }, [wid, supabase])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('webi_webinars').update({
      landing_headline: form.landing_headline,
      landing_subheadline: form.landing_subheadline,
      landing_button_text: form.landing_button_text,
    }).eq('id', wid)
    setSaving(false)
    if (error) toast.error('Erro ao salvar as configurações.')
    else toast.success('✅ Página de captura salva!')
  }

  if (loading || !webinar) return <div className="loading-screen"><div className="spinner" /></div>

  const previewHeadline = form.landing_headline || 'Seu título principal aparece aqui'
  const previewSub = form.landing_subheadline || 'Seu texto de apoio aparece aqui. Convença o visitante a se cadastrar.'
  const previewBtn = form.landing_button_text || 'Quero me inscrever'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <Toaster position="top-right" />

      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link>
            {' / '}{webinar.name}
          </div>
          <h1 className="page-title">🧲 Página de Captura</h1>
          <p className="page-subtitle">
            Configure a landing page onde os leads se cadastram para acessar a sala.
            O preview ao lado atualiza em tempo real.
          </p>
        </div>
        <Link
          href={`/r/${webinar.slug}`}
          target="_blank"
          className="btn btn-secondary"
          style={{ gap: 8, flexShrink: 0 }}
        >
          <span>👁️</span> Ver Página Real
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, alignItems: 'start' }}>

        {/* LEFT — Form */}
        <form onSubmit={save} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>✏️ Editar Conteúdo</div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Headline (Título Principal)</label>
            <textarea
              required
              className="form-input form-textarea"
              rows={3}
              placeholder="Ex: Como faturar R$ 10 mil nos próximos 30 dias..."
              value={form.landing_headline}
              onChange={e => setForm({ ...form, landing_headline: e.target.value })}
            />
            <p className="help-text">
              💡 A promessa principal. Direto, específico e orientado ao resultado.
            </p>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Subheadline (Texto de Apoio)</label>
            <textarea
              className="form-input form-textarea"
              rows={3}
              placeholder="Ex: Descubra o método validado e passo a passo nesta aula ao vivo exclusiva."
              value={form.landing_subheadline}
              onChange={e => setForm({ ...form, landing_subheadline: e.target.value })}
            />
            <p className="help-text">Complementa a headline. Pode adicionar benefícios ou urgência.</p>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Texto do Botão de Cadastro</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Quero assistir agora →"
              value={form.landing_button_text}
              onChange={e => setForm({ ...form, landing_button_text: e.target.value })}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {['Quero me inscrever →', 'Garantir minha vaga gratuita', 'Assistir agora — É gratuito!', 'Reservar meu lugar agora'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, landing_button_text: t }))}
                  style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                    background: form.landing_button_text === t ? 'rgba(99,102,241,0.15)' : 'var(--bg-elevated)',
                    border: `1px solid ${form.landing_button_text === t ? '#6366f1' : 'var(--border)'}`,
                    color: form.landing_button_text === t ? '#818cf8' : 'var(--text-muted)',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <><span className="spinner" /> Salvando...</> : '💾 Salvar Página de Captura'}
          </button>
        </form>

        {/* RIGHT — Live preview */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            👁️ Preview em Tempo Real
            <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: 99, padding: '2px 8px', fontWeight: 700 }}>
              LIVE
            </span>
          </div>

          {/* Browser chrome mockup */}
          <div style={{
            border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
            background: 'var(--bg)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            {/* Browser bar */}
            <div style={{ background: 'var(--bg-elevated)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', opacity: 0.7 }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', opacity: 0.7 }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', opacity: 0.7 }} />
              </div>
              <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
                seudominio.com/r/{webinar.slug}
              </div>
            </div>

            {/* Page Content */}
            <div style={{
              background: 'linear-gradient(160deg, #0f0f1a 0%, #1a1030 100%)',
              padding: '40px 32px',
              minHeight: 340,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', position: 'relative',
            }}>
              {/* Glow */}
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 300, height: 200, borderRadius: '50%',
                background: `radial-gradient(ellipse, ${brandColor}22 0%, transparent 70%)`,
                pointerEvents: 'none',
              }} />

              {/* Badge */}
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
                color: brandColor, background: `${brandColor}18`, border: `1px solid ${brandColor}44`,
                borderRadius: 99, padding: '4px 12px', marginBottom: 20,
              }}>
                🔴 Aula Ao Vivo
              </div>

              {/* Headline */}
              <div style={{
                fontSize: 20, fontWeight: 800, lineHeight: 1.3, color: '#fff', marginBottom: 16,
                transition: 'all 0.2s',
              }}>
                {previewHeadline}
              </div>

              {/* Subheadline */}
              <div style={{
                fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7,
                marginBottom: 28, maxWidth: 380,
                transition: 'all 0.2s',
              }}>
                {previewSub}
              </div>

              {/* Button */}
              <button
                type="button"
                style={{
                  background: `linear-gradient(135deg, ${brandColor}, #a855f7)`,
                  border: 'none', borderRadius: 12, padding: '14px 28px',
                  fontSize: 14, fontWeight: 800, color: '#fff', cursor: 'default',
                  boxShadow: `0 4px 20px ${brandColor}44`,
                  transition: 'all 0.2s',
                }}
              >
                {previewBtn}
              </button>

              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 12 }}>
                🔒 Cadastro 100% gratuito
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>🎨 Cor do tema</strong> (definida em Visão Geral):{' '}
            <span style={{ color: brandColor, fontWeight: 700 }}>{brandColor}</span>
            {' · '}<Link href={`/admin/projects/${id}/webinars/${wid}`} style={{ color: 'var(--brand-light)', fontSize: 11 }}>Alterar</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
