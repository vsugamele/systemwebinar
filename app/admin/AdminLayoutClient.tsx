'use client'

import { useState, useEffect } from 'react'
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

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [userEmail, setUserEmail] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || '')
    })
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

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
          <span className="nav-section-label">Menu Principal</span>
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
        {children}
      </main>
      <AdminToasts />
    </div>
  )
}
