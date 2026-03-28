'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Material {
  id: string
  label: string
  url: string
  icon: string
  show_at_seconds: number
}

const MINUTES = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`

export default function MaterialsAdminPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()

  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ label: '', url: '', icon: '📄', show_at_seconds: 0 })
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('webi_materials')
      .select('*')
      .eq('webinar_id', wid)
      .order('show_at_seconds')
    setMaterials(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [wid])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.label.trim() || !form.url.trim()) return
    setSaving(true)
    await supabase.from('webi_materials').insert({ ...form, webinar_id: wid })
    setForm({ label: '', url: '', icon: '📄', show_at_seconds: 0 })
    await load()
    setSaving(false)
  }

  async function remove(id: string) {
    await supabase.from('webi_materials').delete().eq('id', id)
    setMaterials(m => m.filter(x => x.id !== id))
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/admin/projects/${id}/webinars`} className="btn btn-ghost btn-sm">← Webinars</Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>📂 Materiais de Apoio</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Libere PDFs, planilhas e links no momento certo do vídeo. Os participantes veem na aba "Materiais".
        </p>
      </div>

      {/* Add form */}
      <form onSubmit={add} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Adicionar Material</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label">Ícone</label>
            <input className="form-input" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
              style={{ textAlign: 'center', fontSize: 20 }} maxLength={2} />
          </div>
          <div className="form-group">
            <label className="form-label">Nome do Material</label>
            <input className="form-input" placeholder="Ex: Planilha de Prospecção" required
              value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">URL (link direto ou Google Drive)</label>
          <input className="form-input" placeholder="https://drive.google.com/..." required type="url"
            value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Liberar aos (segundos de vídeo)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input className="form-input" type="number" min={0}
              value={form.show_at_seconds}
              onChange={e => setForm(f => ({ ...f, show_at_seconds: +e.target.value }))}
              style={{ width: 120 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>= {MINUTES(form.show_at_seconds)} de vídeo</span>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '⏳ Adicionando...' : '➕ Adicionar Material'}
        </button>
      </form>

      {/* Materials list */}
      {materials.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
          Nenhum material cadastrado ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {materials.map(m => (
            <div key={m.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 24 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Liberado aos {MINUTES(m.show_at_seconds)} • <a href={m.url} target="_blank" style={{ color: 'var(--brand)' }}>Ver link ↗</a>
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => remove(m.id)}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
