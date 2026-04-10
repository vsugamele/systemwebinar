'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SidebarWebinar({ projectId, webinarId }: { projectId: string; webinarId: string }) {
  const pathname = usePathname()

  // Hide the sidebar if we are completely immersed in the live operation
  if (pathname.endsWith('/live')) {
    return null
  }

  const links = [
    { href: `/admin/projects/${projectId}/webinars/${webinarId}`, label: '⚙️ Visão Geral', exact: true },
    { href: `/admin/projects/${projectId}/webinars/${webinarId}/registration`, label: '🧲 Pág. de Captura', exact: false },
    { href: `/admin/projects/${projectId}/webinars/${webinarId}/events`, label: '⚡ Timeline', exact: false },
    { href: `/admin/projects/${projectId}/webinars/${webinarId}/chat`, label: '💬 Chat & IA', exact: false },
    { href: `/admin/projects/${projectId}/webinars/${webinarId}/materials`, label: '📂 Materiais', exact: false },
    { href: `/admin/projects/${projectId}/webinars/${webinarId}/quiz`, label: '📝 Quiz', exact: false },
    { href: `/admin/projects/${projectId}/webinars/${webinarId}/leads`, label: '📇 Leads (CRM)', exact: false },
    { href: `/admin/projects/${projectId}/webinars/${webinarId}/analytics`, label: '📊 Analytics', exact: false },
  ]

  const auxLinks = [
    { href: `/admin/emails?project=${projectId}&webinar=${webinarId}`, label: '✉️ E-mails Ocultos', exact: false },
    { href: `/admin/projects/${projectId}/analytics`, label: '📊 Analytics Global', exact: false },
  ]

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
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingLeft: 12 }}>
        Configuração
      </div>
      
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {links.map(link => {
          const isActive = link.exact 
            ? pathname === link.href 
            : pathname.startsWith(link.href)
            
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--brand-light)' : 'var(--text-secondary)',
                background: isActive ? 'theme("colors.indigo.500 / 15%")' : 'transparent', // Adjusting if tailwind classes aren't matching inline
                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>

      <div style={{ marginTop: 32, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingLeft: 12 }}>
        Outros
      </div>
      
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'auto' }}>
        {auxLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, 
              color: 'var(--text-secondary)', textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div style={{ marginTop: 24 }}>
        <Link
          href={`/admin/projects/${projectId}/webinars/${webinarId}/live`}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', gap: 8 }}
        >
          <span style={{ fontSize: 16 }}>🔴</span> Control Room
        </Link>
      </div>
    </div>
  )
}
