'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'

interface Material {
  id: string
  label: string
  url: string
  icon: string
  show_at_seconds: number
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const ICON_PRESETS = ['📄', '📊', '📋', '📝', '🔗', '🎬', '📌', '💡', '📚', '🗂️', '🖼️', '💾']

export default function MaterialsAdminPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [webinarDuration, setWebinarDuration] = useState(3600)
  const [form, setForm] = useState({ label: '', url: '', icon: '📄', show_at_seconds: 0 })
  const [saving, setSaving] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)

  async function load() {
    const { data: w } = await supabase.from('webi_webinars').select('duration_seconds').eq('id', wid).single()
    if (w?.duration_seconds) setWebinarDuration(w.duration_seconds)
    const { data } = await supabase.from('webi_materials').select('*').eq('webinar_id', wid).order('show_at_seconds')
    setMaterials(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [wid])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.label.trim() || !form.url.trim()) return
    setSaving(true)
    const { error } = await supabase.from('webi_materials').insert({ ...form, webinar_id: wid })
    if (error) toast.error('Erro ao adicionar material.')
    else {
      toast.success(`✅ "${form.label}" adicionado!`)
      setForm({ label: '', url: '', icon: '📄', show_at_seconds: 0 })
      await load()
    }
    setSaving(false)
  }

  async function remove(matId: string, label: string) {
    if (!confirm(`Remover "${label}"?`)) return
    await supabase.from('webi_materials').delete().eq('id', matId)
    setMaterials(m => m.filter(x => x.id !== matId))
    toast('Material removido.', { icon: '🗑' })
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link>
          </div>
          <h1 className="page-title">📂 Materiais de Apoio</h1>
          <p className="page-subtitle">
            Libere PDFs, planilhas e links no momento certo da aula. Os participantes veem na aba
            <strong style={{ color: 'var(--text-primary)' }}> "Materiais"</strong> automaticamente ao chegar no minuto configurado.
          </p>
        </div>
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)',
          maxWidth: 220, lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>💡 Como funciona</div>
          Configure o minuto exato e o link. Quando o vídeo chegar àquele ponto, o material aparece para todo monde na sala.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* LEFT — Add form */}
        <form onSubmit={add} className="card">
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 18 }}>➕ Adicionar Material</div>

          {/* Icon picker + name */}
          <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Ícone</label>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowIconPicker(v => !v)}
                  style={{
                    width: 56, height: 42, fontSize: 22, background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {form.icon}
                </button>
                {showIconPicker && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 100,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: 10, marginTop: 4,
                    display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  }}>
                    {ICON_PRESETS.map(ic => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, icon: ic })); setShowIconPicker(false) }}
                        style={{
                          fontSize: 20, width: 36, height: 36,
                          background: form.icon === ic ? 'rgba(99,102,241,0.15)' : 'transparent',
                          border: `1px solid ${form.icon === ic ? '#6366f1' : 'transparent'}`,
                          borderRadius: 8, cursor: 'pointer',
                        }}
                      >{ic}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Nome do Material *</label>
              <input
                className="form-input"
                placeholder="Ex: Planilha de Prospecção"
                required
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              />
            </div>
          </div>

          {/* URL */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label" style={{ fontSize: 11 }}>URL do arquivo *</label>
            <input
              className="form-input"
              placeholder="https://drive.google.com/... ou https://..."
              required
              type="url"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Google Drive, Dropbox, ou qualquer link direto.
            </div>
          </div>

          {/* Time slider */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="form-label" style={{ fontSize: 11, marginBottom: 0 }}>⏱ Liberar no minuto</label>
              <code style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-light)' }}>
                {fmtTime(form.show_at_seconds)}
              </code>
            </div>
            <input
              type="range" min={0} max={webinarDuration} step={30}
              value={form.show_at_seconds}
              onChange={e => setForm(f => ({ ...f, show_at_seconds: +e.target.value }))}
              style={{ width: '100%', accentColor: 'var(--brand)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              <span>Início</span>
              <span>No início do pitch é ótimo 🎯</span>
              <span>{fmtTime(webinarDuration)}</span>
            </div>
            {/* Manual input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ou digitar o segundo exato:</span>
              <input
                type="number" min={0} max={webinarDuration}
                value={form.show_at_seconds}
                onChange={e => setForm(f => ({ ...f, show_at_seconds: Math.min(webinarDuration, +e.target.value) }))}
                style={{
                  width: 80, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 12,
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>seg</span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
            {saving ? <><span className="spinner" /> Adicionando...</> : '➕ Adicionar Material'}
          </button>
        </form>

        {/* RIGHT — Materials list */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--text-secondary)' }}>
            📋 Materiais Programados
            {materials.length > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--brand)', color: '#fff', borderRadius: 99, padding: '1px 8px', fontSize: 11 }}>
                {materials.length}
              </span>
            )}
          </div>

          {materials.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)', border: '1.5px dashed var(--border)',
              borderRadius: 16, padding: '32px 20px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum material ainda</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Configure ao menos um material para aparecer automaticamente durante a aula.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {materials.map(m => (
                <div key={m.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'box-shadow 0.15s',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 20, flexShrink: 0,
                  }}>
                    {m.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{m.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10, background: 'rgba(99,102,241,0.12)', color: 'var(--brand-light)',
                        borderRadius: 99, padding: '1px 7px', fontWeight: 700, flexShrink: 0,
                      }}>
                        ⏱ {fmtTime(m.show_at_seconds)}
                      </span>
                      <a
                        href={m.url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {m.url.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)', padding: '4px 8px', flexShrink: 0 }}
                    onClick={() => remove(m.id, m.label)}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
