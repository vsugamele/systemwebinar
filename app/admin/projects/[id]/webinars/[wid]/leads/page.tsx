'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Lead } from '@/types'

const PAGE_SIZE = 50

export default function LeadsPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [webinarName, setWebinarName] = useState('')
  
  // Dashboard stats
  const [totalLeads, setTotalLeads] = useState(0)
  const [totalAttended, setTotalAttended] = useState(0)

  // List State
  const [leads, setLeads] = useState<Lead[]>([])
  
  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'attended' | 'absent'>('all')
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

      // Pagination
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      query = query.order('registered_at', { ascending: false }).range(from, to)

      const { data, count } = await query
      
      if (data) setLeads(data as unknown as Lead[])
      if (count !== null) {
        setTotalPages(Math.ceil(count / PAGE_SIZE) || 1)
      }
      setLoadingList(false)
    }
    
    if (!loading) { // only after initial load
      fetchLeads()
    }
  }, [wid, supabase, page, statusFilter, debouncedSearch, loading])

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

      const headers = ['ID', 'Nome', 'Email', 'WhatsApp / Telefone', 'Compareceu na Sala', 'Data de Registro', 'UTM Source', 'UTM Medium', 'UTM Campaign']
      const csvRows = [headers.join(',')]

      for (const lead of data as unknown as Lead[]) {
        const meta = lead.metadata || {}
        const row = [
          lead.id,
          `"${lead.name?.replace(/"/g, '""') || ''}"`,
          lead.email,
          `"${lead.phone || ''}"`,
          lead.attended ? 'SIM' : 'NAO',
          new Date(lead.registered_at).toLocaleString(),
          `"${meta.utm_source || ''}"`,
          `"${meta.utm_medium || ''}"`,
          `"${meta.utm_campaign || ''}"`,
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
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        
        {/* FILTERS BAR */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 300 }}>
            <input 
              type="text" 
              placeholder="Buscar por nome, e-mail ou telefone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
              style={{ flex: 1, maxWidth: 300 }}
            />
            <select 
              className="input" 
              value={statusFilter} 
              onChange={e => { setStatusFilter(e.target.value as any); setPage(1) }}
              style={{ maxWidth: 180, cursor: 'pointer' }}
            >
              <option value="all">Todos os Status</option>
              <option value="attended">Presentes na sala</option>
              <option value="absent">Ausentes</option>
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
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>STATUS</th>
                    <th style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>DATA REGISTRO</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => {
                    const hasUtms = lead.metadata?.utm_source || lead.metadata?.utm_campaign
                    return (
                      <tr key={lead.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.02)' } } as any}>
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
