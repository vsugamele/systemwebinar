'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useWebinarHealth, HealthStatus } from '@/hooks/useWebinarHealth'
import { createClient } from '@/lib/supabase/client'

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusDot({ status, count }: { status: HealthStatus; count?: number }) {
  if (status === 'ok')
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
        background: 'rgba(16,185,129,0.15)', color: '#10b981', marginLeft: 'auto', flexShrink: 0,
      }}>
        {count != null ? count : '✓'}
      </span>
    )

  if (status === 'warn')
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
        background: 'rgba(245,158,11,0.15)', color: '#f59e0b', marginLeft: 'auto', flexShrink: 0,
      }}>
        ⚠
      </span>
    )

  // empty
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
      background: 'rgba(156,163,175,0.1)', color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0,
    }}>
      —
    </span>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────
export function SidebarWebinar({ projectId, webinarId }: { projectId: string; webinarId: string }) {
  const pathname = usePathname()
  const health = useWebinarHealth(webinarId)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const router = useRouter()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [siblingWebinars, setSiblingWebinars] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('webi_projects').select('id, name').order('name').then(({ data }) => {
      if (data) setProjects(data)
    })
    supabase.from('webi_webinars').select('id, name').eq('project_id', projectId).order('name').then(({ data }) => {
      if (data) setSiblingWebinars(data)
    })
  }, [projectId])

  // Hide completely inside the live room
  if (pathname.endsWith('/live')) return null

  const base = `/admin/projects/${projectId}/webinars/${webinarId}`

  const links: {
    href: string
    label: string
    exact: boolean
    statusKey: keyof typeof health
    count?: number
  }[] = [
    { href: base,                     label: '⚙️ Visão Geral',   exact: true,  statusKey: 'overview' },
    { href: `${base}/registration`,   label: '🧲 Pág. de Captura', exact: false, statusKey: 'registration' },
    { href: `${base}/events`,         label: '⚡ Timeline',       exact: false, statusKey: 'events',    count: health.eventsCount },
    { href: `${base}/chat`,           label: '💬 Chat & IA',      exact: false, statusKey: 'chat' },
    { href: `${base}/materials`,      label: '📂 Materiais',      exact: false, statusKey: 'materials', count: health.materialsCount },
    { href: `${base}/quiz`,           label: '📝 Quiz',           exact: false, statusKey: 'quiz' },
    { href: `${base}/leads`,          label: '📇 Leads (CRM)',    exact: false, statusKey: 'leads',     count: health.leadsCount },
    { href: `${base}/analytics`,      label: '📊 Analytics',      exact: false, statusKey: 'analytics' },
  ]

  const auxLinks = [
    { href: `${base}/chat-history`,                                    label: '💬 Histórico de Chat' },
    { href: `/admin/emails?project=${projectId}&webinar=${webinarId}`, label: '✉️ E-mails Ocultos' },
    { href: `/admin/projects/${projectId}/analytics`,                  label: '📊 Analytics Global' },
  ]

  // Overall progress: how many sections are 'ok'
  const statusKeys: (keyof typeof health)[] = ['overview','registration','events','chat','materials','quiz']
  const okCount = statusKeys.filter(k => health[k] === 'ok').length
  const totalCount = statusKeys.length
  const pct = Math.round((okCount / totalCount) * 100)

  const renderNavLinks = (isMobileStyle = false) => {
    return (
      <nav style={{ display: 'flex', flexDirection: 'column', gap: isMobileStyle ? 6 : 2 }}>
        {links.map(link => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href)
          const status = health[link.statusKey] as HealthStatus

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: isMobileStyle ? '14px 16px' : '10px 12px',
                borderRadius: 8,
                fontSize: isMobileStyle ? 14 : 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--brand-light)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.1)' : isMobileStyle ? 'rgba(255,255,255,0.02)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
                border: isMobileStyle ? '1px solid rgba(255,255,255,0.03)' : 'none',
              }}
            >
              <span style={{ flex: 1 }}>{link.label}</span>
              {!health.loading && (
                <StatusDot
                  status={status}
                  count={link.count !== undefined && link.count > 0 ? link.count : undefined}
                />
              )}
              {health.loading && (
                <span style={{ width: 20, height: 8, borderRadius: 4, background: 'var(--border)', marginLeft: 'auto' }} />
              )}
            </Link>
          )
        })}
      </nav>
    )
  }

  const renderAuxLinks = (isMobileStyle = false) => {
    return (
      <nav style={{ display: 'flex', flexDirection: 'column', gap: isMobileStyle ? 6 : 2 }}>
        {auxLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMobileMenuOpen(false)}
            style={{
              display: 'flex', alignItems: 'center',
              padding: isMobileStyle ? '14px 16px' : '10px 12px',
              borderRadius: 8,
              fontSize: isMobileStyle ? 14 : 13,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              backgroundColor: isMobileStyle ? 'rgba(255,255,255,0.01)' : 'transparent',
              border: isMobileStyle ? '1px solid rgba(255,255,255,0.02)' : 'none',
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    )
  }

  const renderWorkspaceSwitcher = () => {
    return (
      <div style={{
        marginBottom: 16,
        padding: '12px 10px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        {/* Project Selector */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📁 Projeto
            </span>
          </div>
          <select
            value={projectId}
            onChange={(e) => {
              const newPid = e.target.value
              router.push(`/admin/projects/${newPid}/webinars`)
            }}
            style={{
              width: '100%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '6px 8px',
              borderRadius: 6,
              outline: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Webinar Selector */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🎬 Webinar
            </span>
          </div>
          <select
            value={webinarId}
            onChange={(e) => {
              const newWid = e.target.value
              const subPath = pathname.split(`/webinars/${webinarId}`)[1] || ''
              router.push(`/admin/projects/${projectId}/webinars/${newWid}${subPath}`)
            }}
            style={{
              width: '100%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '6px 8px',
              borderRadius: 6,
              outline: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {siblingWebinars.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── DESKTOP LAYOUT ── */}
      <div className="sidebar-webinar-desktop">
        {/* Workspace Switcher */}
        {renderWorkspaceSwitcher()}

        {/* Progress bar */}
        <div style={{ marginBottom: 20, paddingLeft: 4, paddingRight: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Configuração
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : 'var(--text-muted)' }}>
              {health.loading ? '…' : `${okCount}/${totalCount}`}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${health.loading ? 0 : pct}%`,
              background: pct === 100
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : pct >= 60
                  ? 'linear-gradient(90deg, #f59e0b, #fcd34d)'
                  : 'linear-gradient(90deg, #6366f1, #818cf8)',
              borderRadius: 99,
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>

        {/* Nav links */}
        {renderNavLinks(false)}

        {/* Outros label */}
        <div style={{ marginTop: 28, marginBottom: 10, paddingLeft: 4, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Outros
        </div>

        {/* Aux links */}
        {renderAuxLinks(false)}

        {/* Control Room CTA */}
        <div style={{ marginTop: 24 }}>
          <Link
            href={`${base}/live`}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 8, fontWeight: 700 }}
          >
            <span style={{ fontSize: 16 }}>🔴</span> Control Room
          </Link>
        </div>
      </div>

      {/* ── MOBILE LAYOUT (Floating FAB + Drawer Bottom Sheet) ── */}
      <div className="sidebar-webinar-mobile">
        {/* Floating Action Button */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          style={{
            position: 'fixed',
            bottom: 80,
            right: 20,
            zIndex: 45,
            background: 'var(--brand)',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 56,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 10px rgba(99,102,241,0.3)',
            fontSize: 22,
            cursor: 'pointer',
          }}
          title="Menu do Webinar"
        >
          📋
        </button>

        {/* Bottom Sheet Drawer Modal */}
        {mobileMenuOpen && (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(5, 5, 8, 0.75)', backdropFilter: 'blur(6px)',
              zIndex: 1000,
            }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <div
              style={{
                position: 'fixed', left: 0, right: 0, bottom: 0,
                background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)',
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                maxHeight: '85vh', overflowY: 'auto', zIndex: 1001,
                padding: '24px 20px 40px 20px',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
                animation: 'slideUpSheet 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag Handle */}
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 99, margin: '0 auto 16px' }} />

              {/* Workspace Switcher in Mobile Sheet */}
              {renderWorkspaceSwitcher()}

              {/* Title & Progress */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#fff' }}>📋 Menu do Webinar</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Configuração Geral: {pct}% completo</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', cursor: 'pointer',
                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Progress Bar */}
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, var(--brand), var(--brand-light))',
                  borderRadius: 99,
                }} />
              </div>

              {/* Main configuration links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 4, marginBottom: 4 }}>
                  Configurações
                </span>
                {renderNavLinks(true)}
              </div>

              {/* Aux configuration links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 4, marginBottom: 4 }}>
                  Outros Recursos
                </span>
                {renderAuxLinks(true)}
              </div>

              {/* Control Room CTA in mobile sheet */}
              <Link
                href={`${base}/live`}
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', gap: 8, padding: '14px 16px', borderRadius: 10, fontWeight: 700 }}
              >
                <span style={{ fontSize: 16 }}>🔴</span> Entrar na Control Room
              </Link>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUpSheet {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
