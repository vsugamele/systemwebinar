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
  const [webinarName, setWebinarName] = useState('')
  const [summary, setSummary] = useState<AnalyticsSummary>({ totalLeads: 0, totalAttended: 0, ctaClicks: 0, peakViewers: 0, conversionRate: 0 })
  const [retentionData, setRetentionData] = useState<ViewersByMinute[]>([])
  const [peakMinute, setPeakMinute] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      // Webinar name
      const { data: webinar } = await supabase.from('webi_webinars').select('name').eq('id', wid).single()
      if (webinar) setWebinarName(webinar.name)

      // Use the aggregated analytics API + leads count in parallel
      const [apiRes, leadsRes, attendeesRes] = await Promise.all([
        fetch(`/api/analytics?webinar_id=${wid}`).then(r => r.json()),
        supabase.from('webi_leads').select('*', { count: 'exact', head: true }).eq('webinar_id', wid),
        supabase.from('webi_leads').select('*', { count: 'exact', head: true }).eq('webinar_id', wid).eq('attended', true),
      ])

      const viewersByMinute: ViewersByMinute[] = apiRes.viewers_by_minute || []
      const ctaClicks = apiRes.cta_clicks || 0
      const totalLeads = leadsRes.count || 0
      const totalAttended = attendeesRes.count || 0

      // Fill blank minutes for smooth curve and find peak/dropoff
      const maxMin = viewersByMinute.length > 0 ? viewersByMinute[viewersByMinute.length - 1].minute : 0
      const filled: ViewersByMinute[] = []
      let peak = 0
      let peakMin = 0
      let prevViewers = 0
      for (let i = 0; i <= maxMin; i++) {
        const point = viewersByMinute.find(v => v.minute === i)
        const v = point ? point.viewers : 0
        if (v > peak) { peak = v; peakMin = i }
        const dropoff = (i > 0 && prevViewers > v) ? prevViewers - v : 0
        filled.push({ minute: i, viewers: v, dropoff })
        prevViewers = v
      }

      const conversionRate = totalAttended > 0 ? (ctaClicks / totalAttended) * 100 : 0

      setSummary({ totalLeads, totalAttended, ctaClicks, peakViewers: peak, conversionRate })
      setRetentionData(filled)
      if (peak > 0) setPeakMinute(peakMin)
      setLoading(false)
    }
    load()
  }, [wid])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const metricCards = [
    { label: 'Total de Leads', value: summary.totalLeads, icon: '👤', color: 'var(--text-primary)' },
    { label: 'Espectadores (Show Up)', value: summary.totalAttended, icon: '👁', color: 'var(--text-primary)' },
    { label: 'Pico Instantâneo', value: summary.peakViewers, icon: '📈', color: '#a78bfa' },
    { label: 'Cliques no Pitch', value: summary.ctaClicks, icon: '🛒', color: '#10b981', highlight: true },
    {
      label: 'Taxa de Conversão',
      value: `${summary.conversionRate.toFixed(1)}%`,
      icon: '🎯',
      color: summary.conversionRate >= 5 ? '#10b981' : summary.conversionRate >= 2 ? '#f59e0b' : '#ef4444',
      highlight: true,
    },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">📊 Analytics</h1>
          <p className="page-subtitle">Retenção, conversão e métricas profundas do seu evento</p>
        </div>
      </div>

      {/* Metric Cards — auto-fit so they wrap cleanly on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        {metricCards.map(card => (
          <div
            key={card.label}
            className="card"
            style={{
              padding: 24,
              display: 'flex', flexDirection: 'column', gap: 8,
              border: card.highlight ? `1px solid ${card.color}44` : undefined,
            }}
          >
            <div style={{ fontSize: 20 }}>{card.icon}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{card.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Retention Curve */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📉 Curva de Retenção (Atenção por Minuto)</div>
          {peakMinute !== null && (
            <div style={{ fontSize: 12, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 8, padding: '4px 12px' }}>
              Pico no minuto {peakMinute}
            </div>
          )}
        </div>
        {retentionData.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 12, color: 'var(--text-muted)', fontSize: 14 }}>
            <div style={{ fontSize: 40 }}>📭</div>
            <div>Dados aparecerão após o primeiro espectador assistir ao vídeo</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>O tracker coleta dados a cada 10–30s de reprodução</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={retentionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorViewers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="minute" stroke="#6b7280" fontSize={12} tickFormatter={tick => `${tick}m`} />
              <YAxis yAxisId="left" stroke="#6b7280" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={12} hide />
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <Tooltip
                contentStyle={{ background: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: 8, color: '#fff' }}
                labelFormatter={label => `Minuto ${label}`}
                formatter={(value: any, name: string) => {
                  if (name === 'viewers') return [value, 'Espectadores']
                  if (name === 'dropoff') return [value, 'Saíram neste minuto']
                  return [value, name]
                }}
              />
              {peakMinute !== null && (
                <ReferenceLine
                  yAxisId="left"
                  x={peakMinute}
                  stroke="#a78bfa"
                  strokeDasharray="4 4"
                  label={{ value: '🔝 Pico', fill: '#a78bfa', fontSize: 11, position: 'top' }}
                />
              )}
              <Bar yAxisId="right" dataKey="dropoff" fill="#ef4444" barSize={10} opacity={0.6} radius={[4,4,0,0]} />
              <Area yAxisId="left" type="monotone" dataKey="viewers" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorViewers)" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
