'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project, Webinar, Lead } from '@/types'

interface LeadWithStats extends Lead {
  sessions_count: number
  last_seen: string | null
}

export default function RegistrantsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [leads, setLeads] = useState<LeadWithStats[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedWebinar, setSelectedWebinar] = useState('')
  const [filterBehavior, setFilterBehavior] = useState<'all' | 'attended' | 'not_attended' | 'cta_clicked' | 'popup_seen' | 'chat_sent'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('webi_projects').select('*').order('created_at').then(({ data }) => setProjects(data || []))
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    supabase.from('webi_webinars').select('*').eq('project_id', selectedProject).order('created_at', { ascending: false })
      .then(({ data }) => setWebinars(data || []))
  }, [selectedProject])

  useEffect(() => {
    if (!selectedProject) return
    let q = supabase.from('webi_leads').select('*').eq('project_id', selectedProject)
    if (selectedWebinar) q = q.eq('webinar_id', selectedWebinar)
    if (filterBehavior === 'attended') q = q.eq('attended', true)
    if (filterBehavior === 'not_attended') q = q.eq('attended', false)

    q.order('registered_at', { ascending: false }).then(async ({ data }) => {
      let fetchedLeads = data || []
      if (fetchedLeads.length > 0 && ['cta_clicked', 'popup_seen', 'chat_sent'].includes(filterBehavior)) {
        const { data: events } = await supabase.from('webi_session_events')
          .select('lead_id')
          .eq('event_type', filterBehavior)
          .in('lead_id', fetchedLeads.map(l => l.id))
        const evtSet = new Set(events?.map(e => e.lead_id))
        fetchedLeads = fetchedLeads.filter(l => evtSet.has(l.id))
      }
      setLeads(fetchedLeads.map(l => ({ ...l, sessions_count: 0, last_seen: null })))
      setLoading(false)
    })
  }, [selectedWebinar, filterBehavior, selectedProject])

  const filtered = leads.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.email.toLowerCase().includes(search.toLowerCase())
  )

  function exportCSV() {
    const rows = [
      ['Nome', 'E-mail', 'Telefone', 'Assistiu', 'Data de Cadastro'],
      ...filtered.map(l => [
        l.name, l.email, l.phone || '', l.attended ? 'Sim' : 'Não',
        new Date(l.registered_at).toLocaleDateString('pt-BR')
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'registrantes.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const totalAttended = filtered.filter(l => l.attended).length
  const attendanceRate = filtered.length > 0 ? Math.round((totalAttended / filtered.length) * 100) : 0

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Registrantes</h1>
          <p className="page-subtitle">Gerencie e exporte sua lista de leads</p>
        </div>
        <button className="btn btn-primary" onClick={exportCSV} disabled={filtered.length === 0}>
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="page-body">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <select className="form-input form-select" style={{ maxWidth: 220 }}
            value={selectedProject} onChange={e => { const v = e.target.value; setSelectedProject(v); setWebinars([]); setLeads([]); setSelectedWebinar(''); if (v) setLoading(true) }}>
            <option value="">Todos os projetos</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select className="form-input form-select" style={{ maxWidth: 280 }}
            value={selectedWebinar} onChange={e => { setSelectedWebinar(e.target.value); if (selectedProject) setLoading(true) }}
            disabled={!selectedProject}>
            <option value="">Todos os webinars</option>
            {webinars.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          <select className="form-input form-select" style={{ maxWidth: 200 }}
            value={filterBehavior} onChange={e => { setFilterBehavior(e.target.value as 'all' | 'attended' | 'not_attended' | 'cta_clicked' | 'popup_seen' | 'chat_sent'); if (selectedProject) setLoading(true) }}>
            <option value="all">Todos os registrantes</option>
            <option value="attended">Assistiram</option>
            <option value="not_attended">Não assistiram</option>
            <option value="cta_clicked">Clicaram na Oferta</option>
            <option value="popup_seen">Viram o Pop-up</option>
            <option value="chat_sent">Enviaram Msg no Chat</option>
          </select>

          <input className="form-input" style={{ maxWidth: 260 }}
            placeholder="🔍 Buscar por nome ou e-mail..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Summary */}
        {filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Registrantes', value: filtered.length.toLocaleString(), icon: '👥' },
              { label: 'Assistiram', value: totalAttended.toLocaleString(), icon: '✅' },
              { label: 'Taxa de Presença', value: `${attendanceRate}%`, icon: '📊' },
              { label: 'Não Assistiram', value: (filtered.length - totalAttended).toLocaleString(), icon: '❌' },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {loading && <div className="loading-screen"><div className="spinner" /></div>}

        {!selectedProject && !loading && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-title">Selecione um projeto</div>
            <div className="empty-desc">Escolha um projeto para visualizar os registrantes</div>
          </div>
        )}

        {selectedProject && !loading && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">Nenhum registrante encontrado</div>
            <div className="empty-desc">Tente ajustar os filtros ou aguarde os primeiros leads se registrarem</div>
          </div>
        )}

        {filtered.length > 0 && !loading && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => (
                  <tr key={lead.id}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{lead.name}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      <a href={`mailto:${lead.email}`} style={{ color: 'var(--brand-light)', textDecoration: 'none' }}>
                        {lead.email}
                      </a>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{lead.phone || '—'}</td>
                    <td>
                      <span className={`badge ${lead.attended ? 'badge-active' : 'badge-draft'}`}>
                        {lead.attended ? '✅ Assistiu' : '○ Não assistiu'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(lead.registered_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td>
                      <a href={`mailto:${lead.email}`} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
                        ✉ E-mail
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
