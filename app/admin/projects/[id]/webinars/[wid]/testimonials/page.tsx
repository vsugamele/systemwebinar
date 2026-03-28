'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Testimonial {
  id: string
  webinar_id: string
  name: string
  role: string
  text: string
  avatar_url: string
  rating: number
  show_at_seconds: number
  approved: boolean
  created_at: string
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: 16, color: i <= rating ? '#f59e0b' : '#374151' }}>★</span>
      ))}
    </div>
  )
}

export default function TestimonialsAdminPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const supabase = createClient()

  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [webinarName, setWebinarName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Testimonial | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    role: '',
    text: '',
    avatar_url: '',
    rating: 5,
    show_at_seconds: 0,
    approved: true,
  })

  async function load() {
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('name')
      .eq('id', webinarId)
      .single()
    setWebinarName(webinar?.name || '')

    const { data } = await supabase
      .from('webi_testimonials')
      .select('*')
      .eq('webinar_id', webinarId)
      .order('show_at_seconds')
    setTestimonials(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [webinarId])

  function openCreate() {
    setEditItem(null)
    setForm({ name: '', role: '', text: '', avatar_url: '', rating: 5, show_at_seconds: 0, approved: true })
    setShowModal(true)
  }

  function openEdit(t: Testimonial) {
    setEditItem(t)
    setForm({
      name: t.name,
      role: t.role || '',
      text: t.text,
      avatar_url: t.avatar_url || '',
      rating: t.rating,
      show_at_seconds: t.show_at_seconds,
      approved: t.approved ?? true,
    })
    setShowModal(true)
  }

  async function save() {
    setSaving(true)
    const payload = { ...form, webinar_id: webinarId }

    if (editItem) {
      await supabase.from('webi_testimonials').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('webi_testimonials').insert(payload)
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function toggleApproved(t: Testimonial) {
    await supabase.from('webi_testimonials').update({ approved: !t.approved }).eq('id', t.id)
    load()
  }

  async function deleteItem(id: string) {
    if (!confirm('Excluir este depoimento?')) return
    await supabase.from('webi_testimonials').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>
              Webinars
            </Link>{' '}/ {webinarName}
          </div>
          <h1 className="page-title">💬 Depoimentos</h1>
          <p className="page-subtitle">
            Gerencie os depoimentos exibidos durante o webinar. Configure o tempo de aparição para criar credibilidade no momento certo.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Adicionar Depoimento</button>
      </div>

      <div className="page-body">
        {/* Info card */}
        <div className="card" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 24 }}>💡</span>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Como funciona</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Os depoimentos aparecem automaticamente abaixo do vídeo quando o participante atinge o tempo configurado em <strong>"Aparece no segundo"</strong>.
                Use isso estrategicamente — coloque depoimentos poderosos próximos ao momento da oferta para aumentar a conversão.
                Depoimentos <strong>pendentes</strong> (enviados pelos usuários) precisam ser aprovados antes de aparecerem.
              </div>
            </div>
          </div>
        </div>

        {testimonials.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <div className="empty-title">Nenhum depoimento cadastrado</div>
            <div className="empty-desc">Adicione depoimentos que aparecerão automaticamente durante o webinar</div>
            <button className="btn btn-primary" onClick={openCreate}>Adicionar Depoimento</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {testimonials.map(t => (
              <div key={t.id} className="card" style={{
                display: 'flex', alignItems: 'flex-start', gap: 16,
                opacity: t.approved ? 1 : 0.6,
                borderLeft: `3px solid ${t.approved ? 'var(--success)' : 'var(--warning)'}`,
              }}>
                {/* Avatar */}
                {t.avatar_url ? (
                  <img src={t.avatar_url} alt={t.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0,
                  }}>
                    {t.name[0]?.toUpperCase()}
                  </div>
                )}

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{t.name}</span>
                    {t.role && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.role}</span>}
                    <StarRating rating={t.rating} />
                    <span className={`badge ${t.approved ? 'badge-active' : 'badge-draft'}`} style={{ fontSize: 11, marginLeft: 'auto' }}>
                      {t.approved ? '✅ Aprovado' : '⏳ Pendente'}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 8px' }}>
                    "{t.text}"
                  </p>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ⏱ Aparece aos <code style={{ fontFamily: 'monospace', color: 'var(--brand-light)' }}>{formatTime(t.show_at_seconds)}</code> de vídeo
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => toggleApproved(t)}
                    title={t.approved ? 'Marcar como pendente' : 'Aprovar depoimento'}
                  >
                    {t.approved ? '⏸' : '✅'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>✏️</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteItem(t.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editItem ? 'Editar Depoimento' : 'Novo Depoimento'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Nome *</label>
                  <input className="form-input" placeholder="João Silva"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cargo / Área</label>
                  <input className="form-input" placeholder="Empreendedor"
                    value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Depoimento *</label>
                <textarea className="form-input" rows={3} required
                  placeholder="O que essa pessoa diz sobre o webinar / produto..."
                  value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                  style={{ resize: 'vertical' }} />
              </div>

              <div className="form-group">
                <label className="form-label">URL da Foto (opcional)</label>
                <input className="form-input" placeholder="https://..."
                  value={form.avatar_url} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Avaliação (estrelas)</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <button key={i} type="button"
                        onClick={() => setForm(f => ({ ...f, rating: i }))}
                        style={{
                          fontSize: 22, background: 'none', border: 'none', cursor: 'pointer',
                          opacity: i <= form.rating ? 1 : 0.3, transition: 'opacity 0.15s',
                        }}>
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Aparece no segundo</label>
                  <input type="number" className="form-input" min={0} placeholder="Ex: 600"
                    value={form.show_at_seconds}
                    onChange={e => setForm(f => ({ ...f, show_at_seconds: Number(e.target.value) }))} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    = {formatTime(form.show_at_seconds)} de vídeo
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="approved-check" checked={form.approved}
                  onChange={e => setForm(f => ({ ...f, approved: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }} />
                <label htmlFor="approved-check" style={{ fontSize: 13, cursor: 'pointer' }}>
                  Aprovado (visível no webinar)
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={!form.name || !form.text || saving}>
                {saving ? <span className="spinner" /> : editItem ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
