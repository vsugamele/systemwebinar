'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { Project, Webinar } from '@/types'

interface WebinarWithProject extends Webinar {
  webi_projects?: { name: string; accent_color: string } | null
}

interface Stats {
  projects: number
  webinars: number
  leads: number
  attended: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ projects: 0, webinars: 0, leads: 0, attended: 0 })
  const [recentWebinars, setRecentWebinars] = useState<WebinarWithProject[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: projects } = await supabase.from('webi_projects').select('id')
      const { data: webinars } = await supabase.from('webi_webinars').select('*, webi_projects(name, accent_color)').order('created_at', { ascending: false }).limit(5)
      const { count: leadsCount } = await supabase.from('webi_leads').select('id', { count: 'exact', head: true })
      const { count: attendedCount } = await supabase.from('webi_leads').select('id', { count: 'exact', head: true }).eq('attended', true)

      setStats({
        projects: projects?.length || 0,
        webinars: webinars?.length || 0,
        leads: leadsCount || 0,
        attended: attendedCount || 0,
      })
      setRecentWebinars((webinars as WebinarWithProject[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando dashboard...</span>
    </div>
  )

  const conversionRate = stats.leads > 0 ? Math.round((stats.attended / stats.leads) * 100) : 0

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Visão geral da sua plataforma de webinars</p>
        </div>
        <Link href="/admin/projects" className="btn btn-primary">
          + Novo Projeto
        </Link>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <div className="stat-card">
            <div className="stat-label">Projetos</div>
            <div className="stat-value">{stats.projects}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Webinars</div>
            <div className="stat-value">{stats.webinars}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Leads capturados</div>
            <div className="stat-value">{stats.leads.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Taxa de presença</div>
            <div className="stat-value">{conversionRate}%</div>
            <div className="stat-sub">Meta: 30–50%</div>
          </div>
        </div>

        {/* Recent webinars */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Webinars Recentes</h2>
          <Link href="/admin/projects" className="btn btn-ghost btn-sm">Ver todos →</Link>
        </div>

        {recentWebinars.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Nenhum webinar criado ainda</p>
            <Link href="/admin/projects" className="btn btn-primary">Criar primeiro projeto</Link>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Webinar</th>
                  <th>Projeto</th>
                  <th>Status</th>
                  <th>URL</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {recentWebinars.map((w) => (
                  <tr key={w.id}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{w.name}</td>
                    <td>{w.webi_projects?.name || '—'}</td>
                    <td>
                      <span className={`badge badge-${w.status}`}>
                        {w.status === 'active' ? '● Ativo' : w.status === 'draft' ? '○ Rascunho' : '⏸ Pausado'}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: 12, color: 'var(--brand-light)' }}>
                        /w/{w.slug}
                      </code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/admin/projects/${w.project_id}/webinars/${w.id}/events`} className="btn btn-ghost btn-sm">
                          Eventos
                        </Link>
                        <Link href={`/w/${w.slug}`} target="_blank" className="btn btn-ghost btn-sm">
                          Ver sala ↗
                        </Link>
                      </div>
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
