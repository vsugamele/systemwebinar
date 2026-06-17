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
  events?: SessionEventDetail[]
  os?: string
  browser?: string
  sessionId?: string
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

const formatVideoPosition = (seconds = 0) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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

  // New UX/CX states
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [videoDuration, setVideoDuration] = useState(3600)
  const [utmSourceFilter, setUtmSourceFilter] = useState('')
  const [customTagFilter, setCustomTagFilter] = useState('all')
  const [watchPercentFilter, setWatchPercentFilter] = useState('all')
  const [selectedLeadForTimeline, setSelectedLeadForTimeline] = useState<Lead | null>(null)
  const [tagInputOpen, setTagInputOpen] = useState(false)
  const [newBulkTag, setNewBulkTag] = useState('')
  const [updatingTags, setUpdatingTags] = useState(false)

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
        if (data.duration_seconds) {
          setVideoDuration(data.duration_seconds)
        }
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
              events: session.events,
              os: session.os,
              browser: session.browser,
              sessionId: session.session_id,
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

      const needsClientFilter = engagementFilter !== 'all' || watchPercentFilter !== 'all' || customTagFilter !== 'all' || utmSourceFilter.trim() !== ''
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      query = query.order('registered_at', { ascending: false })

      if (needsClientFilter) {
        const { data } = await query.limit(5000)
        const filteredLeads = ((data || []) as unknown as Lead[]).filter(lead => {
          const email = leadEmailKey(lead.email)
          const engagement = engagementByEmail[email]
          const meta = lead.metadata || {}

          // 1. Engagement filter
          if (engagementFilter === 'hot') {
            if ((engagement?.score || 0) < 70) return false
          } else if (engagementFilter === 'clicked') {
            if (!engagement?.clickedCta) return false
          } else if (engagementFilter === 'watched50') {
            if ((engagement?.watchTime || 0) < 30 * 60) return false
          } else if (engagementFilter === 'chat') {
            if ((engagement?.chatMessages || 0) === 0) return false
          }

          // 2. Watch Percent filter
          if (watchPercentFilter !== 'all') {
            const pct = videoDuration > 0 && engagement ? Math.round((engagement.watchTime / videoDuration) * 100) : 0
            if (watchPercentFilter === '75' && pct < 75) return false
            if (watchPercentFilter === '50' && (pct < 50 || pct >= 75)) return false
            if (watchPercentFilter === '25' && (pct < 25 || pct >= 50)) return false
            if (watchPercentFilter === '0' && pct > 0) return false
          }

          // 3. Custom Tag filter
          if (customTagFilter !== 'all') {
            const leadTags = meta.tags || []
            if (!leadTags.includes(customTagFilter)) return false
          }

          // 4. UTM Source filter
          if (utmSourceFilter.trim()) {
            const utm = (meta.utm_source || '').toLowerCase()
            if (!utm.includes(utmSourceFilter.trim().toLowerCase())) return false
          }

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
  }, [wid, supabase, page, statusFilter, engagementFilter, debouncedSearch, loading, engagementByEmail, watchPercentFilter, customTagFilter, utmSourceFilter, videoDuration])

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

  const availableTags = useMemo(() => {
    const tagsSet = new Set<string>()
    leads.forEach(l => {
      const list = l.metadata?.tags || []
      list.forEach((t: string) => tagsSet.add(t))
    })
    return Array.from(tagsSet)
  }, [leads])

  const handleExportSelectedCSV = () => {
    const selectedLeads = leads.filter(l => selectedLeadIds.includes(l.id))
    if (selectedLeads.length === 0) return

    const headers = [
      'ID', 'Nome', 'Email', 'WhatsApp / Telefone', 'Compareceu na Sala', 'Data de Registro',
      'UTM Source', 'UTM Medium', 'UTM Campaign', 'Score', 'Tags', 'Tempo Assistido',
      'Clicou CTA', 'Mensagens no Chat', 'Dispositivo', 'Pais'
    ]
    const csvRows = [headers.join(',')]

    for (const lead of selectedLeads) {
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
        csvCell([...(engagement?.tags || []), ...(meta.tags || [])].join(' | ')),
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
    link.setAttribute('download', `leads_selecionados_webinar_${wid}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleEmailSelected = () => {
    const selectedEmails = leads
      .filter(l => selectedLeadIds.includes(l.id))
      .map(l => l.email)
      .join(',')
    if (selectedEmails) {
      window.open(`mailto:${selectedEmails}`)
    }
  }

  async function addTagsInBulk() {
    if (!newBulkTag.trim()) return
    setUpdatingTags(true)
    const tagToAdd = newBulkTag.trim()

    try {
      const promises = leads
        .filter(l => selectedLeadIds.includes(l.id))
        .map(async (lead) => {
          const currentMeta = lead.metadata || {}
          const currentTags = currentMeta.tags || []
          if (currentTags.includes(tagToAdd)) return

          const newMeta = {
            ...currentMeta,
            tags: [...currentTags, tagToAdd]
          }

          const { error } = await supabase
            .from('webi_leads')
            .update({ metadata: newMeta })
            .eq('id', lead.id)
          
          if (!error) {
            setLeads(prev => prev.map(item => item.id === lead.id ? { ...item, metadata: newMeta } : item))
          }
        })
      
      await Promise.all(promises)
      setNewBulkTag('')
      setTagInputOpen(false)
      setSelectedLeadIds([])
    } catch (err) {
      console.error(err)
    } finally {
      setUpdatingTags(false)
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Buscar por nome, e-mail ou telefone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ flex: '1 1 280px', minWidth: 220 }}
            />
            <select 
              className="form-input form-select" 
              value={statusFilter} 
              onChange={e => { setStatusFilter(e.target.value as 'all' | 'attended' | 'absent'); setPage(1) }}
              style={{ cursor: 'pointer', flex: '0 1 180px' }}
            >
              <option value="all">Todos os Status</option>
              <option value="attended">Presentes na sala</option>
              <option value="absent">Ausentes</option>
            </select>
            <select
              className="form-input form-select"
              value={engagementFilter}
              onChange={e => { setEngagementFilter(e.target.value as EngagementFilter); setPage(1) }}
              style={{ cursor: 'pointer', flex: '0 1 180px' }}
            >
              <option value="all">Todos os engajamentos</option>
              <option value="hot">Lead quente</option>
              <option value="clicked">Clicou no CTA</option>
              <option value="watched50">Assistiu 30min+</option>
              <option value="chat">Interagiu no chat</option>
            </select>
            <select
              className="form-input form-select"
              value={watchPercentFilter}
              onChange={e => { setWatchPercentFilter(e.target.value); setPage(1) }}
              style={{ cursor: 'pointer', flex: '0 1 180px' }}
            >
              <option value="all">Todo tempo assistido</option>
              <option value="75">Assistiu 75%+</option>
              <option value="50">Assistiu 50% - 74%</option>
              <option value="25">Assistiu 25% - 49%</option>
              <option value="0">Não assistiu (0%)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Filtrar por UTM Source..." 
                value={utmSourceFilter}
                onChange={(e) => { setUtmSourceFilter(e.target.value); setPage(1) }}
                className="form-input"
                style={{ width: 200 }}
              />
              <select
                className="form-input form-select"
                value={customTagFilter}
                onChange={e => { setCustomTagFilter(e.target.value); setPage(1) }}
                style={{ cursor: 'pointer', width: 200 }}
              >
                <option value="all">Todas as tags salvas</option>
                {availableTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                    <th style={{ padding: '12px 20px', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={leads.length > 0 && leads.every(l => selectedLeadIds.includes(l.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const ids = leads.map(l => l.id)
                            setSelectedLeadIds(prev => Array.from(new Set([...prev, ...ids])))
                          } else {
                            const ids = leads.map(l => l.id)
                            setSelectedLeadIds(prev => prev.filter(id => !ids.includes(id)))
                          }
                        }}
                      />
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>NOME & UTM</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>EMAIL</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>TELEFONE</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>COMPORTAMENTO (ENGAJAMENTO)</th>
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
                    const watchPct = videoDuration > 0 && engagement ? Math.round((engagement.watchTime / videoDuration) * 100) : 0
                    const barColor = watchPct >= 70 ? '#10b981' : watchPct >= 35 ? '#fb923c' : '#ef4444'
                    const customTags = lead.metadata?.tags || []

                    return (
                      <tr key={lead.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '14px 20px', width: 40 }}>
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(lead.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLeadIds(prev => [...prev, lead.id])
                              } else {
                                setSelectedLeadIds(prev => prev.filter(id => id !== lead.id))
                              }
                            }}
                          />
                        </td>
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
                        <td style={{ padding: '14px 20px', minWidth: 240 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{
                              width: 38,
                              height: 38,
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
                              flexShrink: 0,
                            }}>
                              {engagement?.score || 0}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fff', fontWeight: 700, marginBottom: 2 }}>
                                <span>{watchPct}% assistidos</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatWatchTime(engagement?.watchTime || 0)}</span>
                              </div>
                              <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, watchPct)}%`, height: '100%', background: barColor, borderRadius: 99 }} />
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(engagement?.tags.length ? engagement.tags : ['Sem sessao']).map(tag => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: 10,
                                  color: tag === 'Lead quente' ? '#fed7aa' : '#A1A1AA',
                                  background: tag === 'Lead quente' ? 'rgba(249, 115, 22, 0.16)' : 'rgba(255,255,255,0.05)',
                                  padding: '2px 6px',
                                  borderRadius: 8,
                                  border: '1px solid rgba(255,255,255,0.03)',
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                            {customTags.map((tag: string) => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: 10,
                                  color: '#a78bfa',
                                  background: 'rgba(167,139,250,0.12)',
                                  padding: '2px 6px',
                                  borderRadius: 8,
                                  border: '1px solid rgba(167,139,250,0.2)',
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
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setSelectedLeadForTimeline(lead)}
                              disabled={!engagement}
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: 12 }}
                            >
                              Timeline
                            </button>
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

      {/* Floating Bulk Actions Bar */}
      {selectedLeadIds.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 70,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(30, 27, 75, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          borderRadius: 16,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 20px rgba(99, 102, 241, 0.15)',
          zIndex: 50,
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: 16 }}>
            👥 {selectedLeadIds.length} lead{selectedLeadIds.length > 1 ? 's' : ''} selecionado{selectedLeadIds.length > 1 ? 's' : ''}
          </span>
          
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={handleEmailSelected}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12, padding: '8px 14px' }}
            >
              ✉️ E-mail em Massa
            </button>
            <button
              onClick={handleExportSelectedCSV}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12, padding: '8px 14px' }}
            >
              📥 Exportar CSV
            </button>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                onClick={() => setTagInputOpen(!tagInputOpen)}
                className="btn btn-primary btn-sm"
                style={{ fontSize: 12, padding: '8px 14px' }}
              >
                🏷️ Adicionar Tag
              </button>
              {tagInputOpen && (
                <div style={{
                  position: 'absolute', bottom: '100%', right: 0, marginBottom: 10,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 14, width: 220,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Nome da Tag</span>
                  <input
                    type="text"
                    placeholder="Ex: Quente, Suporte..."
                    className="form-input form-input-sm"
                    value={newBulkTag}
                    onChange={e => setNewBulkTag(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTagsInBulk() }}
                    disabled={updatingTags}
                  />
                  <button
                    onClick={addTagsInBulk}
                    disabled={updatingTags}
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {updatingTags ? 'Salvando...' : 'Aplicar'}
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedLeadIds([])}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', marginLeft: 8 }}
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {/* Lead Timeline Modal */}
      {selectedLeadForTimeline && (() => {
        const email = leadEmailKey(selectedLeadForTimeline.email)
        const engagement = engagementByEmail[email]
        const events = engagement?.events || []
        
        // Sort events chronologically
        const sortedEvents = [...events].sort((a, b) => {
          const timeA = new Date(a.created_at).getTime()
          const timeB = new Date(b.created_at).getTime()
          return timeA - timeB
        })

        const translateEventType = (type: string) => {
          switch (type) {
            case 'page_view': return { label: 'Acessou a Sala', icon: '👁️', color: '#60a5fa' }
            case 'play': return { label: 'Iniciou o Vídeo (Play)', icon: '▶️', color: '#22c55e' }
            case 'pause': return { label: 'Pausou o Vídeo', icon: '⏸️', color: '#f59e0b' }
            case 'seek': return { label: 'Avançou/Retrocedeu o Vídeo', icon: '⏩', color: '#818cf8' }
            case 'chat_sent': return { label: 'Enviou Mensagem no Chat', icon: '💬', color: '#c084fc' }
            case 'cta_click': return { label: 'Clicou na Oferta (CTA)', icon: '🛒', color: '#fb923c' }
            case 'offer_seen': return { label: 'Visualizou Oferta', icon: '💰', color: '#34d399' }
            case 'quiz_response': return { label: 'Respondeu Quiz', icon: '📝', color: '#facc15' }
            default: return { label: type, icon: '⚡', color: '#A1A1AA' }
          }
        }

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(5, 5, 8, 0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            zIndex: 100,
          }} onClick={() => setSelectedLeadForTimeline(null)}>
            
            <div style={{
              width: '100%', maxWidth: 460, height: '100%',
              background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.6)',
              animation: 'slideLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }} onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#fff' }}>🕵️ Timeline de Comportamento</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Histórico detalhado do lead na sala</span>
                </div>
                <button
                  onClick={() => setSelectedLeadForTimeline(null)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ✕
                </button>
              </div>

              {/* Lead Summary Panel */}
              <div style={{ padding: '20px 28px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {selectedLeadForTimeline.name || 'Anônimo'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {selectedLeadForTimeline.email}
                </div>
                {engagement && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Assistido:</span> <strong style={{ color: '#10b981' }}>{formatWatchTime(engagement.watchTime)}</strong>
                    </div>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Score:</span> <strong style={{ color: '#fb923c' }}>{engagement.score}/100</strong>
                    </div>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Dispositivo:</span> <strong>{engagement.device} ({engagement.os})</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline Events Scroll */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
                {sortedEvents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    Sem eventos registrados para este lead nesta sessão.
                  </div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: 20, borderLeft: '2px solid rgba(255,255,255,0.06)' }}>
                    {sortedEvents.map((ev, index) => {
                      const details = translateEventType(ev.type)
                      const timeStr = new Date(ev.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      return (
                        <div key={index} style={{ position: 'relative', marginBottom: 24 }}>
                          {/* Timeline dot */}
                          <div style={{
                            position: 'absolute', left: -27, top: 2, width: 12, height: 12, borderRadius: '50%',
                            background: details.color, border: '2px solid var(--bg-card)',
                            boxShadow: `0 0 6px ${details.color}40`,
                          }} />
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                            <strong style={{ fontSize: 13, color: '#fff' }}>{details.label}</strong>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{timeStr}</span>
                          </div>
                          
                          {ev.timestamp !== null && ev.timestamp !== undefined && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4 }}>
                              Posição do vídeo: {formatVideoPosition(ev.timestamp)}
                            </div>
                          )}

                          {ev.details && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)', wordBreak: 'break-all' }}>
                              {ev.details}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      <style>{`
        @keyframes slideUp {
          from { transform: translate(-50%, 40px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
