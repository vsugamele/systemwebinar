'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const PRESET_COLORS = [
  { label: 'Índigo (Padrão)', value: '#6366f1' },
  { label: 'Roxo', value: '#8b5cf6' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Amarelo', value: '#eab308' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Ciano', value: '#06b6d4' },
  { label: 'Azul', value: '#3b82f6' },
]

export default function BrandingPage() {
  const { id } = useParams() as { id: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [brandColor, setBrandColor] = useState('#6366f1')
  const [webhookUrl, setWebhookUrl] = useState('')

  useEffect(() => {
    supabase.from('webi_projects').select('brand_color, webhook_url').eq('id', id).single()
      .then(({ data }) => {
        if (data) {
          setBrandColor(data.brand_color || '#6366f1')
          setWebhookUrl(data.webhook_url || '')
        }
        setLoading(false)
      })
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('webi_projects').update({ brand_color: brandColor, webhook_url: webhookUrl }).eq('id', id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/admin/projects/${id}`} className="btn btn-ghost btn-sm">← Voltar</Link>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🎨 Branding do Projeto</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Personalize a cor primária de todos os webinars deste projeto.
        </p>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Color preview */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Cor Primária</div>

          {/* Presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => setBrandColor(c.value)}
                style={{
                  width: 36, height: 36, borderRadius: '50%', background: c.value,
                  border: brandColor === c.value ? `3px solid #fff` : '3px solid transparent',
                  outline: brandColor === c.value ? `2px solid ${c.value}` : 'none',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              />
            ))}
          </div>

          {/* Custom hex */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="color"
              value={brandColor}
              onChange={e => setBrandColor(e.target.value)}
              style={{ width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'none' }}
            />
            <input
              className="form-input"
              placeholder="#6366f1"
              value={brandColor}
              onChange={e => setBrandColor(e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
          </div>

          {/* Live preview */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Preview:</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={{
                background: brandColor, color: '#fff', border: 'none', borderRadius: 8,
                padding: '8px 20px', fontWeight: 700, cursor: 'default', fontSize: 14,
              }}>Botão Principal</button>
              <div style={{
                border: `2px solid ${brandColor}`, borderRadius: 8, padding: '6px 16px',
                color: brandColor, fontSize: 14, fontWeight: 600,
              }}>Borda com cor</div>
              <div style={{
                background: `${brandColor}20`, borderRadius: 8, padding: '6px 16px',
                color: brandColor, fontSize: 14,
              }}>Badge suave</div>
            </div>
          </div>
        </div>

        {/* Webhook */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🔗 Webhook URL</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Será chamado via POST quando um lead se cadastrar.
            Compatible com n8n, Zapier, Make e qualquer endpoint REST.
          </div>
          <input
            className="form-input"
            placeholder="https://n8n.meusite.com/webhook/lead-captado"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Payload enviado: <code style={{ color: 'var(--brand)' }}>{'{ name, email, webinar_id, webinar_name, timestamp }'}</code>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? '⏳ Salvando...' : saved ? '✅ Salvo!' : '💾 Salvar'}
        </button>
      </form>
    </div>
  )
}
