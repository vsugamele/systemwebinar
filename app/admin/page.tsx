'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { Webinar } from '@/types'

interface WebinarWithProject extends Webinar {
  webi_projects?: { name: string; brand_color?: string } | null
}

interface Stats {
  projects: number
  webinars: number
  webinarsActive: number
  leads: number
  ctaClicks: number
}

const STAT_CARDS = (s: Stats) => [
  {
    label: 'Projetos',
    value: s.projects,
    icon: '🗂️',
    color: '#6366f1',
    sub: 'namespaces criados',
    href: '/admin/projects',
  },
  {
    label: 'Webinars',
    value: s.webinars,
    icon: '🎬',
    color: '#3b82f6',
    sub: `${s.webinarsActive} ativos agora`,
    href: '/admin/projects',
  },
  {
    label: 'Leads Capturados',
    value: s.leads.toLocaleString('pt-BR'),
    icon: '👤',
    color: '#22c55e',
    sub: 'cadastros totais',
    href: '/admin/registrants',
  },
  {
    label: 'Cliques no Pitch',
    value: s.ctaClicks.toLocaleString('pt-BR'),
    icon: '🛒',
    color: '#f97316',
    sub: s.leads > 0
      ? `${((s.ctaClicks / s.leads) * 100).toFixed(1)}% dos leads`
      : 'sem leads ainda',
    href: undefined,
  },
]

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ projects: 0, webinars: 0, webinarsActive: 0, leads: 0, ctaClicks: 0 })
  const [recentWebinars, setRecentWebinars] = useState<WebinarWithProject[]>([])
  const [activeWebinars, setActiveWebinars] = useState<WebinarWithProject[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const [
        { data: projects },
        { data: webinars },
        { count: activeCount },
        { count: leadsCount },
        { count: ctaCount },
        { data: recent },
        { data: active },
      ] = await Promise.all([
        supabase.from('webi_projects').select('id'),
        supabase.from('webi_webinars').select('id'),
        supabase.from('webi_webinars').select('id', { count: 'exact', head: true }).eq('status', 'active').or('session_started_at.not.is.null,is_evergreen.eq.true'),
        supabase.from('webi_leads').select('id', { count: 'exact', head: true }),
        supabase.from('webi_session_events').select('id', { count: 'exact', head: true }).eq('event_type', 'cta_clicked'),
        supabase.from('webi_webinars')
          .select('*, webi_projects(name, brand_color)')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('webi_webinars')
          .select('*, webi_projects(name, brand_color)')
          .eq('status', 'active')
          .or('session_started_at.not.is.null,is_evergreen.eq.true')
          .order('updated_at', { ascending: false })
          .limit(6),
      ])

      setStats({
        projects: projects?.length || 0,
        webinars: webinars?.length || 0,
        webinarsActive: activeCount || 0,
        leads: leadsCount || 0,
        ctaClicks: ctaCount || 0,
      })
      setRecentWebinars((recent as WebinarWithProject[]) || [])
      setActiveWebinars((active as WebinarWithProject[]) || [])
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando dashboard...</span>
    </div>
  )

  const cards = STAT_CARDS(stats)
  const activeWebinar = activeWebinars[0] || null
  const setupWebinars = recentWebinars.slice(0, 2).map(w => {
    const checks = [
      !!w.name,
      !!w.video_url,
      !!w.landing_headline,
      !!w.landing_button_text,
      !!w.webhook_url || !!w.whatsapp_api_url,
      w.status === 'active',
    ]
    const done = checks.filter(Boolean).length
    return {
      webinar: w,
      done,
      total: checks.length,
      pct: Math.round((done / checks.length) * 100),
      missing: [
        !w.video_url ? { key: 'video_url', label: 'vídeo 🎥', href: `/admin/projects/${w.project_id}/webinars/${w.id}?focus=video_url` } : null,
        !w.landing_headline ? { key: 'captura', label: 'captura 🧲', href: `/admin/projects/${w.project_id}/webinars/${w.id}/registration` } : null,
        (!w.webhook_url && !w.whatsapp_api_url) ? { key: 'integracao', label: 'integração 🔌', href: `/admin/projects/${w.project_id}/webinars/${w.id}?focus=webhook_url` } : null,
        w.status !== 'active' ? { key: 'publicacao', label: 'publicar 🚀', href: `/admin/projects/${w.project_id}/webinars/${w.id}?focus=status` } : null,
      ].filter(Boolean) as { key: string; label: string; href: string }[]
    }
  })

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Bom dia</h1>
          <p className="page-subtitle">Visão geral da sua plataforma de webinars</p>
        </div>
        <Link href="/admin/projects" className="btn btn-primary">
          + Novo Projeto
        </Link>
      </div>

      <div className="page-body">
        {activeWebinars.length === 1 && activeWebinar && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.16), rgba(239,68,68,0.05))',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 12px rgba(239,68,68,0.8)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#fca5a5', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Webinar ativo agora</div>
                <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeWebinar.name}</div>
              </div>
            </div>
            <Link href={`/admin/projects/${activeWebinar.project_id}/webinars/${activeWebinar.id}/live`} className="btn btn-primary btn-sm">
              Control Room
            </Link>
          </div>
        )}

        {activeWebinars.length > 1 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.14), rgba(99,102,241,0.08))',
            border: '1px solid rgba(239,68,68,0.22)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#fca5a5', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {stats.webinarsActive} webinars ativos agora
                </div>
                <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800, marginTop: 3 }}>
                  Lives acontecendo em paralelo
                </h2>
              </div>
              {stats.webinarsActive > activeWebinars.length && (
                <Link href="/admin/projects" className="btn btn-ghost btn-sm">
                  Ver todos
                </Link>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {activeWebinars.map((webinar) => (
                <div
                  key={webinar.id}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 11,
                    padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 10px rgba(239,68,68,0.8)', flexShrink: 0 }} />
                    <strong style={{ color: 'var(--text-primary)', fontSize: 13, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {webinar.name}
                    </strong>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {webinar.webi_projects?.name || 'Projeto'} - /w/{webinar.slug}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/admin/projects/${webinar.project_id}/webinars/${webinar.id}/live`} className="btn btn-primary btn-sm">
                      Control Room
                    </Link>
                    <Link href={`/admin/projects/${webinar.project_id}/webinars/${webinar.id}/analytics`} className="btn btn-ghost btn-sm">
                      Analytics
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Stat Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16,
          marginBottom: 40,
        }}>
          {cards.map(card => (
            <div
              key={card.label}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${card.color}30`,
                borderRadius: 16,
                padding: '20px 24px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              {/* Subtle glow circle in background */}
              <div style={{
                position: 'absolute', top: -20, right: -20,
                width: 80, height: 80, borderRadius: '50%',
                background: `${card.color}15`, pointerEvents: 'none',
              }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${card.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {card.icon}
                </div>
                {card.href && (
                  <Link
                    href={card.href}
                    style={{
                      fontSize: 11, color: card.color, fontWeight: 600,
                      background: `${card.color}12`, borderRadius: 6,
                      padding: '4px 8px', textDecoration: 'none',
                    }}
                  >
                    Ver →
                  </Link>
                )}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: card.color, lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 6 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>

        {setupWebinars.length > 0 && (
          <div style={{ marginBottom: 34 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800 }}>Continue Configurando</h2>
              <Link href="/admin/projects" className="btn btn-ghost btn-sm">Ver projetos</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {setupWebinars.map(item => (
                <div
                  key={item.webinar.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <Link
                        href={`/admin/projects/${item.webinar.project_id}/webinars/${item.webinar.id}`}
                        style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {item.webinar.name}
                      </Link>
                      <span style={{ color: item.pct >= 80 ? '#22c55e' : '#f59e0b', fontSize: 12, fontWeight: 800 }}>{item.pct}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ width: `${item.pct}%`, height: '100%', background: item.pct >= 80 ? '#22c55e' : '#6366f1', borderRadius: 99 }} />
                    </div>
                    
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>
                      {item.done} de {item.total} configurado
                    </div>
                  </div>

                  {item.missing.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {item.missing.map(m => (
                        <Link
                          key={m.key}
                          href={m.href}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(99, 102, 241, 0.1)',
                            color: 'var(--brand-light)',
                            textDecoration: 'none',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          + {m.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  {item.missing.length === 0 && (
                    <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
                      ✓ Pronto para rodar!
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Webinars */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentWebinars.map((w) => {
              const accent = w.webi_projects?.brand_color || '#6366f1'
              const statusMap: Record<string, { label: string; color: string; dot: string }> = {
                active:  { label: 'Ativo',     color: '#22c55e', dot: '#22c55e' },
                draft:   { label: 'Rascunho',  color: '#9ca3af', dot: '#4b5563' },
                paused:  { label: 'Pausado',   color: '#f59e0b', dot: '#f59e0b' },
              }
              const st = statusMap[w.status] || statusMap.draft
              return (
                <div key={w.id} style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                  transition: 'border-color 0.15s',
                }}>
                  {/* Color accent bar */}
                  <div style={{
                    width: 4, height: 40, borderRadius: 4,
                    background: accent, flexShrink: 0,
                  }} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
                      {w.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {w.webi_projects?.name || '—'} · <code style={{ color: 'var(--brand-light)' }}>/w/{w.slug}</code>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: `${st.color}15`,
                    border: `1px solid ${st.color}40`,
                    borderRadius: 99, padding: '4px 10px',
                    fontSize: 12, fontWeight: 600, color: st.color,
                    flexShrink: 0,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                    {st.label}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link
                      href={`/admin/projects/${w.project_id}/webinars/${w.id}`}
                      className="btn btn-ghost btn-sm"
                      title="Configurações"
                    >
                      ⚙️ Config
                    </Link>
                    <Link
                      href={`/w/${w.slug}?test=1`}
                      target="_blank"
                      className="btn btn-ghost btn-sm"
                      title="Ver sala ao vivo"
                    >
                      ▶ Sala
                    </Link>
                    <Link
                      href={`/admin/projects/${w.project_id}/webinars/${w.id}/analytics`}
                      className="btn btn-ghost btn-sm"
                      title="Analytics"
                    >
                      📊 Analytics
                    </Link>
                    <Link
                      href={`/admin/projects/${w.project_id}/webinars/${w.id}/chat`}
                      className="btn btn-ghost btn-sm"
                      title="Chat"
                    >
                      💬 Chat
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Quick Links */}
        <div style={{
          marginTop: 40,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}>
          {[
            { icon: '🗂️', label: 'Gerenciar Projetos', desc: 'Crie e organize seus projetos', href: '/admin/projects' },
            { icon: '👥', label: 'Todos os Leads', desc: 'Lista completa de registrados', href: '/admin/registrants' },
            { icon: '📧', label: 'E-mails', desc: 'Templates e histórico de envios', href: '/admin/emails' },
          ].map(link => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '16px 18px',
                textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'
              }}
            >
              <div style={{ fontSize: 28 }}>{link.icon}</div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{link.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{link.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
