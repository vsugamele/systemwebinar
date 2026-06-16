'use client'

import { useState, useEffect, startTransition, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AdminToasts from '@/components/AdminToasts'

const navItems = [
  { href: '/admin', icon: '📊', label: 'Dashboard', exact: true },
  { href: '/admin/projects', icon: '🗂️', label: 'Projetos' },
  { href: '/admin/registrants', icon: '👥', label: 'Registrantes' },
  { href: '/admin/analytics', icon: '📈', label: 'Analytics' },
  { href: '/admin/emails', icon: '✉️', label: 'E-mails' },
]

interface ActiveWebinarContext {
  id: string
  project_id: string
  name: string
  slug: string
  status: string
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [userEmail, setUserEmail] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeWebinars, setActiveWebinars] = useState<ActiveWebinarContext[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || '')
    })
    supabase
      .from('webi_webinars')
      .select('id, project_id, name, slug, status')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(4)
      .then(({ data }) => setActiveWebinars((data as ActiveWebinarContext[]) || []))
  }, [supabase])

  // Close mobile menu on route change
  useEffect(() => {
    startTransition(() => setMobileMenuOpen(false))
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const routeWebinarMatch = pathname.match(/^\/admin\/projects\/([^/]+)\/webinars\/([^/]+)/)
  const routeWebinarBase = routeWebinarMatch
    ? `/admin/projects/${routeWebinarMatch[1]}/webinars/${routeWebinarMatch[2]}`
    : null
  const primaryActive = activeWebinars[0] || null
  const fallbackWebinarBase = primaryActive
    ? `/admin/projects/${primaryActive.project_id}/webinars/${primaryActive.id}`
    : null
  const webinarBase = routeWebinarBase || fallbackWebinarBase

  const quickTabs = [
    { href: '/admin', label: 'Dashboard', exact: true },
    ...(webinarBase ? [
      { href: webinarBase, label: 'Hub do Webinar' },
      { href: `${webinarBase}/live`, label: 'Control Room' },
      { href: `${webinarBase}/analytics`, label: 'Analytics' },
    ] : []),
  ]

  return (
    <div className="admin-layout">
      {/* Mobile Header Toggle */}
      <div className="mobile-header">
        <div className="sidebar-logo" style={{ padding: 0, border: 'none' }}>
          <div className="sidebar-logo-icon" style={{ width: 28, height: 28, fontSize: 14 }}>🎬</div>
          <span className="sidebar-logo-text" style={{ fontSize: 16 }}>WebinarFlow</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ background: 'transparent', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, color: 'var(--text-primary)' }}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🎬</div>
          <span className="sidebar-logo-text">WebinarFlow</span>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Principal</span>
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href, item.exact) ? 'active' : ''}`}
            >
              <span className="nav-item-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {activeWebinars.length > 0 && (
            <>
              <div className="nav-divider" />
              <span className="nav-section-label">Webinars Ativos</span>
              <div className="active-webinars-list">
                {activeWebinars.map((webinar) => {
                  const base = `/admin/projects/${webinar.project_id}/webinars/${webinar.id}`
                  return (
                    <div className="active-webinar-card" key={webinar.id}>
                      <div className="active-webinar-live">
                        <span className="active-webinar-dot" />
                        Ao vivo
                      </div>
                      <Link href={base} className="active-webinar-title">{webinar.name}</Link>
                      <div className="active-webinar-actions">
                        <Link href={`${base}/live`}>Control Room</Link>
                        <Link href={`${base}/analytics`}>Analytics</Link>
                      </div>
                    </div>
                  )
                })}
                {activeWebinars.length >= 4 && (
                  <Link href="/admin/projects" className="active-webinars-more">Ver todos ativos</Link>
                )}
              </div>
              {webinarBase && (
                <Link href={webinarBase} className={`nav-item ${pathname === webinarBase ? 'active' : ''}`}>
                  <span className="nav-item-icon">🧭</span>
                  Hub do Webinar
                </Link>
              )}
            </>
          )}
        </nav>

        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, wordBreak: 'break-all' }}>
            {userEmail}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ width: '100%' }}>
            🚪 Sair
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="admin-topbar">
          <div className="admin-tabs">
            {quickTabs.map(tab => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`admin-tab ${isActive(tab.href, tab.exact) ? 'active' : ''}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-shortcut">⌘K</span>
            <span className="admin-insight">💡 Melhorias</span>
          </div>
        </div>
        {children}
      </main>
      <nav className="mobile-bottom-nav">
        {[
          { href: '/admin', icon: '📊', label: 'Dashboard', exact: true },
          { href: '/admin/projects', icon: '🗂️', label: 'Projetos' },
          { href: '/admin/registrants', icon: '👥', label: 'Leads' },
          { href: '/admin/analytics', icon: '📈', label: 'Analytics' },
        ].map(item => (
          <Link key={item.href} href={item.href} className={isActive(item.href, item.exact) ? 'active' : ''}>
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <AdminToasts />
    </div>
  )
}
