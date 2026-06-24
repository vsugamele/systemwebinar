'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'

export default function ExportsPage() {
  return (
    <Suspense fallback={<div className="loading-screen"><div className="spinner" /></div>}>
      <ExportsPageContent />
    </Suspense>
  )
}

function ExportsPageContent() {
  const { id: projectId, wid } = useParams() as { id: string; wid: string }
  const searchParams = useSearchParams()
  const runParam = searchParams.get('run_id')
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [webinarName, setWebinarName] = useState('')
  const [runs, setRuns] = useState<any[]>([])
  const [selectedRunId, setSelectedRunId] = useState('consolidated')
  const [counts, setCounts] = useState({ leads: 0, chat: 0, realChat: 0 })
  const [exporting, setExporting] = useState<string | null>(null)

  // 1. Pre-select run if parameter is in the URL
  useEffect(() => {
    if (runParam) {
      setSelectedRunId(runParam)
    }
  }, [runParam])

  // 2. Load webinar metadata & runs once
  useEffect(() => {
    async function loadMeta() {
      // Fetch Webinar name
      const { data: w } = await supabase.from('webi_webinars').select('name').eq('id', wid).single()
      if (w) setWebinarName(w.name)

      // Fetch Webinar runs
      const { data: runsList } = await supabase
        .from('webi_webinar_runs')
        .select('id, title, started_at, ended_at, status')
        .eq('webinar_id', wid)
        .order('started_at', { ascending: false })
      if (runsList) setRuns(runsList)
    }
    loadMeta()
  }, [wid, supabase])

  // 3. Load counts dynamically when selectedRunId changes
  useEffect(() => {
    async function loadCounts() {
      // Fetch count of leads
      let leadsQuery = supabase
        .from('webi_leads')
        .select('id', { count: 'exact', head: true })
        .eq('webinar_id', wid)

      if (selectedRunId !== 'consolidated') {
        const run = runs.find(r => r.id === selectedRunId)
        if (run) {
          leadsQuery = leadsQuery.gte('registered_at', run.started_at)
          const runEnded = run.ended_at || new Date().toISOString()
          leadsQuery = leadsQuery.lte('registered_at', runEnded)
        }
      }
      const { count: leadsCount } = await leadsQuery

      // Fetch count of chat timeline triggers (always webinar-wide)
      const { count: chatCount } = await supabase
        .from('webi_events')
        .select('id', { count: 'exact', head: true })
        .eq('webinar_id', wid)
        .eq('type', 'chat_message')

      // Fetch count of real chat messages
      let realChatQuery = supabase
        .from('webi_live_chat')
        .select('id', { count: 'exact', head: true })
        .eq('webinar_id', wid)
        .eq('is_simulated', false)

      if (selectedRunId !== 'consolidated') {
        realChatQuery = realChatQuery.eq('run_id', selectedRunId)
      }
      const { count: realChatCount } = await realChatQuery

      setCounts({
        leads: leadsCount || 0,
        chat: chatCount || 0,
        realChat: realChatCount || 0,
      })
      setLoading(false)
    }

    if (webinarName) {
      loadCounts()
    }
  }, [wid, selectedRunId, runs, webinarName, supabase])

  // Helper to trigger browser download
  function downloadBlob(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 1. Export CRM Leads
  async function exportLeads() {
    setExporting('leads')
    try {
      let query = supabase
        .from('webi_leads')
        .select('name, email, phone, watched_seconds, status, created_at, utm_source, utm_medium, utm_campaign')
        .eq('webinar_id', wid)

      if (selectedRunId !== 'consolidated') {
        const run = runs.find(r => r.id === selectedRunId)
        if (run) {
          query = query.gte('registered_at', run.started_at)
          const runEnded = run.ended_at || new Date().toISOString()
          query = query.lte('registered_at', runEnded)
        }
      }

      const { data: leads, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      if (!leads || leads.length === 0) {
        toast.error('Nenhum lead encontrado para exportar nesta sessão.')
        return
      }

      // Build CSV
      const headers = ['Nome', 'E-mail', 'Telefone', 'Tempo Assistido (seg)', 'Status', 'Data Cadastro', 'UTM Source', 'UTM Medium', 'UTM Campaign']
      const rows = leads.map(l => [
        `"${(l.name || '').replace(/"/g, '""')}"`,
        `"${(l.email || '').replace(/"/g, '""')}"`,
        `"${(l.phone || '').replace(/"/g, '""')}"`,
        l.watched_seconds || 0,
        `"${l.status || 'registered'}"`,
        `"${new Date(l.created_at).toLocaleString('pt-BR')}"`,
        `"${l.utm_source || ''}"`,
        `"${l.utm_medium || ''}"`,
        `"${l.utm_campaign || ''}"`
      ])

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      const runSuffix = selectedRunId === 'consolidated' ? 'consolidado' : `sessao-${selectedRunId.slice(0, 8)}`
      downloadBlob(csvContent, `leads-${webinarName.replace(/\s+/g, '-')}-${runSuffix}-${Date.now()}.csv`, 'text/csv;charset=utf-8;')
      toast.success('Leads exportados com sucesso!')
    } catch (e: any) {
      toast.error(`Erro ao exportar leads: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  // 2. Export Chat Timeline (Triggers)
  async function exportChatTimeline() {
    setExporting('chat')
    try {
      const { data: events, error } = await supabase
        .from('webi_events')
        .select('timestamp_seconds, payload')
        .eq('webinar_id', wid)
        .eq('type', 'chat_message')
        .order('timestamp_seconds', { ascending: true })

      if (error) throw error
      if (!events || events.length === 0) {
        toast.error('Nenhuma mensagem de chat timeline encontrada para exportar.')
        return
      }

      // Build CSV
      const headers = ['Segundo Exibicao', 'Minuto Exibicao', 'Nome do Autor', 'Mensagem']
      const rows = events.map(e => {
        const payload = (e.payload as any) || {}
        const displayMin = Math.floor(e.timestamp_seconds / 60)
        const displaySec = e.timestamp_seconds % 60
        return [
          e.timestamp_seconds,
          `"${displayMin}:${displaySec.toString().padStart(2, '0')}"`,
          `"${(payload.name || '').replace(/"/g, '""')}"`,
          `"${(payload.text || '').replace(/"/g, '""')}"`
        ]
      })

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      downloadBlob(csvContent, `chat-timeline-${webinarName.replace(/\s+/g, '-')}-${Date.now()}.csv`, 'text/csv;charset=utf-8;')
      toast.success('Mensagens exportadas com sucesso!')
    } catch (e: any) {
      toast.error(`Erro ao exportar chat: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  // 3. Export Retention Metrics
  async function exportMetrics() {
    setExporting('metrics')
    try {
      let query = supabase
        .from('webi_retention_buckets')
        .select('bucket_start_seconds, count')
        .eq('webinar_id', wid)

      if (selectedRunId !== 'consolidated') {
        query = query.eq('run_id', selectedRunId)
      }

      const { data: buckets, error } = await query.order('bucket_start_seconds', { ascending: true })

      if (error) throw error
      if (!buckets || buckets.length === 0) {
        toast.error('Sem dados de retenção suficientes para exportar nesta sessão.')
        return
      }

      // Build CSV
      const headers = ['Segundo Inicial', 'Minuto Equivalente', 'Visualizacoes']
      const rows = buckets.map(b => {
        const displayMin = Math.floor(b.bucket_start_seconds / 60)
        const displaySec = b.bucket_start_seconds % 60
        return [
          b.bucket_start_seconds,
          `"${displayMin}:${displaySec.toString().padStart(2, '0')}"`,
          b.count
        ]
      })

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      const runSuffix = selectedRunId === 'consolidated' ? 'consolidado' : `sessao-${selectedRunId.slice(0, 8)}`
      downloadBlob(csvContent, `retencao-${webinarName.replace(/\s+/g, '-')}-${runSuffix}-${Date.now()}.csv`, 'text/csv;charset=utf-8;')
      toast.success('Métricas de retenção exportadas!')
    } catch (e: any) {
      toast.error(`Erro ao exportar métricas: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  // 4. Export Real Chat Messages
  async function exportRealChat() {
    setExporting('realChat')
    try {
      let query = supabase
        .from('webi_live_chat')
        .select('created_at, timestamp_video, author, text')
        .eq('webinar_id', wid)
        .eq('is_simulated', false)

      if (selectedRunId !== 'consolidated') {
        query = query.eq('run_id', selectedRunId)
      }

      const { data: messages, error } = await query.order('created_at', { ascending: true })

      if (error) throw error
      if (!messages || messages.length === 0) {
        toast.error('Nenhuma mensagem de chat real encontrada nesta sessão.')
        return
      }

      // Build CSV
      const headers = ['Data Envio (Real)', 'Tempo do Vídeo (Minuto)', 'Autor', 'Mensagem']
      const rows = messages.map(msg => {
        const displayMin = Math.floor(msg.timestamp_video / 60)
        const displaySec = msg.timestamp_video % 60
        return [
          `"${new Date(msg.created_at).toLocaleString('pt-BR')}"`,
          `"${displayMin}:${displaySec.toString().padStart(2, '0')}"`,
          `"${(msg.author || '').replace(/"/g, '""')}"`,
          `"${(msg.text || '').replace(/"/g, '""')}"`
        ]
      })

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      const runSuffix = selectedRunId === 'consolidated' ? 'consolidado' : `sessao-${selectedRunId.slice(0, 8)}`
      downloadBlob(csvContent, `chat-real-${webinarName.replace(/\s+/g, '-')}-${runSuffix}-${Date.now()}.csv`, 'text/csv;charset=utf-8;')
      toast.success('Mensagens reais exportadas com sucesso!')
    } catch (e: any) {
      toast.error(`Erro ao exportar chat real: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 24px' }}>
      <Toaster position="top-right" />

      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link>
            {' / '}{webinarName}
          </div>
          <h1 className="page-title">📥 Central de Exportações</h1>
          <p className="page-subtitle">Baixe planilhas CSV consolidadas com dados de inscritos, histórico e retenção do webinar.</p>
        </div>
      </div>

      {/* Session selector */}
      <div style={{ 
        background: 'var(--bg-card)', 
        border: '1px solid var(--border)', 
        borderRadius: 16, 
        padding: '20px 24px', 
        marginBottom: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            📊 Filtrar Exportações por Sessão
          </label>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Selecione uma execução específica do webinar para exportar apenas Leads, Retenção ou Chat Real daquela data.
          </p>
        </div>
        <select
          value={selectedRunId}
          onChange={(e) => setSelectedRunId(e.target.value)}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 13,
            padding: '10px 16px',
            borderRadius: 8,
            outline: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            minWidth: 280
          }}
        >
          <option value="consolidated">⚡ Todas as Sessões (Consolidado)</option>
          {runs.map(run => {
            const dateStr = new Date(run.started_at).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })
            const title = run.title ? `${run.title} (${dateStr})` : `Sessão de ${dateStr}`
            const statusLabel = run.status === 'active' ? '🔴 Ao Vivo' : '🟢 Finalizada'
            return (
              <option key={run.id} value={run.id}>
                {title} — {statusLabel}
              </option>
            )
          })}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        
        {/* EXPORT CARD: LEADS */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 32 }}>📇</div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px 0' }}>Leads & Engajamento</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, minHeight: 36 }}>
              Dados dos inscritos com telefone, e-mail, tempo assistido e tags UTM.
            </p>
          </div>
          <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 6, margin: '4px 0' }}>
            Registrados: <b>{counts.leads}</b>
          </div>
          <button
            className="btn btn-primary"
            onClick={exportLeads}
            disabled={exporting !== null}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {exporting === 'leads' ? '⏳ Exportando...' : '📥 Baixar CSV'}
          </button>
        </div>

        {/* EXPORT CARD: CHAT REAL */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 32 }}>💬</div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px 0' }}>Chat Real (Mensagens)</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, minHeight: 36 }}>
              Mensagens enviadas por espectadores reais no chat durante a sessão.
            </p>
          </div>
          <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 6, margin: '4px 0' }}>
            Mensagens reais: <b>{counts.realChat}</b>
          </div>
          <button
            className="btn btn-primary"
            onClick={exportRealChat}
            disabled={exporting !== null}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {exporting === 'realChat' ? '⏳ Exportando...' : '📥 Baixar CSV'}
          </button>
        </div>

        {/* EXPORT CARD: CHAT TIMELINE (TRIGGERS) */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 32 }}>🤖</div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px 0' }}>Chat Timeline (Gatilhos)</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, minHeight: 36 }}>
              Script completo de mensagens programadas que alimentam a sala.
            </p>
          </div>
          <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 6, margin: '4px 0' }}>
            Mensagens: <b>{counts.chat}</b>
          </div>
          <button
            className="btn btn-primary"
            onClick={exportChatTimeline}
            disabled={exporting !== null}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {exporting === 'chat' ? '⏳ Exportando...' : '📥 Baixar CSV'}
          </button>
        </div>

        {/* EXPORT CARD: RETENTION METRICS */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 32 }}>📊</div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px 0' }}>Métricas de Retenção</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, minHeight: 36 }}>
              Curva de audiência minuto a minuto para análise avançada em planilhas externas.
            </p>
          </div>
          <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 6, margin: '4px 0' }}>
            Granularidade: <b>Buckets de 5s</b>
          </div>
          <button
            className="btn btn-primary"
            onClick={exportMetrics}
            disabled={exporting !== null}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {exporting === 'metrics' ? '⏳ Exportando...' : '📥 Baixar CSV'}
          </button>
        </div>

      </div>
    </div>
  )
}
