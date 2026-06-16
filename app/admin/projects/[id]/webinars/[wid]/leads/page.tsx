'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Lead } from '@/types'

const PAGE_SIZE = 50

interface SessionEventDetail {
  type: string
  timestamp: number | null
  created_at: string
  details?: string
}

interface SessionDetail {
  session_id: string
  lead_name: string
  lead_email: string
  lead_phone: string | null
  device: string
  browser: string
  os: string
  country: string
  watch_time: number
  clicked_cta: boolean
  events: SessionEventDetail[]
}

interface LeadEngagement {
  watchTime: number
  clickedCta: boolean
  chatMessages: number
  eventsCount: number
  device: string
  country: string
  score: number
  tags: string[]
}

type EngagementFilter = 'all' | 'hot' | 'clicked' | 'watched50' | 'chat'

const leadEmailKey = (email?: string | null) => (email || '').trim().toLowerCase()

const formatWatchTime = (seconds = 0) => {
  if (!seconds) return '0min'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const restMinutes = minutes % 60
    return `${hours}h ${restMinutes}min`
  }
  return remainingSeconds > 0 ? `${minutes}min ${remainingSeconds}s` : `${minutes}min`
}

const getWhatsAppUrl = (phone?: string | null) => {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const normalized = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${normalized}`
}

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`

export default function LeadsPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [webinarName, setWebinarName] = useState('')
  
  // Dashboard stats
  const [totalLeads, setTotalLeads] = useState(0)
  const [totalAttended, setTotalAttended] = useState(0)
  const [hotLeadsCount, setHotLeadsCount] = useState(0)
  const [ctaLeadsCount, setCtaLeadsCount] = useState(0)
  const [avgWatchMinutes, setAvgWatchMinutes] = useState(0)

  // List State
  const [leads, setLeads] = useState<Lead[]>([])
  const [engagementByEmail, setEngagementByEmail] = useState<Record<string, LeadEngagement>>({})
  
  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'attended' | 'absent'>('all')
  const [engagementFilter, setEngagementFilter] = useState<EngagementFilter>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loadingList, setLoadingList] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1) // reset page on search
    }, 500)
    return () => clearTimeout(handler)
  }, [searchTerm])

  useEffect(() => {
    async function loadStats() {
      // Webinar name
      const { data: w } = await supabase.from('webi_webinars').select('name').eq('id', wid).single()
      if (w) setWebinarName(w.name)

      // Total counts (count queries are faster)
      const { count: total } = await supabase.from('webi_leads').select('*', { count: 'exact', head: true }).eq('webinar_id', wid)
      const { count: attended } = await supabase.from('webi_leads').select('*', { count: 'exact', head: true }).eq('webinar_id', wid).eq('attended', true)
      
      setTotalLeads(total || 0)
      setTotalAttended(attended || 0)
      setLoading(false)
    }
    loadStats()
  }, [wid, supabase])

  useEffect(() => {
    async function loadEngagement() {
      try {
        const res = await fetch(`/api/analytics?webinar_id=${wid}&bucket_seconds=60`)
        if (!res.ok) return
        const data = await res.json()
        const sessions = (data.sessions || []) as SessionDetail[]
        const byEmail: Record<string, LeadEngagement> = {}

        sessions.forEach(session => {
          const email = leadEmailKey(session.lead_email)
          if (!email) return
          const chatMessages = session.events.filter(ev => ev.type === 'chat_sent').length
          const watchMinutes = Math.floor(session.watch_time / 60)
          const score = Math.min(100,
            Math.round(
              Math.min(50, watchMinutes * 2) +
              (session.clicked_cta ? 35 : 0) +
              Math.min(15, chatMessages * 5)
            )
          )
          const tags = [
            score >= 70 ? 'Lead quente' : score >= 40 ? 'Morno' : '',
            session.clicked_cta ? 'Clicou CTA' : '',
            watchMinutes >= 30 ? '30min+' : watchMinutes >= 10 ? '10min+' : '',
            chatMessages > 0 ? 'Chat ativo' : '',
          ].filter(Boolean)

          const previous = byEmail[email]
          if (!previous || score > previous.score) {
            byEmail[email] = {
              watchTime: session.watch_time,
              clickedCta: session.clicked_cta,
              chatMessages,
              eventsCount: session.events.length,
              device: session.device,
              country: session.country,
              score,
              tags,
            }
          }
        })

        const rows = Object.values(byEmail)
        setEngagementByEmail(byEmail)
        setHotLeadsCount(rows.filter(row => row.score >= 70).length)
        setCtaLeadsCount(rows.filter(row => row.clickedCta).length)
        setAvgWatchMinutes(rows.length > 0
          ? Math.round(rows.reduce((sum, row) => sum + row.watchTime, 0) / rows.length / 60)
          : 0
        )
      } catch (error) {
        console.warn('Erro ao carregar engajamento dos leads:', error)
      }
    }

    if (!loading) {
      loadEngagement()
    }
  }, [wid, loading])

  // Load paginated list
  useEffect(() => {
    async function fetchLeads() {
      setLoadingList(true)
      let query = supabase
        .from('webi_leads')
        .select('*', { count: 'exact' })
        .eq('webinar_id', wid)
      
      if (statusFilter === 'attended') query = query.eq('attended', true)
      if (statusFilter === 'absent') query = query.eq('attended', false)

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`)
      }

      const needsEngagementFilter = engagementFilter !== 'all'
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      query = query.order('registered_at', { ascending: false })

      if (needsEngagementFilter) {
        const { data } = await query.limit(5000)
        const filteredLeads = ((data || []) as unknown as Lead[]).filter(lead => {
          const engagement = engagementByEmail[leadEmailKey(lead.email)]
          if (engagementFilter === 'hot') return (engagement?.score || 0) >= 70
          if (engagementFilter === 'clicked') return !!engagement?.clickedCta
          if (engagementFilter === 'watched50') return (engagement?.watchTime || 0) >= 30 * 60
          if (engagementFilter === 'chat') return (engagement?.chatMessages || 0) > 0
          return true
        })

        setLeads(filteredLeads.slice(from, to + 1))
        setTotalPages(Math.ceil(filteredLeads.length / PAGE_SIZE) || 1)
      } else {
        const { data, count } = await query.range(from, to)
        const nextLeads = (data || []) as unknown as Lead[]
        setLeads(nextLeads)
        if (count !== null) {
          setTotalPages(Math.ceil(count / PAGE_SIZE) || 1)
        }
      }
      setLoadingList(false)
    }
    
    if (!loading) { // only after initial load
      fetchLeads()
    }
  }, [wid, supabase, page, statusFilter, engagementFilter, debouncedSearch, loading, engagementByEmail])

  // Needs CSV Export to handle mass export ignoring pagination
  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      // For export, we fetch all for this webinar (to a certain reasonable limit, e.g., 50000)
      const { data } = await supabase
        .from('webi_leads')
        .select('*')
        .eq('webinar_id', wid)
        .order('registered_at', { ascending: false })
      
      if (!data || data.length === 0) return

      const headers = [
        'ID',
        'Nome',
        'Email',
        'WhatsApp / Telefone',
        'Compareceu na Sala',
        'Data de Registro',
        'UTM Source',
        'UTM Medium',
        'UTM Campaign',
        'Score',
        'Tags',
        'Tempo Assistido',
        'Clicou CTA',
        'Mensagens no Chat',
        'Dispositivo',
        'Pais',
      ]
      const csvRows = [headers.join(',')]

      for (const lead of data as unknown as Lead[]) {
        const meta = lead.metadata || {}
        const engagement = engagementByEmail[leadEmailKey(lead.email)]
        const row = [
          lead.id,
          csvCell(lead.name),
          csvCell(lead.email),
          csvCell(lead.phone),
          lead.attended ? 'SIM' : 'NAO',
          csvCell(new Date(lead.registered_at).toLocaleString()),
          csvCell(meta.utm_source),
          csvCell(meta.utm_medium),
          csvCell(meta.utm_campaign),
          engagement?.score || 0,
          csvCell(engagement?.tags.join(' | ')),
          csvCell(formatWatchTime(engagement?.watchTime || 0)),
          engagement?.clickedCta ? 'SIM' : 'NAO',
          engagement?.chatMessages || 0,
          csvCell(engagement?.device),
          csvCell(engagement?.country),
        ]
        csvRows.push(row.join(','))
      }

      const csvContent = csvRows.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `leads_webinar_${wid}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      console.error(e)
    } finally {
      setIsExporting(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const rate = totalLeads ? Math.round((totalAttended / totalLeads) * 100) : 0

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">📇 Leads (CRM)</h1>
          <p className="page-subtitle">Listagem inteligente de espectadores cadastrados</p>
        </div>
        <button 
          onClick={handleExportCSV} 
          disabled={totalLeads === 0 || isExporting}
          className="btn btn-secondary" 
          style={{ gap: 8, opacity: isExporting ? 0.7 : 1 }}
        >
          {isExporting ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <span>⬇️</span>}
          {isExporting ? 'Processando...' : 'Exportar Lista Completa'}
        </button>
      </div>

      {/* DASHBOARD CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Total de Leads</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{totalLeads}</div>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Leads Presentes na Sala</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#10b981' }}>{totalAttended}</div>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Taxa de Comparecimento</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: rate > 40 ? '#10b981' : (rate > 20 ? '#f59e0b' : '#ef4444') }}>{rate}%</div>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Leads Quentes</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f97316' }}>{hotLeadsCount}</div>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Clicaram no CTA</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#60a5fa' }}>{ctaLeadsCount}</div>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Tempo Medio</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#a78bfa' }}>{avgWatchMinutes}min</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        
        {/* FILTERS BAR */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, flex: '1 1 520px', minWidth: 0 }}>
            <input 
              type="text" 
              placeholder="Buscar por nome, e-mail ou telefone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ flex: '1 1 240px', minWidth: 220 }}
            />
            <select 
              className="form-input form-select" 
              value={statusFilter} 
              onChange={e => { setStatusFilter(e.target.value as 'all' | 'attended' | 'absent'); setPage(1) }}
              style={{ cursor: 'pointer', flex: '0 1 190px' }}
            >
              <option value="all">Todos os Status</option>
              <option value="attended">Presentes na sala</option>
              <option value="absent">Ausentes</option>
            </select>
            <select
              className="form-input form-select"
              value={engagementFilter}
              onChange={e => { setEngagementFilter(e.target.value as EngagementFilter); setPage(1) }}
              style={{ cursor: 'pointer', flex: '0 1 220px' }}
            >
              <option value="all">Todos os engajamentos</option>
              <option value="hot">Lead quente</option>
              <option value="clicked">Clicou no CTA</option>
              <option value="watched50">Assistiu 30min+</option>
              <option value="chat">Interagiu no chat</option>
            </select>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minWidth: 240 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Página {page} de {totalPages}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '8px 12px' }} 
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button 
                 className="btn btn-secondary" 
                 style={{ padding: '8px 12px' }} 
                 disabled={page >= totalPages}
                 onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
        
        {/* LIST */}
        <div style={{ position: 'relative', minHeight: 200 }}>
          {loadingList && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(5,5,8,0.5)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <div className="spinner" />
            </div>
          )}

          {leads.length === 0 && !loadingList ? (
            <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p>Nenhum lead encontrado com estes filtros.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>NOME & UTM</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>EMAIL</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>TELEFONE</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>ENGAJAMENTO</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>STATUS</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>DATA REGISTRO</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>ACOES</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => {
                    const hasUtms = lead.metadata?.utm_source || lead.metadata?.utm_campaign
                    const engagement = engagementByEmail[leadEmailKey(lead.email)]
                    const whatsappUrl = getWhatsAppUrl(lead.phone)
                    return (
                      <tr key={lead.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>
                            {lead.name || <span style={{ color: 'var(--text-muted)' }}>Anônimo</span>}
                          </div>
                          {hasUtms && (
                            <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                              {lead.metadata?.utm_source && <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, color: '#A1A1AA' }}>{lead.metadata.utm_source}</span>}
                              {lead.metadata?.utm_campaign && <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, color: '#A1A1AA' }}>{lead.metadata.utm_campaign}</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#A1A1AA' }}>
                          {lead.email}
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#A1A1AA' }}>
                          {lead.phone || '-'}
                        </td>
                        <td style={{ padding: '14px 20px', minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{
                              width: 42,
                              height: 42,
                              borderRadius: 8,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              color: '#fff',
                              background: (engagement?.score || 0) >= 70
                                ? 'rgba(249, 115, 22, 0.22)'
                                : (engagement?.score || 0) >= 40
                                  ? 'rgba(245, 158, 11, 0.18)'
                                  : 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--border)',
                            }}>
                              {engagement?.score || 0}
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>
                                {formatWatchTime(engagement?.watchTime || 0)} assistidos
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                CTA {engagement?.clickedCta ? 'sim' : 'nao'} | Chat {engagement?.chatMessages || 0}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(engagement?.tags.length ? engagement.tags : ['Sem sessao']).map(tag => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: 11,
                                  color: tag === 'Lead quente' ? '#fed7aa' : '#A1A1AA',
                                  background: tag === 'Lead quente' ? 'rgba(249, 115, 22, 0.16)' : 'rgba(255,255,255,0.06)',
                                  padding: '3px 7px',
                                  borderRadius: 999,
                                  border: '1px solid var(--border)',
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          {lead.attended ? (
                            <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Presente</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>Ausente</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
                          {new Date(lead.registered_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <a
                              href={`mailto:${lead.email}`}
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}
                            >
                              Email
                            </a>
                            {whatsappUrl && (
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}
                              >
                                WhatsApp
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
