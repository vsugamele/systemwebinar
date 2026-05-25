'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface AnalyticsSummary {
  totalLeads: number
  totalAttended: number
  ctaClicks: number
  peakViewers: number
  conversionRate: number
  joined: number
  progress50: number
  chatMessagesCount: number
  chatUniqueSenders: number
  quizResponsesCount: number
  quizAvgScore: number
  utmSourceBreakdown: Record<string, { count: number; attended: number }>
  pitchPerformance: Record<string, { clicks: number; text?: string }>
  topChatters: { author: string; messages: number }[]
  clicksByMinute: { minute: number; clicks: number }[]
}

interface ViewersByMinute {
  minute: number
  viewers: number
  dropoff?: number
}

export default function AnalyticsPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'all' | 'live'>('all')
  const [isLiveActive, setIsLiveActive] = useState(false)
  const [webinarName, setWebinarName] = useState('')
  const [summary, setSummary] = useState<AnalyticsSummary>({
    totalLeads: 0,
    totalAttended: 0,
    ctaClicks: 0,
    peakViewers: 0,
    conversionRate: 0,
    joined: 0,
    progress50: 0,
    chatMessagesCount: 0,
    chatUniqueSenders: 0,
    quizResponsesCount: 0,
    quizAvgScore: 0,
    utmSourceBreakdown: {},
    pitchPerformance: {},
    topChatters: [],
    clicksByMinute: []
  })
  const [retentionData, setRetentionData] = useState<ViewersByMinute[]>([])
  const [peakMinute, setPeakMinute] = useState<number | null>(null)
  const [maxDropoffMinute, setMaxDropoffMinute] = useState<{ minute: number, dropoff: number } | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      // Webinar name
      const { data: webinar } = await supabase.from('webi_webinars').select('name').eq('id', wid).single()
      if (webinar) setWebinarName(webinar.name)

      // Use the enriched aggregated analytics API
      const apiRes = await fetch(`/api/analytics?webinar_id=${wid}&mode=${mode}`).then(r => r.json())

      setIsLiveActive(!!apiRes.is_live_active)

      const durationSeconds = apiRes.duration_seconds || 3600
      let durationMinutes = Math.ceil(durationSeconds / 60)
      if (durationMinutes <= 0) {
        const dataMaxMin = (apiRes.viewers_by_minute || []).length > 0
          ? apiRes.viewers_by_minute[apiRes.viewers_by_minute.length - 1].minute
          : 0
        durationMinutes = dataMaxMin > 0 ? dataMaxMin : 60
      }

      // Filter events to exclude test noise / prolonged session events beyond configured duration
      const rawViewers: ViewersByMinute[] = apiRes.viewers_by_minute || []
      const viewersByMinute = rawViewers.filter(v => v.minute <= durationMinutes)

      const rawClicks: { minute: number; clicks: number }[] = apiRes.clicks_by_minute || []
      const filteredClicks = rawClicks.filter(c => c.minute <= durationMinutes)

      const ctaClicks = apiRes.cta_clicks || 0
      const totalLeads = apiRes.total_leads || 0
      const totalAttended = apiRes.total_attended || 0

      // Fill blank minutes for smooth curve and find peak/dropoff up to durationMinutes
      const filled: ViewersByMinute[] = []
      let peak = 0
      let peakMin = 0
      let prevViewers = 0
      let maxDrop = 0
      let maxDropMin = 0
      for (let i = 0; i <= durationMinutes; i++) {
        const point = viewersByMinute.find(v => v.minute === i)
        const v = point ? point.viewers : 0
        if (v > peak) { peak = v; peakMin = i }
        const dropoff = (i > 0 && prevViewers > v) ? prevViewers - v : 0
        if (dropoff > maxDrop) { maxDrop = dropoff; maxDropMin = i }
        filled.push({ minute: i, viewers: v, dropoff })
        prevViewers = v
      }

      // Conversion rate relative to those who actually entered the room (better cohort)
      const joinedCount = apiRes.joined || 0
      const conversionRate = joinedCount > 0 ? (ctaClicks / joinedCount) * 100 : 0

      setSummary({
        totalLeads,
        totalAttended,
        ctaClicks,
        peakViewers: peak,
        conversionRate,
        joined: joinedCount,
        progress50: apiRes.progress_50 || 0,
        chatMessagesCount: apiRes.chat_messages_count || 0,
        chatUniqueSenders: apiRes.chat_unique_senders || 0,
        quizResponsesCount: apiRes.quiz_responses_count || 0,
        quizAvgScore: apiRes.quiz_avg_score || 0,
        utmSourceBreakdown: apiRes.utm_source_breakdown || {},
        pitchPerformance: apiRes.pitch_performance || {},
        topChatters: apiRes.top_chatters || [],
        clicksByMinute: filteredClicks
      })
      
      // Merge clicks with retention data for unified chart
      const mergedRetention = filled.map(f => {
        const c = filteredClicks.find((ck: any) => ck.minute === f.minute)
        return { ...f, clicks: c ? c.clicks : 0 }
      })

      setRetentionData(mergedRetention)
      if (peak > 0) setPeakMinute(peakMin)
      else setPeakMinute(null)
      if (maxDrop > 0) setMaxDropoffMinute({ minute: maxDropMin, dropoff: maxDrop })
      else setMaxDropoffMinute(null)
      setLoading(false)
    }
    load()
  }, [wid, mode])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const metricCards = [
    { label: 'Total de Leads', value: summary.totalLeads, icon: '👤', color: 'var(--text-primary)' },
    { label: 'Compareceram (Show Up)', value: summary.totalAttended, icon: '👁', color: 'var(--text-primary)' },
    { label: 'Pico Simultâneo', value: summary.peakViewers, icon: '📈', color: '#a78bfa' },
    { label: 'Cliques no Pitch', value: summary.ctaClicks, icon: '🛒', color: '#f97316', highlight: true },
    {
      label: 'Conversão (Cliques/Entraram)',
      value: `${summary.conversionRate.toFixed(1)}%`,
      icon: '🎯',
      color: summary.conversionRate >= 10 ? '#10b981' : summary.conversionRate >= 3 ? '#f97316' : '#ef4444',
      highlight: true,
    },
  ]

  // Funnel calculations
  const funnelStages = [
    { name: '1. Cadastro', count: summary.totalLeads, pct: 100, color: '#3b82f6', subtitle: 'Registrados' },
    { name: '2. Presença', count: summary.joined, pct: summary.totalLeads > 0 ? Math.round((summary.joined / summary.totalLeads) * 100) : 0, color: '#10b981', subtitle: 'Entraram na Sala' },
    { name: '3. Retenção (50%+)', count: summary.progress50, pct: summary.joined > 0 ? Math.round((summary.progress50 / summary.joined) * 100) : 0, color: '#8b5cf6', subtitle: 'Assistiram metade' },
    { name: '4. Cliques', count: summary.ctaClicks, pct: summary.joined > 0 ? Math.round((summary.ctaClicks / summary.joined) * 100) : 0, color: '#f97316', subtitle: 'Clicaram no CTA' }
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">📊 Analytics</h1>
          <p className="page-subtitle">Métricas avançadas de retenção, conversão e engajamento</p>
        </div>
      </div>

      {/* Tab Selector: Geral vs Live */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-card)',
        padding: '6px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        marginBottom: 24,
        gap: 12,
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setMode('all')}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 10,
              border: 'none',
              background: mode === 'all' ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: mode === 'all' ? 'var(--brand-light)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span>📊</span> Histórico Geral (Acumulado)
          </button>
          <button
            onClick={() => setMode('live')}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 10,
              border: 'none',
              background: mode === 'live' ? 'rgba(34,197,94,0.12)' : 'transparent',
              color: mode === 'live' ? '#22c55e' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isLiveActive ? '#22c55e' : 'var(--text-muted)',
              boxShadow: isLiveActive ? '0 0 6px #22c55e' : 'none',
              animation: isLiveActive ? 'pulseActive 1.5s infinite' : 'none'
            }} />
            <span>🎬</span> Sessão ao Vivo (Live Atual)
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 12 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: isLiveActive ? '#22c55e' : 'var(--text-muted)',
            background: isLiveActive ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
            padding: '4px 10px',
            borderRadius: 20,
            border: isLiveActive ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)'
          }}>
            {isLiveActive ? '🔴 LIVE TRANSMITINDO' : '⚪ FORA DO AR'}
          </span>
        </div>
      </div>

      {/* Warning banner when Live Mode is selected but there is no active session */}
      {mode === 'live' && !isLiveActive && (
        <div style={{
          background: 'rgba(234,179,8,0.05)',
          border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
          color: '#eab308',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <strong>Nenhuma live ativa no momento.</strong> Para visualizar as métricas isoladas da transmissão, inicie a sessão no painel 
            <Link href={`/admin/projects/${id}/webinars/${wid}/live`} style={{ color: '#facc15', textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>
              Controle de Live 🎬
            </Link>. Exibindo dados acumulados como fallback.
          </div>
        </div>
      )}

      {/* Pulsing animation stylesheet */}
      <style>{`
        @keyframes pulseActive {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {metricCards.map(card => (
          <div
            key={card.label}
            className="card"
            style={{
              padding: 20,
              display: 'flex', flexDirection: 'column', gap: 8,
              border: card.highlight ? `1px solid ${card.color}44` : undefined,
              background: card.highlight ? 'rgba(255,255,255,0.01)' : 'var(--bg-card)'
            }}
          >
            <div style={{ fontSize: 20 }}>{card.icon}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{card.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Visual Funnel Section */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⏳ Funil de Performance</span>
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16
        }}>
          {funnelStages.map((stage, idx) => (
            <div key={stage.name} style={{
              background: 'var(--bg-elevated)',
              borderRadius: 12,
              padding: 16,
              position: 'relative',
              borderLeft: `4px solid ${stage.color}`
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{stage.name}</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>
                {stage.count} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>leads</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  <div style={{ width: `${stage.pct}%`, height: '100%', borderRadius: 3, background: stage.color }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: stage.color }}>{stage.pct}%</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{stage.subtitle}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart and Sub-Engagement Grid */}
      <div className="analytics-chart-grid" style={{ gap: 24, marginBottom: 24 }}>
        
        {/* Retention Curve */}
        <div className="card" style={{ padding: 24 }}>
          {/* Chart Header & Warnings */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>📉 Mapa de Atenção e Conversão</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {peakMinute !== null && (
                  <div style={{ fontSize: 12, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 8, padding: '4px 12px' }}>
                    📈 Pico no minuto {peakMinute}
                  </div>
                )}
                {maxDropoffMinute !== null && (
                  <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚠️ Ponto Cego:</span>
                    <span>Maior fuga no minuto {maxDropoffMinute.minute} ({maxDropoffMinute.dropoff} pessoas saíram)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {retentionData.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 12, color: 'var(--text-muted)', fontSize: 14 }}>
              <div style={{ fontSize: 40 }}>📭</div>
              <div>Dados aparecerão após o primeiro espectador assistir ao vídeo</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>O tracker coleta dados a cada 10–30s de reprodução</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={retentionData} margin={{ top: 15, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorViewers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.45}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fb923c" stopOpacity={0.95}/>
                    <stop offset="95%" stopColor="#fb923c" stopOpacity={0.3}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="minute" 
                  stroke="#4b5563" 
                  fontSize={11} 
                  fontWeight={500}
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                  tickFormatter={tick => `${tick}m`} 
                />
                <YAxis 
                  yAxisId="left" 
                  stroke="#4b5563" 
                  fontSize={11} 
                  fontWeight={500}
                  tickLine={false} 
                  axisLine={false} 
                  dx={-5}
                />
                <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={11} hide />
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const viewers = payload.find(p => p.name === 'viewers')?.value || 0
                      const dropoff = payload.find(p => p.name === 'dropoff')?.value || 0
                      const clicks = payload.find(p => p.name === 'clicks')?.value || 0
                      return (
                        <div style={{
                          background: 'rgba(17, 24, 39, 0.95)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          padding: '12px 16px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                          color: '#fff',
                          fontSize: 12
                        }}>
                          <div style={{ fontWeight: 700, marginBottom: 8, color: '#f3f4f6', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: 6 }}>
                            ⏱️ Minuto {label}m
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#818cf8' }} />
                              <span style={{ color: '#9ca3af' }}>Espectadores:</span>
                              <strong style={{ color: '#f3f4f6', marginLeft: 'auto' }}>{viewers}</strong>
                            </div>
                            {Number(dropoff) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                                <span style={{ color: '#9ca3af' }}>Saídas:</span>
                                <strong style={{ color: '#f87171', marginLeft: 'auto' }}>{dropoff}</strong>
                              </div>
                            )}
                            {Number(clicks) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb923c' }} />
                                <span style={{ color: '#9ca3af' }}>Cliques no CTA:</span>
                                <strong style={{ color: '#fb923c', marginLeft: 'auto' }}>{clicks}</strong>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                {peakMinute !== null && (
                  <ReferenceLine
                    yAxisId="left"
                    x={peakMinute}
                    stroke="#a78bfa"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    label={{ 
                      value: '🔝 Pico', 
                      fill: '#a78bfa', 
                      fontSize: 10, 
                      fontWeight: 700,
                      position: 'top',
                      offset: 10
                    }}
                  />
                )}
                {maxDropoffMinute !== null && (
                  <ReferenceLine
                    yAxisId="left"
                    x={maxDropoffMinute.minute}
                    stroke="#f87171"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    label={{ 
                      value: '⚠️ Fuga', 
                      fill: '#f87171', 
                      fontSize: 10, 
                      fontWeight: 700,
                      position: 'insideTopLeft',
                      offset: 10
                    }}
                  />
                )}
                <Bar yAxisId="right" dataKey="dropoff" fill="#f87171" barSize={8} opacity={0.4} radius={[4,4,0,0]} />
                <Bar yAxisId="right" dataKey="clicks" fill="url(#colorClicks)" barSize={12} radius={[4,4,0,0]} />
                <Area yAxisId="left" type="monotone" dataKey="viewers" stroke="#818cf8" strokeWidth={3.5} fillOpacity={1} fill="url(#colorViewers)" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        
        {/* Interaction & Engagement Blocks */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>💬 Engajamento do Chat</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Total de Mensagens</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#6366f1' }}>{summary.chatMessagesCount}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Reais (não simuladas)</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Usuários Ativos</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#3b82f6' }}>{summary.chatUniqueSenders}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Enviaram no mínimo 1 msg</div>
            </div>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            🔥 Hot Leads <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>(Top Comentaristas)</span>
          </h3>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, overflow: 'hidden' }}>
            {summary.topChatters.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                Nenhum lead comentou ainda.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {summary.topChatters.map((chatter, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{chatter.author}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#6366f1' }}>{chatter.messages} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>msgs</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>📝 Performance do Quiz</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Respostas Enviadas</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#10b981' }}>{summary.quizResponsesCount}</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Pontuação Média</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#eab308' }}>{summary.quizAvgScore}%</div>
            </div>
          </div>
        </div>

        {/* Traffic Source Segmentation (UTMs) */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🔗 Origem do Tráfego (UTMs)</h3>
          {Object.keys(summary.utmSourceBreakdown).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
              Nenhum lead com parâmetros de rastreamento (UTM) registrado ainda.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 0', color: 'var(--text-muted)' }}>Campanha (utm_source)</th>
                    <th style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Leads</th>
                    <th style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Presença</th>
                    <th style={{ padding: '8px 0', textAlign: 'right', color: 'var(--text-muted)' }}>Show Up %</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.utmSourceBreakdown)
                    .sort(([, a], [, b]) => b.count - a.count)
                    .map(([source, data]) => {
                      const showUpPct = data.count > 0 ? (data.attended / data.count) * 100 : 0
                      return (
                        <tr key={source} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '10px 0', fontWeight: 600, color: 'var(--text-primary)' }}>{source}</td>
                          <td style={{ padding: '10px 0', textAlign: 'center' }}>{data.count}</td>
                          <td style={{ padding: '10px 0', textAlign: 'center', color: '#10b981' }}>{data.attended}</td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: showUpPct >= 40 ? '#10b981' : showUpPct >= 20 ? '#eab308' : '#ef4444' }}>
                            {showUpPct.toFixed(0)}%
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pitch Button A/B Test */}
        <div className="card" style={{ padding: 24, gridColumn: '1 / -1' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🛒 Performance do Botão de Oferta (Teste A/B)</h3>
          {Object.keys(summary.pitchPerformance).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
              Nenhum clique no botão de oferta registrado ainda.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {Object.entries(summary.pitchPerformance)
                .sort(([, a], [, b]) => b.clicks - a.clicks)
                .map(([image, data], index) => {
                  const isTop = index === 0;
                  return (
                    <div key={image} style={{
                      background: 'var(--bg-elevated)',
                      borderRadius: 12,
                      padding: 16,
                      border: isTop ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border)',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}>
                      {isTop && (
                        <div style={{ position: 'absolute', top: -10, right: 16, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 10 }}>
                          🏆 VENCEDOR
                        </div>
                      )}
                      
                      {image !== 'sem-imagem' ? (
                        <div style={{ width: '100%', height: 120, borderRadius: 8, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img src={image} alt="Pitch CTA" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </div>
                      ) : (
                        <div style={{ width: '100%', height: 120, borderRadius: 8, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                          (Apenas texto, sem imagem)
                        </div>
                      )}
                      
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#f97316' }}>{data.clicks}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Cliques Gerados</div>
                      </div>

                      {data.text && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', fontStyle: 'italic', background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: 6 }}>
                          "{data.text}"
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
