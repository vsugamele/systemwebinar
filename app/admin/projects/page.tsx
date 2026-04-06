'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Modal from '@/components/Modal'
import { toast } from 'react-hot-toast'
import type { Project } from '@/types'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [form, setForm] = useState({ name: '', accent_color: '#6366f1', resend_from_email: '', openrouter_api_key: '' })
  const [saving, setSaving] = useState(false)
  const [cloningProject, setCloningProject] = useState<string | null>(null)
  const supabase = createClient()

  async function load() {
    const { data } = await supabase.from('webi_projects').select('*').order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => {
    supabase.from('webi_projects').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setProjects(data || []); setLoading(false) })
  }, []) // keeping missing dep as is since it's common

  function openCreate() {
    setEditProject(null)
    setForm({ name: '', accent_color: '#6366f1', resend_from_email: '', openrouter_api_key: '' })
    setShowModal(true)
  }

  function openEdit(p: Project) {
    setEditProject(p)
    setForm({ name: p.name, accent_color: p.accent_color, resend_from_email: p.resend_from_email || '', openrouter_api_key: p.openrouter_api_key || '' })
    setShowModal(true)
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (editProject) {
      await supabase.from('webi_projects').update(form).eq('id', editProject.id)
    } else {
      await supabase.from('webi_projects').insert({ ...form, owner_id: user!.id })
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function cloneProject(p: Project) {
    if (!confirm(`Duplicar o projeto "${p.name}"? Todos os webinars serão copiados.`)) return
    setCloningProject(p.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { name, accent_color, resend_from_email, openrouter_api_key } = p
      const { data: newProject, error: pe } = await supabase
        .from('webi_projects')
        .insert({ name: `Cópia de ${name}`, accent_color, resend_from_email, openrouter_api_key, owner_id: user!.id })
        .select()
        .single()
      if (pe) throw pe

      const { data: webinars } = await supabase.from('webi_webinars').select('*').eq('project_id', p.id)
      for (const w of webinars ?? []) {
        const ts = Date.now()
        const { id: _wid, created_at: _wca, updated_at: _wua, project_id: _wpid, ...wRest } = w as Record<string, unknown>
        void _wid; void _wca; void _wua; void _wpid
        const { data: newW, error: we } = await supabase
          .from('webi_webinars')
          .insert({
            ...wRest,
            project_id: newProject.id,
            name: `${w.name} (Cópia)`,
            slug: `${w.slug}-copy-${ts}`,
            status: 'draft',
            session_started_at: null,
            scheduled_start_at: null,
          })
          .select()
          .single()
        if (we || !newW) continue

        const [eventsRes, templatesRes, questionsRes] = await Promise.all([
          supabase.from('webi_events').select('*').eq('webinar_id', w.id),
          supabase.from('webi_email_templates').select('*').eq('webinar_id', w.id),
          supabase.from('webi_quiz_questions').select('*').eq('webinar_id', w.id),
        ])
        await Promise.all([
          eventsRes.data?.length
            ? supabase.from('webi_events').insert(
                eventsRes.data.map(({ id: _id, created_at: _ca, ...rest }) => { void _id; void _ca; return { ...rest, webinar_id: newW.id } })
              )
            : null,
          templatesRes.data?.length
            ? supabase.from('webi_email_templates').insert(
                templatesRes.data.map(({ id: _id, created_at: _ca, ...rest }) => { void _id; void _ca; return { ...rest, webinar_id: newW.id } })
              )
            : null,
          questionsRes.data?.length
            ? supabase.from('webi_quiz_questions').insert(
                questionsRes.data.map(({ id: _id, created_at: _ca, ...rest }) => { void _id; void _ca; return { ...rest, webinar_id: newW.id } })
              )
            : null,
        ].filter(Boolean))
      }

      toast.success('Projeto duplicado com sucesso!')
      load()
    } catch {
      toast.error('Erro ao duplicar projeto.')
    } finally {
      setCloningProject(null)
    }
  }

  async function deleteProject(id: string) {
    if (!confirm('Excluir este projeto? Todos os webinars serão removidos.')) return
    await supabase.from('webi_projects').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projetos</h1>
          <p className="page-subtitle">Cada projeto é um namespace isolado com webinars próprios</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Novo Projeto</button>
      </div>

      <div className="page-body">
        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🗂️</div>
            <div className="empty-title">Nenhum projeto ainda</div>
            <div className="empty-desc">Crie seu primeiro projeto para começar a organizar seus webinars</div>
            <button className="btn btn-primary" onClick={openCreate}>Criar Primeiro Projeto</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {projects.map(p => (
              <div key={p.id} className="card" style={{ '--accent': p.accent_color } as React.CSSProperties}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: p.accent_color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800, color: 'white'
                  }}>
                    {p.name[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                    {p.resend_from_email && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.resend_from_email}</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link href={`/admin/projects/${p.id}/webinars`} className="btn btn-primary btn-sm" style={{ flex: 1, textAlign: 'center' }}>
                    Webinars
                  </Link>
                  <Link href={`/admin/projects/${p.id}/analytics`} className="btn btn-secondary btn-sm" title="Analytics">
                    📊
                  </Link>
                  <Link href={`/admin/projects/${p.id}/branding`} className="btn btn-secondary btn-sm" title="Branding">
                    🎨
                  </Link>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Editar</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    title="Duplicar projeto"
                    onClick={() => cloneProject(p)}
                    disabled={cloningProject === p.id}
                  >
                    {cloningProject === p.id ? <span className="spinner" /> : '🔁'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteProject(p.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editProject ? 'Editar Projeto' : 'Novo Projeto'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={!form.name || saving}>
              {saving ? <span className="spinner" /> : editProject ? 'Salvar' : 'Criar Projeto'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Nome do Projeto</label>
          <input
            className="form-input"
            placeholder="Ex: Marketing Digital 2025"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Cor de Destaque</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              type="color"
              value={form.accent_color}
              onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
              style={{ width: 48, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'none' }}
            />
            <input
              className="form-input"
              value={form.accent_color}
              style={{ flex: 1 }}
              onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">E-mail Remetente (Resend)</label>
          <input
            className="form-input"
            placeholder="webinar@seudominio.com"
            value={form.resend_from_email}
            onChange={e => setForm(f => ({ ...f, resend_from_email: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Chave de API do OpenRouter (Integração IA)</label>
          <input
            type="password"
            className="form-input"
            placeholder="sk-or-v1-..."
            value={form.openrouter_api_key}
            onChange={e => setForm(f => ({ ...f, openrouter_api_key: e.target.value }))}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Usado para gerar mensagens de chat automáticas com base no seu roteiro.
          </div>
        </div>
      </Modal>
    </>
  )
}
