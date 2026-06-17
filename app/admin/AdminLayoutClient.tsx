'use client'

import { useState, useEffect, startTransition, useMemo, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AdminToasts from '@/components/AdminToasts'
import { toast } from 'react-hot-toast'

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
  const [commandOpen, setCommandOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [activeWebinars, setActiveWebinars] = useState<ActiveWebinarContext[]>([])
  const [currentWebinar, setCurrentWebinar] = useState<{ id: string; name: string; slug: string; project_id: string } | null>(null)
  const commandInputRef = useRef<HTMLInputElement | null>(null)

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
    setCommandOpen(false)
    setInsightsOpen(false)
  }, [pathname])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(open => !open)
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setInsightsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!commandOpen) return
    const timer = window.setTimeout(() => commandInputRef.current?.focus(), 40)
    return () => window.clearTimeout(timer)
  }, [commandOpen])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const routeWebinarMatch = pathname.match(/^\/admin\/projects\/([^/]+)\/webinars\/([^/]+)/)
  const currentWebinarId = routeWebinarMatch ? routeWebinarMatch[2] : null

  useEffect(() => {
    if (currentWebinarId) {
      supabase
        .from('webi_webinars')
        .select('id, name, slug, project_id')
        .eq('id', currentWebinarId)
        .single()
        .then(({ data }) => {
          if (data) setCurrentWebinar(data)
        })
    } else {
      setCurrentWebinar(null)
    }
  }, [currentWebinarId, supabase])

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

  const commandActions = [
    { href: '/admin', icon: '📊', label: 'Dashboard', hint: 'Visão geral da conta' },
    { href: '/admin/projects', icon: '🗂️', label: 'Projetos', hint: 'Todos os projetos' },
    { href: '/admin/registrants', icon: '👥', label: 'Registrantes', hint: 'Leads globais' },
    { href: '/admin/analytics', icon: '📈', label: 'Analytics Global', hint: 'Métricas consolidadas' },
    { href: '/admin/emails', icon: '✉️', label: 'E-mails', hint: 'Templates e retenção' },
    ...(currentWebinar ? [
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}`, icon: '🧭', label: 'Hub do Webinar', hint: 'Visão geral de pré-lançamento' },
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}/registration`, icon: '🧲', label: 'Página de Captura', hint: 'Copy e formulário' },
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}/video-pitch`, icon: '🎥 Criar pitch', hint: 'Configurar vídeo, thumbnail e oferta' },
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}/leads`, icon: '📇 Ver leads quentes', hint: 'Visualizar cadastros e engajamento' },
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}/analytics`, icon: '📊 Abrir analytics', hint: 'Métricas de retenção e conversão' },
      {
        icon: '🔥',
        label: 'Iniciar sessão',
        hint: 'Disparar início de transmissão imediata (Run)',
        action: async () => {
          try {
            const res = await fetch('/api/webinar-runs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ webinar_id: currentWebinar.id, action: 'start' }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error || 'Erro operacional')
            toast.success('Transmissão iniciada com sucesso via atalho!')
            router.refresh()
          } catch (e: any) {
            toast.error(`Erro ao iniciar: ${e.message}`)
          }
        }
      },
      {
        icon: '🔗',
        label: 'Copiar link de inscrição',
        hint: 'Copiar link da página de captura para o clipboard',
        action: () => {
          navigator.clipboard.writeText(`${window.location.origin}/r/${currentWebinar.slug}`)
          toast.success('Link de inscrição copiado para área de transferência!')
        }
      },
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}?focus=whatsapp_api_url`, icon: '💬 Configurar WhatsApp', hint: 'Ajustar mensagens automáticas de checkout' },
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}/exports`, icon: '📥 Exportar métricas', hint: 'Ir para central de exportação em CSV' },
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}/events`, icon: '⚡ Gatilhos da Aula', hint: 'Timeline de chat e popups' },
      { href: `/admin/projects/${currentWebinar.project_id}/webinars/${currentWebinar.id}/live`, icon: '🔴 Ao Vivo / Execuções', hint: 'Entrar no painel de controle da live' },
    ] : webinarBase ? [
      { href: webinarBase, icon: '🧭', label: 'Hub do Webinar', hint: 'Configuração principal' },
      { href: `${webinarBase}/registration`, icon: '🧲', label: 'Página de Captura', hint: 'Cadastro e copy' },
      { href: `${webinarBase}/events`, icon: '⚡ Gatilhos da Aula', hint: 'Chat, pitch e popups' },
      { href: `${webinarBase}/live`, icon: '🔴 Ao Vivo / Execuções', hint: 'Operação da live' },
      { href: `${webinarBase}/analytics`, icon: '📊 Analytics do Webinar', hint: 'Retenção e funil' },
    ] : []),
    ...activeWebinars.flatMap(webinar => {
      const base = `/admin/projects/${webinar.project_id}/webinars/${webinar.id}`
      return [
        { href: base, icon: '🎬', label: webinar.name, hint: 'Abrir hub do webinar ativo' },
        { href: `${base}/live`, icon: '🔴', label: `${webinar.name} - Ao Vivo`, hint: 'Entrar na operação' },
      ]
    }),
  ]
  const normalizedCommandQuery = commandQuery.trim().toLowerCase()
  const filteredCommandActions = commandActions
    .filter(action => {
      if (!normalizedCommandQuery) return true
      return `${action.label} ${action.hint}`.toLowerCase().includes(normalizedCommandQuery)
    })
    .slice(0, 12)

  const insightItems = [
    {
      scope: 'Metricas',
      title: 'Validar agregacao de retencao',
      body: 'Depois da migration, confirme se novos plays alimentam os buckets de 5s.',
      href: webinarBase ? `${webinarBase}/analytics` : '/admin/analytics',
    },
    {
      scope: 'Operacao',
      title: activeWebinars.length > 1 ? `${activeWebinars.length} webinars ativos` : 'Webinar ativo em destaque',
      body: activeWebinars.length > 1
        ? 'Use busca ou sidebar para alternar entre Control Rooms sem depender do primeiro ativo.'
        : 'Mantenha Control Room e Analytics proximos durante validacao ao vivo.',
      href: webinarBase ? `${webinarBase}/live` : '/admin/projects',
    },
    {
      scope: 'Setup',
      title: 'Completar timeline antes do trafego',
      body: 'Pitch, popups, chat e e-mails devem estar revisados antes de escalar campanha.',
      href: webinarBase ? `${webinarBase}/events` : '/admin/projects',
    },
    {
      scope: 'CRM',
      title: 'Priorizar follow-up quente',
      body: 'Leads com tempo assistido alto e clique no CTA devem ir primeiro para contato.',
      href: webinarBase ? `${webinarBase}/leads` : '/admin/registrants',
    },
  ]

  function executeCommand(action: { href?: string; action?: () => void } | string) {
    setCommandOpen(false)
    setInsightsOpen(false)
    setCommandQuery('')
    if (typeof action === 'string') {
      router.push(action)
    } else if (action.action) {
      action.action()
    } else if (action.href) {
      router.push(action.href)
    }
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
            <button type="button" className="admin-shortcut" onClick={() => setCommandOpen(true)}>⌘K</button>
            <button type="button" className="admin-insight" onClick={() => setInsightsOpen(open => !open)}>💡 Melhorias</button>
          </div>
        </div>
        {children}
      </main>
      {commandOpen && (
        <div className="admin-command-overlay" onClick={() => setCommandOpen(false)}>
          <div className="admin-command-modal" onClick={event => event.stopPropagation()}>
            <div className="admin-command-search">
              <span>🔍</span>
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={event => setCommandQuery(event.target.value)}
                placeholder="Buscar tela, webinar ou acao..."
              />
              <kbd>ESC</kbd>
            </div>
            <div className="admin-command-list">
              {filteredCommandActions.length === 0 ? (
                <div className="admin-command-empty">Nenhum atalho encontrado.</div>
              ) : (
                filteredCommandActions.map((action, idx) => (
                  <button
                    type="button"
                    key={`${action.href || idx}-${action.label}`}
                    className="admin-command-item"
                    onClick={() => executeCommand(action)}
                  >
                    <span className="admin-command-icon">{action.icon}</span>
                    <span>
                      <strong>{action.label}</strong>
                      <small>{action.hint}</small>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {insightsOpen && (
        <aside className="admin-insights-panel">
          <div className="admin-insights-header">
            <div>
              <strong>Melhorias sugeridas</strong>
              <span>{insightItems.length} prioridades para revisar</span>
            </div>
            <button type="button" onClick={() => setInsightsOpen(false)}>✕</button>
          </div>
          <div className="admin-insights-list">
            {insightItems.map(item => (
              <button
                type="button"
                className="admin-insight-card"
                key={`${item.scope}-${item.title}`}
                onClick={() => executeCommand(item.href)}
              >
                <span>{item.scope}</span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
              </button>
            ))}
          </div>
        </aside>
      )}
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
