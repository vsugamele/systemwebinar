'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Modal from '@/components/Modal'
import { toast } from 'react-hot-toast'
import type { Project } from '@/types'

interface ProjectWithStats extends Project {
  webinarCount?: number
  activeCount?: number
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [form, setForm] = useState({
    name: '',
    accent_color: '#6366f1',
    resend_from_email: '',
    openrouter_api_key: '',
    timezone: 'America/Sao_Paulo',
  })
  const [saving, setSaving] = useState(false)
  const [cloningProject, setCloningProject] = useState<string | null>(null)
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null)
  const supabase = createClient()

  const TIMEZONES = [
    { group: 'Brasil', options: [
      { value: 'America/Sao_Paulo', label: 'São Paulo / Brasília (BRT, UTC-3)' },
      { value: 'America/Fortaleza', label: 'Fortaleza / Recife (BRT, UTC-3)' },
      { value: 'America/Manaus', label: 'Manaus / Porto Velho (AMT, UTC-4)' },
      { value: 'America/Rio_Branco', label: 'Rio Branco (ACT, UTC-5)' },
    ]},
    { group: 'Portugal / Europa', options: [
      { value: 'Europe/Lisbon', label: 'Lisboa (WET, UTC+0/+1)' },
    ]},
    { group: 'Outras', options: [
      { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (ART, UTC-3)' },
      { value: 'America/Bogota', label: 'Bogotá (COT, UTC-5)' },
      { value: 'UTC', label: 'UTC' },
    ]},
  ]

  async function load() {
    // Fetch projects + webinar counts in parallel
    const { data: rawProjects } = await supabase
      .from('webi_projects')
      .select('*')
      .order('created_at', { ascending: false })

    if (!rawProjects) { setLoading(false); return }

    // Get webinar counts per project
    const { data: webinarRows } = await supabase
      .from('webi_webinars')
      .select('project_id, status')

    const countMap: Record<string, { total: number; active: number }> = {}
    for (const w of webinarRows || []) {
      if (!countMap[w.project_id]) countMap[w.project_id] = { total: 0, active: 0 }
      countMap[w.project_id].total++
      if (w.status === 'active') countMap[w.project_id].active++
    }

    setProjects(rawProjects.map(p => ({
      ...p,
      webinarCount: countMap[p.id]?.total || 0,
      activeCount: countMap[p.id]?.active || 0,
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditProject(null)
    setForm({ name: '', accent_color: '#6366f1', resend_from_email: '', openrouter_api_key: '', timezone: 'America/Sao_Paulo' })
    setShowModal(true)
  }

  function openEdit(p: Project) {
    setEditProject(p)
    setForm({
      name: p.name,
      accent_color: p.accent_color,
      resend_from_email: p.resend_from_email || '',
      openrouter_api_key: p.openrouter_api_key || '',
      timezone: (p as any).timezone || 'America/Sao_Paulo',
    })
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {projects.map(p => (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 18,
                  overflow: 'hidden',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Color bar header */}
                <div style={{
                  height: 5,
                  background: `linear-gradient(90deg, ${p.accent_color}, ${p.accent_color}80)`,
                }} />

                <div style={{ padding: '20px 20px 16px' }}>
                  {/* Project identity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: p.accent_color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, fontWeight: 800, color: 'white',
                      flexShrink: 0,
                    }}>
                      {p.name[0].toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, color: 'var(--text-primary)',
                        fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {p.name}
                      </div>
                      {p.resend_from_email && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {p.resend_from_email}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats pills */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'var(--bg-elevated)', borderRadius: 8,
                      padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      🎬 <strong style={{ color: 'var(--text-primary)' }}>{p.webinarCount}</strong> webinar{p.webinarCount !== 1 ? 's' : ''}
                    </div>
                    {(p.activeCount ?? 0) > 0 && (
                      <div style={{
                        background: 'rgba(34,197,94,0.1)', borderRadius: 8,
                        padding: '5px 10px', fontSize: 12, color: '#22c55e',
                        display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                        {p.activeCount} ativo{(p.activeCount ?? 0) > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Primary action */}
                  <Link
                    href={`/admin/projects/${p.id}/webinars`}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
                  >
                    Gerenciar Webinars →
                  </Link>

                  {/* Secondary actions row */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link
                      href={`/admin/projects/${p.id}/analytics`}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, justifyContent: 'center' }}
                      title="Ver analytics do projeto"
                    >
                      📊 Analytics
                    </Link>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(p)}
                      style={{ flex: 1 }}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Duplicar projeto"
                      onClick={() => cloneProject(p)}
                      disabled={cloningProject === p.id}
                      style={{ padding: '6px 10px' }}
                    >
                      {cloningProject === p.id ? <span className="spinner" /> : '🔁'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteProject(p.id)}
                      style={{ padding: '6px 10px' }}
                    >
                      🗑
                    </button>
                  </div>
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

        <div className="form-group">
          <label className="form-label">🌎 Fuso Horário</label>
          <select
            className="form-input"
            value={form.timezone}
            onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
          >
            {TIMEZONES.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Define o fuso usado para calcular os horários de agendamento dos webinars.
          </div>
        </div>
      </Modal>
    </>
  )
}
