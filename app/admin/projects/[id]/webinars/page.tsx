'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Webinar } from '@/types'

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
}

const defaultForm = {
  name: '',
  description: '',
  video_url: '',
  slug: '',
  status: 'draft' as string,
  evergreen_offset_seconds: 0,
  peak_viewers_min: 20,
  peak_viewers_max: 80,
}

export default function WebinarsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editWebinar, setEditWebinar] = useState<Webinar | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [linksWebinar, setLinksWebinar] = useState<Webinar | null>(null)
  const supabase = createClient()

  async function load() {
    const { data: project } = await supabase.from('webi_projects').select('name').eq('id', projectId).single()
    setProjectName(project?.name || '')
    const { data } = await supabase.from('webi_webinars').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
    setWebinars(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  function openCreate() {
    setEditWebinar(null)
    setForm(defaultForm)
    setShowModal(true)
  }

  function openEdit(w: Webinar) {
    setEditWebinar(w)
    setForm({
      name: w.name, description: w.description || '', video_url: w.video_url || '',
      slug: w.slug, status: w.status, evergreen_offset_seconds: w.evergreen_offset_seconds,
      peak_viewers_min: w.peak_viewers_min, peak_viewers_max: w.peak_viewers_max,
    })
    setShowModal(true)
  }

  async function save() {
    setSaving(true)
    const payload = { ...form, project_id: projectId }

    if (editWebinar) {
      await supabase.from('webi_webinars').update(payload).eq('id', editWebinar.id)
    } else {
      await supabase.from('webi_webinars').insert(payload)
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function deleteWebinar(id: string) {
    if (!confirm('Excluir este webinar e todos os seus eventos?')) return
    await supabase.from('webi_webinars').delete().eq('id', id)
    load()
  }

  async function cloneWebinar(w: Webinar) {
    const cloneName = `${w.name} (Cópia)`
    const cloneSlug = `${w.slug}-copy-${Date.now().toString(36)}`
    const { data: cloned } = await supabase.from('webi_webinars').insert({
      project_id: w.project_id, name: cloneName, description: w.description,
      video_url: w.video_url, slug: cloneSlug, status: 'draft',
      evergreen_offset_seconds: w.evergreen_offset_seconds,
      peak_viewers_min: w.peak_viewers_min, peak_viewers_max: w.peak_viewers_max,
    }).select().single()
    
    if (cloned) {
      // Clone events
      const { data: events } = await supabase.from('webi_events').select('*').eq('webinar_id', w.id)
      if (events && events.length > 0) {
        await supabase.from('webi_events').insert(
          events.map(e => ({ webinar_id: cloned.id, type: e.type, timestamp_seconds: e.timestamp_seconds, payload: e.payload }))
        )
      }
      
      // Clone email templates
      const { data: templates } = await supabase.from('webi_email_templates').select('*').eq('webinar_id', w.id)
      if (templates && templates.length > 0) {
        await supabase.from('webi_email_templates').insert(
          templates.map(t => ({
            webinar_id: cloned.id, type: t.type, subject: t.subject,
            body: t.body, delay_minutes: t.delay_minutes, enabled: t.enabled
          }))
        )
      }
    }
    load()
  }

  async function toggleStatus(w: Webinar) {
    const newStatus = w.status === 'active' ? 'paused' : 'active'
    await supabase.from('webi_webinars').update({ status: newStatus }).eq('id', w.id)
    load()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href="/admin/projects" style={{ color: 'var(--brand-light)' }}>Projetos</Link> / {projectName}
          </div>
          <h1 className="page-title">Webinars</h1>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Novo Webinar</button>
      </div>

      <div className="page-body">
        {webinars.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎬</div>
            <div className="empty-title">Nenhum webinar criado</div>
            <div className="empty-desc">Crie seu primeiro webinar e configure a timeline de eventos</div>
            <button className="btn btn-primary" onClick={openCreate}>Criar Webinar</button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Slug / URL</th>
                  <th>Status</th>
                  <th>Participantes</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {webinars.map(w => (
                  <tr key={w.id}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{w.name}</td>
                    <td>
                      <code style={{ fontSize: 12, color: 'var(--brand-light)' }}>/w/{w.slug}</code>
                    </td>
                    <td>
                      <button onClick={() => toggleStatus(w)} className={`badge badge-${w.status}`} style={{ cursor: 'pointer', border: 'none', background: 'none' }}>
                        {w.status === 'active' ? '● Ativo' : w.status === 'draft' ? '○ Rascunho' : '⏸ Pausado'}
                      </button>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {w.peak_viewers_min}–{w.peak_viewers_max}
                    </td>
                    <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Link href={`/admin/projects/${projectId}/webinars/${w.id}/events`} className="btn btn-primary btn-sm">
                            ⚡ Eventos
                          </Link>
                          <Link href={`/admin/projects/${projectId}/webinars/${w.id}/tracking`} className="btn btn-secondary btn-sm">
                            🎯 Tracking
                          </Link>
                          <Link href={`/admin/projects/${projectId}/webinars/${w.id}/form`} className="btn btn-secondary btn-sm">
                            📋 Formulário
                          </Link>
                          <Link href={`/admin/projects/${projectId}/webinars/${w.id}/chat`} className="btn btn-secondary btn-sm">
                            💬 Chat
                          </Link>
                          <Link href={`/admin/projects/${projectId}/webinars/${w.id}/ai-config`} className="btn btn-secondary btn-sm">
                            🤖 IA no Chat
                          </Link>
                          <Link href={`/admin/projects/${projectId}/webinars/${w.id}/quiz`} className="btn btn-secondary btn-sm">
                            📝 Quiz
                          </Link>
                          <Link href={`/admin/projects/${projectId}/webinars/${w.id}/testimonials`} className="btn btn-secondary btn-sm">
                            💬 Depoimentos
                          </Link>
                          <Link href={`/admin/projects/${projectId}/webinars/${w.id}/logs`} className="btn btn-secondary btn-sm">
                            📓 LOGs
                          </Link>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(w)}>✏️ Editar</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => cloneWebinar(w)}>🔁 Clonar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setLinksWebinar(w)}>🔗 Links</button>
                          <Link href={`/w/${w.slug}?test=1`} target="_blank" className="btn btn-ghost btn-sm">▶ Testar</Link>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteWebinar(w.id)}>🗑</button>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editWebinar ? 'Editar Webinar' : 'Novo Webinar'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nome do Webinar</label>
                <input className="form-input" placeholder="Ex: Como Dobrar Seu Faturamento em 90 Dias"
                  value={form.name}
                  onChange={e => {
                    const name = e.target.value
                    setForm(f => ({ ...f, name, slug: f.slug || slugify(name) }))
                  }} />
              </div>

              <div className="form-group">
                <label className="form-label">Slug (URL única)</label>
                <input className="form-input" placeholder="meu-webinar-incrivel"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  URL: /w/{form.slug || 'meu-webinar'}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">URL do Vídeo (MP4 ou HLS)</label>
                <input className="form-input" placeholder="https://..." value={form.video_url}
                  onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Descrição</label>
                <textarea className="form-input form-textarea" placeholder="Breve descrição do conteúdo..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Participantes mín (simulado)</label>
                  <input type="number" className="form-input" value={form.peak_viewers_min} min={1}
                    onChange={e => setForm(f => ({ ...f, peak_viewers_min: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Participantes máx (simulado)</label>
                  <input type="number" className="form-input" value={form.peak_viewers_max} min={1}
                    onChange={e => setForm(f => ({ ...f, peak_viewers_max: Number(e.target.value) }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Início simulado (segundos do vídeo)</label>
                <input type="number" className="form-input" value={form.evergreen_offset_seconds} min={0}
                  onChange={e => setForm(f => ({ ...f, evergreen_offset_seconds: Number(e.target.value) }))} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Quantos segundos simular que já passaram ao entrar. 0 = começa do início.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input form-select" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={!form.name || !form.slug || saving}>
                {saving ? <span className="spinner" /> : editWebinar ? 'Salvar' : 'Criar Webinar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Links Modal */}
      {linksWebinar && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setLinksWebinar(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">🔗 Links do Webinar</h2>
              <button className="modal-close" onClick={() => setLinksWebinar(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: '📋 Página de Registro (Landing Page)', url: `${typeof window !== 'undefined' ? window.location.origin : ''}/register/${linksWebinar.slug}` },
                { label: '🎬 Sala do Webinar (Live Room)', url: `${typeof window !== 'undefined' ? window.location.origin : ''}/w/${linksWebinar.slug}` },
                { label: '🔁 Sala de Replay', url: `${typeof window !== 'undefined' ? window.location.origin : ''}/replay/${linksWebinar.slug}` },
                { label: '▶ Sala de Teste', url: `${typeof window !== 'undefined' ? window.location.origin : ''}/w/${linksWebinar.slug}?test=1` },
              ].map((link, i) => (
                <div key={i}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{link.label}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="form-input"
                      value={link.url}
                      readOnly
                      style={{ fontSize: 13, fontFamily: 'monospace' }}
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }}
                      onClick={() => { navigator.clipboard.writeText(link.url) }}>
                      📋 Copiar
                    </button>
                    <a href={link.url} target="_blank" className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>
                      ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setLinksWebinar(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
