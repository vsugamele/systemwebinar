'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project, Webinar } from '@/types'

interface AnalyticsData {
  total_leads: number
  joined: number
  cta_clicks: number
  popup_seen: number
  viewers_by_minute: { minute: number; viewers: number }[]
}

export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedWebinar, setSelectedWebinar] = useState('')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('webi_projects').select('*').then(({ data }) => setProjects(data || []))
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    supabase.from('webi_webinars').select('*').eq('project_id', selectedProject)
      .then(({ data }) => setWebinars(data || []))
    setSelectedWebinar('')
    setData(null)
  }, [selectedProject])

  useEffect(() => {
    if (!selectedWebinar) return
    setLoading(true)
    fetch(`/api/analytics?webinar_id=${selectedWebinar}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [selectedWebinar])

  const maxViewers = data ? Math.max(...data.viewers_by_minute.map(v => v.viewers), 1) : 1

  const conversionRate = data && data.joined > 0
    ? ((data.cta_clicks / data.joined) * 100).toFixed(1)
    : '0.0'

  const attendanceRate = data && data.total_leads > 0
    ? ((data.joined / data.total_leads) * 100).toFixed(1)
    : '0.0'

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Mapa de abandono, taxa de conversão e heatmap de engajamento</p>
        </div>
      </div>

      <div className="page-body">
        {/* Selectors */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <select className="form-input form-select" style={{ maxWidth: 240 }}
            value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="">Selecionar projeto...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select className="form-input form-select" style={{ maxWidth: 300 }}
            value={selectedWebinar} onChange={e => setSelectedWebinar(e.target.value)}
            disabled={!selectedProject}>
            <option value="">Selecionar webinar...</option>
            {webinars.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        {!selectedWebinar && (
          <div className="empty-state">
            <div className="empty-icon">📈</div>
            <div className="empty-title">Selecione um webinar</div>
            <div className="empty-desc">Escolha um projeto e webinar para visualizar os dados de analytics</div>
          </div>
        )}

        {loading && <div className="loading-screen"><div className="spinner" /></div>}

        {data && !loading && (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
              <div className="stat-card">
                <div className="stat-label">Leads Registrados</div>
                <div className="stat-value">{data.total_leads.toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Entraram na Sala</div>
                <div className="stat-value">{data.joined.toLocaleString()}</div>
                <div className="stat-sub">Taxa presença: {attendanceRate}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Cliques no CTA</div>
                <div className="stat-value">{data.cta_clicks.toLocaleString()}</div>
                <div className="stat-sub">Taxa conv.: {conversionRate}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Pop-ups Vistos</div>
                <div className="stat-value">{data.popup_seen.toLocaleString()}</div>
              </div>
            </div>

            {/* Abandonment Map */}
            <div className="analytics-chart" style={{ marginBottom: 24 }}>
              <div className="chart-title">
                📉 Mapa de Abandono — Espectadores por Minuto
              </div>
              {data.viewers_by_minute.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 14 }}>
                  Ainda não há dados suficientes para gerar o gráfico
                </div>
              ) : (
                <>
                  <div className="chart-area">
                    {data.viewers_by_minute.map((v, i) => (
                      <div
                        key={i}
                        className="chart-bar"
                        style={{ height: `${(v.viewers / maxViewers) * 100}%` }}
                      >
                        <div className="chart-bar-tooltip">
                          Min {v.minute}: {v.viewers} espectadores
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>0 min</span>
                    <span>{data.viewers_by_minute.length > 0 ? data.viewers_by_minute[Math.floor(data.viewers_by_minute.length / 2)].minute : 0} min</span>
                    <span>{data.viewers_by_minute.at(-1)?.minute || 0} min</span>
                  </div>

                  <div style={{
                    marginTop: 16, padding: 16,
                    background: 'var(--bg-elevated)', borderRadius: 8,
                    fontSize: 13, color: 'var(--text-secondary)'
                  }}>
                    💡 <strong>Dica:</strong> Quedas bruscas indicam onde o conteúdo ficou menos interessante.
                    Use esse dado para melhorar o gancho inicial e cortar partes lentas.
                  </div>
                </>
              )}
            </div>

            {/* Optimization Tips */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              {[
                { icon: '📊', label: 'Taxa de inscrição', value: `${attendanceRate}%`, meta: 'Meta: 20–40%', ok: parseFloat(attendanceRate) >= 20 },
                { icon: '👥', label: 'Taxa de presença', value: `${attendanceRate}%`, meta: 'Meta: 30–50%', ok: parseFloat(attendanceRate) >= 30 },
                { icon: '🔥', label: 'Retenção até pitch', value: `${data.joined > 0 ? Math.round((data.cta_clicks / data.joined) * 100 * 5) : 0}%`, meta: 'Meta: >60%', ok: false },
                { icon: '💰', label: 'Taxa de conversão', value: `${conversionRate}%`, meta: 'Meta: 3–10%', ok: parseFloat(conversionRate) >= 3 },
              ].map((item, i) => (
                <div key={i} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderLeft: `4px solid ${item.ok ? 'var(--success)' : 'var(--warning)'}`,
                  borderRadius: 12, padding: '16px 20px',
                }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{item.icon}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: item.ok ? 'var(--success)' : 'var(--warning)' }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.meta}</div>
                </div>
              ))}
            </div>

            {/* Monetization */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 24, marginBottom: 16
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
                💰 Monetização
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                {[
                  { label: 'Cliques no CTA', value: data.cta_clicks, sub: 'Live Room', icon: '🖱️' },
                  { label: 'Taxa de conversão', value: `${conversionRate}%`, sub: 'cliques / presentes', icon: '📈' },
                  { label: 'Ganho por participante', value: 'R$ 0,00', sub: 'configure seu CRM', icon: '🧮' },
                  { label: 'Pop-ups exibidos', value: data.popup_seen, sub: 'Offer popups', icon: '🎯' },
                ].map((m, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-elevated)', borderRadius: 12,
                    padding: '16px 20px', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{m.icon}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{m.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

