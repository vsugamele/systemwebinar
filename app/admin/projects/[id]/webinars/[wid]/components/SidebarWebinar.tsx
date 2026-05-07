'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useWebinarHealth, HealthStatus } from '@/hooks/useWebinarHealth'

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

  return (
    <div style={{
      width: 260,
      flexShrink: 0,
      background: 'var(--bg-elevated)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
    }}>

      {/* ── Progress bar ── */}
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

      {/* ── Nav links ── */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {links.map(link => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href)
          const status = health[link.statusKey] as HealthStatus

          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--brand-light)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
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

      {/* ── Outros ── */}
      <div style={{ marginTop: 28, marginBottom: 10, paddingLeft: 4, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Outros
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 'auto' }}>
        {auxLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              color: 'var(--text-secondary)', textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* ── Control Room CTA ── */}
      <div style={{ marginTop: 24 }}>
        <Link
          href={`${base}/live`}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', gap: 8 }}
        >
          <span style={{ fontSize: 16 }}>🔴</span> Control Room
        </Link>
      </div>
    </div>
  )
}
