'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
  BarChart, LabelList, Line,
} from 'recharts'
import { getMetricDelta } from '@/lib/analytics-metrics.mjs'

// ─── Types ───────────────────────────────────────────────────────────────────

type SegTab = 'retention' | 'countries' | 'devices' | 'os' | 'browsers' | 'utm' | 'leads' | 'comparison'
type AnalyticsMode = 'all' | 'live' | 'replay' | 'evergreen'

interface ComparisonDelta {
  label: string
  current: number
  previous: number
  absolute: number
  pct: number | null
}

interface WebinarRun {
  id: string
  title: string | null
  status: 'active' | 'ended' | 'cancelled'
  started_at: string
  ended_at: string | null
}

interface SelectedRunMeta {
  id: string
  started_at: string
  ended_at: string | null
  status: string
}

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

interface AnalyticsSummary {
  totalLeads: number
  totalAttended: number
  ctaClicks: number
  popupSeen: number
  pageViews: number
  uniquePageViews: number
  plays: number
  uniquePlays: number
  playRate: number
  peakViewers: number
  averageEngagementPct: number
  conversionRate: number
  joined: number
  progress25: number
  progress50: number
  progress75: number
  progress90: number
  chatMessagesCount: number
  chatUniqueSenders: number
  quizResponsesCount: number
  quizAvgScore: number
  retentionAtPitch: number
  audienceAtPitch: number
  pitchAtMinute: number | null
  utmSourceBreakdown: Record<string, { count: number; attended: number }>
  pitchPerformance: Record<string, { clicks: number; text?: string }>
  topChatters: { author: string; messages: number }[]
  clicksByMinute: { minute: number; clicks: number }[]
  chatByMinute: { minute: number; messages: number }[]
  sessions: SessionDetail[]
  devicesBreakdown: Record<string, number>
  browsersBreakdown: Record<string, number>
  osBreakdown: Record<string, number>
  countriesBreakdown: Record<string, number>
}

interface RetentionPoint {
  minute: number
  time_seconds: number
  viewers: number
  retention_pct: number
  dropoff?: number
  clicks?: number
  chatMessages?: number
  compare_retention_pct?: number
  compare_viewers?: number
  retention_delta?: number
}

interface FunnelLabelProps {
  x?: number | string | null
  y?: number | string | null
  width?: number | string | null
  value?: number | string | null
  index?: number
}

type AnalyticsApiMetricMap = Record<string, number | string | null | undefined>
type IntervalMessagePoint = { time_seconds: number; messages: number }
type IntervalClickPoint = { time_seconds: number; clicks: number }
type CriticalDropoff = {
  time_seconds: number
  previous_viewers: number
  viewers: number
  dropoff: number
  dropoff_pct: number
  retention_pct: number
  clicks: number
  chatMessages: number
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, color = 'var(--text-primary)', highlight = false, tooltip,
}: {
  icon: string; label: string; value: string | number; sub?: string
  color?: string; highlight?: boolean; tooltip?: string
}) {
  return (
    <div
      title={tooltip}
      style={{
        background: highlight ? `linear-gradient(135deg, ${color}08, ${color}04)` : 'var(--bg-card)',
        border: `1px solid ${highlight ? color + '30' : 'var(--border)'}`,
        borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6,
        cursor: tooltip ? 'help' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18 }}>{icon}</div>
        {tooltip && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5 }}>ℹ️</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

function SegmentTable({
  data, label, total,
}: { data: Record<string, number>; label: string; total: number }) {
  const sorted = Object.entries(data).sort(([, a], [, b]) => b - a)
  const max = sorted[0]?.[1] || 1
  const COLORS = ['#818cf8', '#34d399', '#fb923c', '#f472b6', '#60a5fa', '#a78bfa', '#facc15']
  return (
    <div style={{ overflowX: 'auto' }}>
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 13 }}>
          Dados insuficientes — estes dados serão coletados nas próximas sessões.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 0', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Sessões</th>
              <th style={{ padding: '8px 0', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>% Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([name, count], i) => {
              const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
              const barPct = (count / max) * 100
              const color = COLORS[i % COLORS.length]
              return (
                <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '10px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden', minWidth: 60 }}>
                        <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                      </div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 80 }}>{name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color }}>{count}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', color: 'var(--text-muted)' }}>{pct}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<AnalyticsMode>('all')
  const [isLiveActive, setIsLiveActive] = useState(false)
  const [webinarName, setWebinarName] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(3600)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [campaign, setCampaign] = useState('')
  const [runs, setRuns] = useState<WebinarRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState('all')
  const [selectedRunMeta, setSelectedRunMeta] = useState<SelectedRunMeta | null>(null)
  const [sessionQualityScore, setSessionQualityScore] = useState<number | null>(null)
  const [compareRunId, setCompareRunId] = useState('')
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareDateFrom, setCompareDateFrom] = useState('')
  const [compareDateTo, setCompareDateTo] = useState('')
  const [compareCampaign, setCompareCampaign] = useState('')
  const [comparison, setComparison] = useState<ComparisonDelta[]>([])
  const [activeTab, setActiveTab] = useState<SegTab>('retention')
  const [peakMinute, setPeakMinute] = useState<number | null>(null)
  const [maxDropoffMinute, setMaxDropoffMinute] = useState<{ minute: number; dropoff: number } | null>(null)
  const [retentionData, setRetentionData] = useState<RetentionPoint[]>([])
  const [criticalDropoffs, setCriticalDropoffs] = useState<CriticalDropoff[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null)
  const [leadFilter, setLeadFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all')

  const [summary, setSummary] = useState<AnalyticsSummary>({
    totalLeads: 0, totalAttended: 0, ctaClicks: 0,
    popupSeen: 0, pageViews: 0, uniquePageViews: 0, plays: 0, uniquePlays: 0, playRate: 0,
    peakViewers: 0, averageEngagementPct: 0,
    conversionRate: 0, joined: 0, progress25: 0, progress50: 0, progress75: 0, progress90: 0, chatMessagesCount: 0,
    chatUniqueSenders: 0, quizResponsesCount: 0, quizAvgScore: 0,
    retentionAtPitch: 0, audienceAtPitch: 0, pitchAtMinute: null,
    utmSourceBreakdown: {}, pitchPerformance: {},
    topChatters: [], clicksByMinute: [], chatByMinute: [], sessions: [],
    devicesBreakdown: {}, browsersBreakdown: {}, osBreakdown: {}, countriesBreakdown: {},
  })

  const buildAnalyticsUrl = useCallback((range?: { from?: string; to?: string; campaign?: string; runId?: string }) => {
    const params = new URLSearchParams({
      webinar_id: wid,
      session_mode: mode,
      bucket_seconds: '5',
    })
    const runValue = range?.runId ?? selectedRunId
    if (runValue && runValue !== 'all') params.set('run_id', runValue)
    const from = range?.from ?? dateFrom
    const to = range?.to ?? dateTo
    if (from) params.set('date_from', from)
    if (to) params.set('date_to', to)
    const campaignValue = range?.campaign ?? campaign
    if (campaignValue.trim()) params.set('campaign', campaignValue.trim())
    return `/api/analytics?${params.toString()}`
  }, [wid, mode, selectedRunId, dateFrom, dateTo, campaign])

  const buildComparison = useCallback((current: AnalyticsApiMetricMap, previous: AnalyticsApiMetricMap): ComparisonDelta[] => {
    return [
      { key: 'unique_page_views', label: 'Views unicas' },
      { key: 'unique_plays', label: 'Plays unicos' },
      { key: 'play_rate', label: 'Play rate' },
      { key: 'retention_at_pitch', label: 'Retencao pitch' },
      { key: 'cta_clicks', label: 'Cliques CTA' },
      { key: 'average_engagement_pct', label: 'Engajamento' },
    ].map(metric => {
      const currentValue = Number(current?.[metric.key]) || 0
      const previousValue = Number(previous?.[metric.key]) || 0
      const delta = getMetricDelta(currentValue, previousValue)
      return {
        label: metric.label,
        current: currentValue,
        previous: previousValue,
        absolute: delta.absolute,
        pct: delta.pct,
      }
    })
  }, [])

  const buildFilledRetention = useCallback((
    apiRes: any,
    durationForCurve: number,
    bucketSeconds: number,
    includeActivity: boolean,
  ) => {
    const rawViewers: RetentionPoint[] = (apiRes.viewers_by_interval || []).map((point: RetentionPoint) => ({
      ...point,
      minute: Math.floor((point.time_seconds || 0) / 60),
    }))
    const viewersByInterval = rawViewers.filter(v => v.time_seconds <= durationForCurve)
    const rawClicks: IntervalClickPoint[] = apiRes.clicks_by_interval || []
    const filteredClicks = rawClicks.filter(c => c.time_seconds <= durationForCurve)
    const chatByInterval: IntervalMessagePoint[] = apiRes.chat_by_interval || []

    const filled: RetentionPoint[] = []
    let peakSecond = 0
    let peakPct = 0
    let maxDrop = 0
    let maxDropSecond = 0
    const dropoffs: CriticalDropoff[] = []
    let prevViewers = 0

    for (let second = 0; second <= durationForCurve; second += bucketSeconds) {
      const point = viewersByInterval.find(v => v.time_seconds === second)
      const viewers = point?.viewers || 0
      const pct = point?.retention_pct || 0
      if (pct > peakPct) {
        peakPct = pct
        peakSecond = second
      }

      const dropoff = second > 0 && prevViewers > viewers ? prevViewers - viewers : 0
      if (dropoff > maxDrop) {
        maxDrop = dropoff
        maxDropSecond = second
      }

      const clicks = includeActivity ? filteredClicks.find(ck => ck.time_seconds === second)?.clicks || 0 : 0
      const chatMessages = includeActivity ? chatByInterval.find(chat => chat.time_seconds === second)?.messages || 0 : 0
      if (dropoff > 0 && prevViewers > 0) {
        dropoffs.push({
          time_seconds: second,
          previous_viewers: prevViewers,
          viewers,
          dropoff,
          dropoff_pct: Math.round((dropoff / prevViewers) * 100),
          retention_pct: pct,
          clicks,
          chatMessages,
        })
      }

      filled.push({
        minute: Math.floor(second / 60),
        time_seconds: second,
        viewers,
        retention_pct: pct,
        dropoff,
        clicks,
        chatMessages,
      })
      prevViewers = viewers
    }

    return {
      data: filled,
      peakSecond: peakPct > 0 ? peakSecond : null,
      maxDropoff: maxDrop > 0 ? { minute: maxDropSecond, dropoff: maxDrop } : null,
      criticalDropoffs: dropoffs
        .sort((a, b) => b.dropoff - a.dropoff || b.dropoff_pct - a.dropoff_pct)
        .slice(0, 5),
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: webinar } = await supabase.from('webi_webinars').select('name').eq('id', wid).single()
    if (webinar) setWebinarName(webinar.name)
    const runsRes = await fetch(`/api/webinar-runs?webinar_id=${wid}`).then(r => r.json()).catch(() => ({ runs: [] }))
    const loadedRuns = (runsRes.runs || []) as WebinarRun[]
    setRuns(loadedRuns)

    const apiRes = await fetch(buildAnalyticsUrl()).then(r => r.json())
    // Capturar metadados da run selecionada (vindos da API)
    setSelectedRunMeta(apiRes.selected_run ?? null)
    setSessionQualityScore(apiRes.session_quality_score ?? null)
    let compareRes: any = null
    const currentRunIndex = loadedRuns.findIndex(run => run.id === selectedRunId)
    const fallbackPreviousRunId = selectedRunId !== 'all' && currentRunIndex >= 0
      ? loadedRuns[currentRunIndex + 1]?.id
      : ''
    const comparisonRunId = compareRunId || fallbackPreviousRunId

    if (compareEnabled && selectedRunId !== 'all' && comparisonRunId) {
      compareRes = await fetch(buildAnalyticsUrl({ runId: comparisonRunId })).then(r => r.json())
      setComparison(buildComparison(apiRes, compareRes))
    } else if (compareEnabled && ((compareDateFrom && compareDateTo) || compareCampaign.trim())) {
      compareRes = await fetch(buildAnalyticsUrl({
        from: compareDateFrom,
        to: compareDateTo,
        campaign: compareCampaign.trim() || campaign,
        runId: 'all',
      })).then(r => r.json())
      setComparison(buildComparison(apiRes, compareRes))
    } else {
      setComparison([])
    }
    setIsLiveActive(!!apiRes.is_live_active)

    const durationSecondsVal = apiRes.duration_seconds || 3600
    setDurationSeconds(durationSecondsVal)
    const bucketSeconds = Number(apiRes.retention_bucket_seconds) || 5
    let durationForCurve = durationSecondsVal
    const rawViewers: RetentionPoint[] = (apiRes.viewers_by_interval || []).map((point: RetentionPoint) => ({
      ...point,
      minute: Math.floor((point.time_seconds || 0) / 60),
    }))
    if (durationForCurve <= 0) {
      const dataMaxSeconds = rawViewers.length > 0 ? rawViewers[rawViewers.length - 1].time_seconds : 3600
      durationForCurve = dataMaxSeconds > 0 ? dataMaxSeconds : 3600
    }

    const ctaClicks = apiRes.cta_clicks || 0
    const totalLeads = apiRes.total_leads || 0
    const totalAttended = apiRes.total_attended || 0
    const joinedCount = apiRes.joined || 0

    const currentRetention = buildFilledRetention(apiRes, durationForCurve, bucketSeconds, true)
    let filled = currentRetention.data
    if (compareRes) {
      const compareRetention = buildFilledRetention(compareRes, durationForCurve, bucketSeconds, false)
      const compareBySecond = new Map(compareRetention.data.map(point => [point.time_seconds, point]))
      filled = filled.map(point => {
        const comparePoint = compareBySecond.get(point.time_seconds)
        const comparePct = comparePoint?.retention_pct
        return {
          ...point,
          compare_retention_pct: comparePct,
          compare_viewers: comparePoint?.viewers,
          retention_delta: typeof comparePct === 'number' ? point.retention_pct - comparePct : undefined,
        }
      })
    }

    setRetentionData(filled)
    setPeakMinute(currentRetention.peakSecond)
    setMaxDropoffMinute(currentRetention.maxDropoff)
    setCriticalDropoffs(currentRetention.criticalDropoffs)

    setSummary({
      totalLeads, totalAttended, ctaClicks,
      popupSeen: apiRes.popup_seen || 0,
      pageViews: apiRes.page_views || 0,
      uniquePageViews: apiRes.unique_page_views || 0,
      plays: apiRes.plays || 0,
      uniquePlays: apiRes.unique_plays || 0,
      playRate: apiRes.play_rate || 0,
      peakViewers: apiRes.peak_viewers || 0,
      averageEngagementPct: apiRes.average_engagement_pct || 0,
      conversionRate: joinedCount > 0 ? (ctaClicks / joinedCount) * 100 : 0,
      joined: joinedCount,
      progress25: apiRes.progress_25 || 0,
      progress50: apiRes.progress_50 || 0,
      progress75: apiRes.progress_75 || 0,
      progress90: apiRes.progress_90 || 0,
      chatMessagesCount: apiRes.chat_messages_count || 0,
      chatUniqueSenders: apiRes.chat_unique_senders || 0,
      quizResponsesCount: apiRes.quiz_responses_count || 0,
      quizAvgScore: apiRes.quiz_avg_score || 0,
      retentionAtPitch: apiRes.retention_at_pitch || 0,
      audienceAtPitch: apiRes.audience_at_pitch || 0,
      pitchAtMinute: apiRes.pitch_at_minute ?? null,
      utmSourceBreakdown: apiRes.utm_source_breakdown || {},
      pitchPerformance: apiRes.pitch_performance || {},
      topChatters: apiRes.top_chatters || [],
      clicksByMinute: apiRes.clicks_by_minute || [],
      chatByMinute: apiRes.chat_by_minute || [],
      sessions: apiRes.sessions || [],
      devicesBreakdown: apiRes.devices_breakdown || {},
      browsersBreakdown: apiRes.browsers_breakdown || {},
      osBreakdown: apiRes.os_breakdown || {},
      countriesBreakdown: apiRes.countries_breakdown || {},
    })
    setLoading(false)
  }, [wid, buildAnalyticsUrl, buildComparison, buildFilledRetention, compareEnabled, selectedRunId, compareRunId, compareDateFrom, compareDateTo, compareCampaign, campaign, supabase])

  useEffect(() => { load() }, [load])

  const [compareRunsData, setCompareRunsData] = useState<any[]>([])
  const [compareRunsList, setCompareRunsList] = useState<WebinarRun[]>([])
  const [loadingCompare, setLoadingCompare] = useState(false)

  useEffect(() => {
    if (activeTab !== 'comparison' || runs.length === 0) return

    async function loadCompareCurves() {
      setLoadingCompare(true)
      const targets = runs.filter(r => r.status === 'ended').slice(0, 5)
      setCompareRunsList(targets)
      
      try {
        const fetchPromises = targets.map(run =>
          fetch(`/api/analytics?webinar_id=${wid}&run_id=${run.id}&bucket_seconds=10`)
            .then(r => r.json())
            .then(data => ({
              runId: run.id,
              title: run.title || new Date(run.started_at).toLocaleDateString('pt-BR'),
              viewers: data.viewers_by_interval || []
            }))
        )
        const results = await Promise.all(fetchPromises)

        // Find the maximum duration across all curves
        let maxSeconds = 0
        results.forEach(res => {
          res.viewers.forEach((pt: any) => {
            if (pt.time_seconds > maxSeconds) maxSeconds = pt.time_seconds
          })
        })

        // Merge by 10s intervals
        const merged: any[] = []
        for (let sec = 0; sec <= maxSeconds; sec += 10) {
          const point: any = { time_seconds: sec }
          results.forEach(res => {
            const found = res.viewers.find((pt: any) => pt.time_seconds === sec)
            point[res.title] = found ? found.retention_pct : undefined
          })
          merged.push(point)
        }
        setCompareRunsData(merged)
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingCompare(false)
      }
    }

    loadCompareCurves()
  }, [activeTab, runs, wid])

  const attendanceRate = summary.totalLeads > 0
    ? ((summary.joined / summary.totalLeads) * 100).toFixed(1) : '0.0'

  const presentAtPitch = summary.audienceAtPitch || Math.round(summary.joined * (summary.retentionAtPitch / 100))
  const funnelBase = summary.uniquePageViews || summary.joined || summary.uniquePlays
  const playFunnelPct = funnelBase > 0 ? Math.round((summary.uniquePlays / funnelBase) * 100) : 0
  const pitchFunnelPct = funnelBase > 0 ? Math.round((presentAtPitch / funnelBase) * 100) : 0
  const offerClickPct = funnelBase > 0 ? Math.round((summary.ctaClicks / funnelBase) * 100) : 0
  const watchHalfPct = summary.uniquePlays > 0 ? Math.round((summary.progress50 / summary.uniquePlays) * 100) : 0
  const retentionHasData = retentionData.length > 0 && retentionData.some(d => d.viewers > 0)
  const formatRunLabel = (run: WebinarRun) => {
    const date = new Date(run.started_at).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${run.status === 'active' ? 'Ao vivo - ' : ''}${run.title || date}`
  }

  const showupPct = summary.totalLeads > 0 ? Math.round((summary.joined / summary.totalLeads) * 100) : 0
  const pitchPct = summary.retentionAtPitch
  const clickPct = summary.joined > 0 ? Math.round((summary.ctaClicks / summary.joined) * 100) : 0

  const vturbFunnelData = [
    { name: 'Leads Cadastrados', pct: summary.totalLeads > 0 ? 100 : 0, count: summary.totalLeads, color: '#3b82f6' },
    { name: 'Entraram na Sala (Show-up)', pct: showupPct, count: summary.joined, color: '#22c55e' },
    { name: 'Presentes no Pitch (Retenção)', pct: pitchPct, count: presentAtPitch, color: '#f59e0b' },
    { name: 'Clicaram na Oferta', pct: clickPct, count: summary.ctaClicks, color: '#f97316' },
  ]

  const keyMetrics = [
    { label: 'Play Rate', value: `${summary.playRate}%`, sub: `${summary.uniquePlays} plays unicos / ${summary.uniquePageViews} views`, color: '#f0f0ff' },
    { label: 'Retencao ao Pitch', value: summary.retentionAtPitch > 0 ? `${summary.retentionAtPitch}%` : '--', sub: summary.pitchAtMinute !== null ? `minuto ${summary.pitchAtMinute} - ${presentAtPitch} presentes` : 'pitch nao configurado', color: '#22c55e' },
    { label: 'Taxa de Clique', value: `${offerClickPct}%`, sub: `${summary.ctaClicks} cliques / ${funnelBase} views`, color: '#f97316' },
    { label: 'Engajamento Medio', value: `${summary.averageEngagementPct}%`, sub: 'tempo medio assistido', color: '#818cf8' },
    { label: 'Assistiram 50%+', value: `${watchHalfPct}%`, sub: `${summary.progress50} pessoas passaram da metade`, color: '#a78bfa' },
    { label: 'Chat', value: summary.chatMessagesCount.toLocaleString(), sub: `${summary.chatUniqueSenders} participantes unicos`, color: '#38bdf8' },
  ]

  const funnelData = [
    { name: '1. Visualizações Únicas', pct: 100, count: summary.joined },
    { name: '2. Plays Únicos', pct: summary.joined > 0 ? Math.round((summary.plays / summary.joined) * 100) : 0, count: summary.plays },
    { name: '3. Tempo de pitch', pct: summary.retentionAtPitch, count: Math.round(summary.joined * (summary.retentionAtPitch / 100)) },
    { name: '4. Cliques no Botão', pct: summary.joined > 0 ? Math.round((summary.ctaClicks / summary.joined) * 100) : 0, count: summary.ctaClicks },
    { name: '5. Conversões', pct: 0, count: 0 }
  ]

  const renderFunnelLabel = (props: unknown) => {
    const { x = 0, y = 0, width = 0, value = 0, index = 0 } = props as FunnelLabelProps
    const numericX = Number(x) || 0
    const numericY = Number(y) || 0
    const numericWidth = Number(width) || 0
    const count = funnelData[index]?.count || 0
    return (
      <g>
        <rect
          x={numericX + numericWidth / 2 - 28}
          y={numericY - 38}
          width={56}
          height={32}
          rx={6}
          fill="rgba(10,12,20,0.97)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
        <text
          x={numericX + numericWidth / 2}
          y={numericY - 25}
          fill="#fff"
          fontSize={10}
          fontWeight="bold"
          textAnchor="middle"
        >
          {Number(value).toFixed(1)}%
        </text>
        <text
          x={numericX + numericWidth / 2}
          y={numericY - 12}
          fill="#94a3b8"
          fontSize={9}
          fontWeight={600}
          textAnchor="middle"
        >
          {count.toLocaleString()}
        </text>
      </g>
    )
  }

  const SEG_TABS: { id: SegTab; label: string }[] = [
    { id: 'retention', label: 'Retenção Geral' },
    { id: 'countries', label: 'Países' },
    { id: 'devices', label: 'Dispositivos' },
    { id: 'os', label: 'Sistema Operacional' },
    { id: 'browsers', label: 'Navegadores' },
    { id: 'utm', label: 'Origem do Tráfego' },
    { id: 'leads', label: '👥 Linha do Tempo dos Leads' },
    { id: 'comparison', label: '📊 Comparativo de Runs' },
  ]

  const totalJoined = summary.joined || 1
  const formatChartTime = (seconds: number | string) => {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
    const minutes = Math.floor(totalSeconds / 60)
    const remainder = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  }
  const pitchSecond = summary.pitchAtMinute !== null ? summary.pitchAtMinute * 60 : null
  const hasCompareCurve = retentionData.some(point => typeof point.compare_retention_pct === 'number')
  const criticalDropoffTotal = criticalDropoffs.reduce((sum, item) => sum + item.dropoff, 0)
  const worstDropoff = criticalDropoffs[0] || null
  const exportAnalyticsCsv = () => {
    const rows = [
      ['tipo', 'tempo', 'retencao_atual_pct', 'retencao_comparada_pct', 'delta_retencao_pp', 'audiencia', 'audiencia_comparada', 'saidas', 'cliques_cta', 'mensagens_chat'],
      ...retentionData.map(point => [
        'retencao',
        formatChartTime(point.time_seconds),
        point.retention_pct,
        point.compare_retention_pct ?? '',
        point.retention_delta ?? '',
        point.viewers,
        point.compare_viewers ?? '',
        point.dropoff ?? 0,
        point.clicks ?? 0,
        point.chatMessages ?? 0,
      ]),
      [],
      ['tipo', 'tempo', 'saidas', 'queda_pct', 'audiencia_antes', 'audiencia_depois', 'retencao_pct', 'cliques_cta', 'mensagens_chat'],
      ...criticalDropoffs.map(item => [
        'queda_critica',
        formatChartTime(item.time_seconds),
        item.dropoff,
        item.dropoff_pct,
        item.previous_viewers,
        item.viewers,
        item.retention_pct,
        item.clicks,
        item.chatMessages,
      ]),
      [],
      ['metrica', 'valor'],
      ['visualizacoes_unicas', summary.uniquePageViews],
      ['plays_unicos', summary.uniquePlays],
      ['play_rate_pct', summary.playRate],
      ['retencao_pitch_pct', summary.retentionAtPitch],
      ['audiencia_pitch', summary.audienceAtPitch],
      ['cliques_cta', summary.ctaClicks],
      ['engajamento_medio_pct', summary.averageEngagementPct],
    ]
    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `analytics-${webinarName || wid}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const getRetentionPctAt = (seconds: number) => {
    const pt = retentionData.find(d => d.time_seconds === seconds)
    return pt ? pt.retention_pct : 0
  }

  const minuteIntervals = useMemo(() => {
    if (retentionData.length === 0) return []
    const maxSeconds = retentionData[retentionData.length - 1].time_seconds
    const intervalSeconds = 5 * 60 // 5 minutes
    const intervals: {
      label: string
      startSec: number
      endSec: number
      retentionPct: number
      viewers: number
      dropoff: number
      hasPitch: boolean
    }[] = []

    const pitchMin = summary.pitchAtMinute ?? -1

    for (let sec = 0; sec <= maxSeconds; sec += intervalSeconds) {
      const startSec = sec
      const endSec = Math.min(maxSeconds, sec + intervalSeconds)
      
      const point = retentionData.find(d => d.time_seconds === endSec) || retentionData[retentionData.length - 1]
      const intervalBuckets = retentionData.filter(d => d.time_seconds > startSec && d.time_seconds <= endSec)
      const dropoffVal = intervalBuckets.reduce((sum, d) => sum + (d.dropoff || 0), 0)
      const startMin = startSec / 60
      const endMin = endSec / 60
      const hasPitch = pitchMin >= startMin && pitchMin < endMin

      intervals.push({
        label: `${formatChartTime(startSec)} - ${formatChartTime(endSec)}`,
        startSec,
        endSec,
        retentionPct: point?.retention_pct ?? 0,
        viewers: point?.viewers ?? 0,
        dropoff: dropoffVal,
        hasPitch,
      })

      if (endSec === maxSeconds) break
    }
    return intervals
  }, [retentionData, summary.pitchAtMinute])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ maxWidth: 1160, margin: '0 auto', padding: '32px 24px' }}>

      {/* ── Pulse animation ── */}
      <style>{`
        @keyframes pulseActive { 0%,100%{opacity:1}50%{opacity:.4} }
        .seg-tab { transition: all .15s; cursor: pointer; }
        .seg-tab:hover { color: var(--text-primary) !important; }
        .hover-row:hover { background: rgba(255,255,255,0.02) !important; }
        .wa-btn:hover { background: rgba(34,197,94,0.18) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link>
          {' / '}{webinarName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>📊 Analytics</h1>
            <p className="page-subtitle">Métricas avançadas de retenção, conversão e segmentação de audiência</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
              color: isLiveActive ? '#22c55e' : 'var(--text-muted)',
              background: isLiveActive ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
              border: isLiveActive ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)',
            }}>
              {isLiveActive ? '🔴 LIVE' : '⚪ OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Mode Toggle ── */}
      <div style={{
        display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 6, marginBottom: 28, width: 'fit-content',
      }}>
        {[
          { val: 'all' as const, icon: '📊', label: 'Historico Geral' },
          { val: 'live' as const, icon: '🎬', label: 'Live' },
          { val: 'replay' as const, icon: '▶️', label: 'Replay' },
          { val: 'evergreen' as const, icon: '🔁', label: 'Evergreen' },
        ].map(m => (
          <button key={m.val} onClick={() => setMode(m.val)} style={{
            padding: '9px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: mode === m.val ? (m.val === 'live' ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)') : 'transparent',
            color: mode === m.val ? (m.val === 'live' ? '#22c55e' : 'var(--brand-light)') : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
          }}>
            {m.val === 'live' && (
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: isLiveActive ? '#22c55e' : '#6b7280',
                boxShadow: isLiveActive ? '0 0 6px #22c55e' : 'none',
                animation: isLiveActive ? 'pulseActive 1.5s infinite' : 'none',
              }} />
            )}
            <span>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 14,
        marginBottom: selectedRunMeta ? 8 : 28,
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          Execucao
          <select
            className="form-input form-select"
            value={selectedRunId}
            onChange={e => {
              setSelectedRunId(e.target.value)
              setCompareRunId('')
              setSelectedRunMeta(null)
            }}
          >
            <option value="all">📊 Todas as execucoes</option>
            {runs.map(run => {
              const startDate = new Date(run.started_at).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit',
              })
              const endDate = run.ended_at
                ? new Date(run.ended_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : 'em andamento'
              const statusIcon = run.status === 'active' ? '🔴' : '✅'
              const label = run.title && run.title !== startDate ? run.title : startDate
              return (
                <option key={run.id} value={run.id}>
                  {statusIcon} {label} ({startDate} → {endDate})
                </option>
              )
            })}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          De
          <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          Ate
          <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          Campanha / UTM
          <input
            type="text"
            className="form-input"
            value={campaign}
            onChange={e => setCampaign(e.target.value)}
            placeholder="utm_source ou campanha"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)', fontWeight: 700, paddingTop: 20 }}>
          <input type="checkbox" checked={compareEnabled} onChange={e => setCompareEnabled(e.target.checked)} />
          {selectedRunId !== 'all' ? 'Comparar execucao' : 'Comparar periodo'}
        </label>
        {compareEnabled && (
          <>
            {selectedRunId !== 'all' ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                Execucao base
                <select
                  className="form-input form-select"
                  value={compareRunId}
                  onChange={e => setCompareRunId(e.target.value)}
                >
                  <option value="">Execucao anterior automaticamente</option>
                  {runs.filter(run => run.id !== selectedRunId).map(run => (
                    <option key={run.id} value={run.id}>{formatRunLabel(run)}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                  Comparar de
                  <input type="date" className="form-input" value={compareDateFrom} onChange={e => setCompareDateFrom(e.target.value)} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                  Comparar ate
                  <input type="date" className="form-input" value={compareDateTo} onChange={e => setCompareDateTo(e.target.value)} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                  Campanha base
                  <input
                    type="text"
                    className="form-input"
                    value={compareCampaign}
                    onChange={e => setCompareCampaign(e.target.value)}
                    placeholder="opcional"
                  />
                </label>
              </>
            )}
          </>
        )}
      </div>

      {/* Banner informativo da run selecionada */}
      {selectedRunMeta && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 10,
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 28, fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{selectedRunMeta.status === 'active' ? '🔴' : '📅'}</span>
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 13 }}>
                {selectedRunMeta.status === 'active' ? 'Sessão em andamento' : 'Sessão encerrada'}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>
                Início: <strong>{new Date(selectedRunMeta.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                {selectedRunMeta.ended_at && (
                  <> · Fim: <strong>{new Date(selectedRunMeta.ended_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {sessionQualityScore !== null && (
              <div style={{
                background: sessionQualityScore >= 80 ? 'rgba(16,185,129,0.1)' : sessionQualityScore >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                color: sessionQualityScore >= 80 ? '#10b981' : sessionQualityScore >= 50 ? '#f59e0b' : '#ef4444',
                border: `1px solid ${sessionQualityScore >= 80 ? '#10b981' : sessionQualityScore >= 50 ? '#f59e0b' : '#ef4444'}30`,
                padding: '5px 12px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                ⭐ Nota da Sessão: {sessionQualityScore}/100
              </div>
            )}
            {summary.joined === 0 && (
              <div style={{ color: '#f59e0b', fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '4px 10px' }}>
                ⚠️ Nenhum dado de audiência encontrado nesta run
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aviso para sessoes agendadas sem run associada (sem dados) */}
      {selectedRunId === 'all' && !dateFrom && !dateTo && summary.joined === 0 && !loading && (
        <div style={{
          background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 24, fontSize: 13,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Sem dados ainda.</strong>
            {runs.length === 0 ? (
              <span style={{ color: 'var(--text-muted)' }}> Nenhuma sessão foi realizada ou os dados não foram registrados. Se o webinar está em modo agendado, as sessions anteriores ao sistema de runs precisam ser filtradas por data.</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}> Selecione uma execução específica no filtro acima, ou use os campos "De" e "Ate" para filtrar por data da sessão.</span>
            )}
          </div>
        </div>
      )}

      {mode === 'live' && !isLiveActive && (
        <div style={{
          background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 24, color: '#eab308',
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <strong>Nenhuma live ativa.</strong> Inicie a sessão no{' '}
            <Link href={`/admin/projects/${id}/webinars/${wid}/live`}
              style={{ color: '#facc15', textDecoration: 'underline', fontWeight: 700 }}>
              Controle de Live 🎬
            </Link>. Exibindo histórico acumulado.
          </div>
        </div>
      )}

      <div className="analytics-vturb-shell">
        <div className="analytics-funnel-card">
          <div className="analytics-section-kicker">Funil de Conversao</div>
          <div className="analytics-funnel-grid">
            {vturbFunnelData.map((stage, index) => (
              <div className="analytics-funnel-stage" key={stage.name}>
                <div className="analytics-funnel-stage-head">
                  <span>{index + 1}</span>
                  <strong style={{ color: stage.color }}>{stage.pct}%</strong>
                </div>
                <div className="analytics-funnel-value" style={{ color: stage.color }}>
                  {stage.count.toLocaleString('pt-BR')}
                </div>
                <div className="analytics-funnel-label">{stage.name}</div>
                <div className="analytics-funnel-bar">
                  <div style={{ width: `${Math.min(100, stage.pct)}%`, background: stage.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="analytics-vturb-grid">
          <div className="analytics-retention-panel">
            <div className="analytics-panel-header">
              <div>
                <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Curva de Retencao
                  <span 
                    title="No modo Evergreen, buracos na curva significam intervalos onde nenhum espectador entrou atrasado para assistir àquele trecho do vídeo."
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      background: 'rgba(255,255,255,0.08)', 
                      color: 'var(--text-muted)', 
                      borderRadius: '50%', 
                      width: 16, 
                      height: 16, 
                      fontSize: 10, 
                      cursor: 'help',
                      fontWeight: 'bold',
                      fontFamily: 'serif',
                    }}
                  >
                    i
                  </span>
                </h2>
                <p>% da audiencia em buckets de 5s, com pitch e cliques sobrepostos.</p>
              </div>
              <div className="analytics-chart-legend">
                <span><i style={{ background: '#22c55e' }} />Retencao</span>
                {hasCompareCurve && <span><i style={{ background: '#60a5fa' }} />Comparativo</span>}
                <span><i style={{ background: '#f59e0b' }} />Pitch</span>
                <span><i style={{ background: '#f97316' }} />CTA</span>
              </div>
            </div>

            {!retentionHasData ? (
              <div className="analytics-empty-chart">
                <strong>Dados aparecerao apos os primeiros plays.</strong>
                <span>O tracker registra amostras de watch time durante a reproducao.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={330}>
                <ComposedChart data={retentionData} margin={{ top: 14, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vturbRetentionFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.42} />
                      <stop offset="70%" stopColor="#22c55e" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="time_seconds" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatChartTime} minTickGap={28} />
                  <YAxis yAxisId="left" domain={[0, 100]} stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis yAxisId="right" orientation="right" hide />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0]?.payload as RetentionPoint
                      return (
                        <div className="analytics-chart-tooltip">
                          <strong>{formatChartTime(label ?? 0)}</strong>
                          <span>Audiencia: <b>{row.viewers.toLocaleString('pt-BR')}</b></span>
                          <span>Retencao: <b>{row.retention_pct}%</b></span>
                          {typeof row.compare_retention_pct === 'number' ? (
                            <span>Comparativo: <b>{row.compare_retention_pct}%</b>{typeof row.retention_delta === 'number' ? ` (${row.retention_delta >= 0 ? '+' : ''}${row.retention_delta} pp)` : ''}</span>
                          ) : null}
                          {row.clicks ? <span>Cliques CTA: <b>{row.clicks}</b></span> : null}
                          {row.chatMessages ? <span>Chat: <b>{row.chatMessages} msgs</b></span> : null}
                          {row.dropoff ? <span>Saidas: <b>{row.dropoff}</b></span> : null}
                        </div>
                      )
                    }}
                  />
                  {pitchSecond !== null && (
                    <ReferenceLine yAxisId="left" x={pitchSecond} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" label={{ value: 'Pitch', fill: '#f59e0b', fontSize: 11, position: 'top' }} />
                  )}
                  {maxDropoffMinute && (
                    <ReferenceLine yAxisId="left" x={maxDropoffMinute.minute} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" />
                  )}
                  <Bar yAxisId="right" dataKey="clicks" fill="#f97316" barSize={8} radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="dropoff" fill="#ef4444" barSize={5} opacity={0.28} radius={[4, 4, 0, 0]} />
                  {hasCompareCurve && (
                    <Line yAxisId="left" type="stepAfter" dataKey="compare_retention_pct" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  )}
                  <Area yAxisId="left" type="stepAfter" dataKey="retention_pct" stroke="#22c55e" strokeWidth={2.5} fill="url(#vturbRetentionFill)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            <div className="analytics-insight-pills">
              {peakMinute !== null && <span>Pico em {formatChartTime(peakMinute)}</span>}
              {maxDropoffMinute && <span>Maior queda: {formatChartTime(maxDropoffMinute.minute)} ({maxDropoffMinute.dropoff})</span>}
              {pitchSecond !== null && <span>Pitch em {formatChartTime(pitchSecond)} - {summary.retentionAtPitch}%</span>}
            </div>
          </div>

          <div className="analytics-key-metrics">
            <div className="analytics-section-kicker">Metricas Chave</div>
            {keyMetrics.map(metric => (
              <div className="analytics-key-metric" key={metric.label}>
                <div>
                  <span>{metric.label}</span>
                  <small>{metric.sub}</small>
                </div>
                <strong style={{ color: metric.color }}>{metric.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Análise por Seção do Webinar ── */}
      {retentionHasData && minuteIntervals.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>📋 Análise por Seção do Webinar</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                Desempenho da audiência dividido em blocos de 5 minutos · {minuteIntervals.length} seções
              </div>
            </div>
            {selectedRunMeta && (
              <div style={{ fontSize: 11, color: 'var(--brand-light)', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>
                Sessão: {new Date(selectedRunMeta.started_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>Seção</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>Intervalo</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>Audiência Início</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>Audiência Fim</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>Saídas</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>Retenção</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {minuteIntervals.map((interval, idx) => {
                  const retPct = interval.retentionPct
                  const retColor = retPct >= 80 ? '#22c55e' : retPct >= 60 ? '#f59e0b' : '#ef4444'
                  const startViewers = retentionData.find(d => d.time_seconds === interval.startSec)?.viewers ?? 0
                  const sectionNames = ['🎯 Abertura', '📖 Conteúdo', '📖 Conteúdo', '📖 Conteúdo', '📖 Conteúdo', '📖 Conteúdo', '🔥 Pitch', '🔥 Pitch', '🎁 Oferta', '🎁 Oferta', '🏁 Encerramento']
                  const sectionLabel = interval.hasPitch
                    ? '🎯 Momento do Pitch'
                    : sectionNames[Math.min(idx, sectionNames.length - 1)]
                  const isWorst = maxDropoffMinute !== null && Math.abs(interval.startSec / 60 - maxDropoffMinute.minute) <= 5
                  return (
                    <tr
                      key={interval.label}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: interval.hasPitch
                          ? 'rgba(245,158,11,0.04)'
                          : isWorst
                          ? 'rgba(239,68,68,0.04)'
                          : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Nº + barra de cor */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 4, height: 28, borderRadius: 4, background: retColor, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>
                              #{idx + 1}
                              {interval.hasPitch && <span style={{ color: '#f59e0b', fontSize: 10, marginLeft: 4 }}>⭐ PITCH</span>}
                              {isWorst && !interval.hasPitch && <span style={{ color: '#ef4444', fontSize: 10, marginLeft: 4 }}>⚠️ QUEDA</span>}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{sectionLabel}</div>
                          </div>
                        </div>
                      </td>

                      {/* Intervalo */}
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {interval.label}
                      </td>

                      {/* Audiência início */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {startViewers.toLocaleString('pt-BR')}
                      </td>

                      {/* Audiência fim */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: retColor }}>
                        {interval.viewers.toLocaleString('pt-BR')}
                      </td>

                      {/* Saídas */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {interval.dropoff > 0 ? (
                          <span style={{ color: '#ef4444', fontWeight: 700 }}>−{interval.dropoff.toLocaleString('pt-BR')}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      {/* Barra de retenção */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              width: `${retPct}%`, height: '100%',
                              background: retColor, borderRadius: 99,
                              transition: 'width 0.6s ease',
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: retColor, minWidth: 36, textAlign: 'right' }}>{retPct}%</span>
                        </div>
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                          background: `${retColor}15`, color: retColor,
                          border: `1px solid ${retColor}30`, whiteSpace: 'nowrap',
                        }}>
                          {retPct >= 80 ? '✅ Excelente' : retPct >= 60 ? '⚡ Normal' : '⚠️ Crítico'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} /> Retenção &gt;80%</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} /> 60–80%</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} /> &lt;60% — Revisar conteúdo</span>
            <span>⭐ Momento do Pitch</span>
            <span>⚠️ Maior queda de audiência</span>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Metricas de Video</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              Retencao, plays, pitch e engajamento no modelo de leitura de VSL.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Atualizado ao carregar a pagina</div>
            <button
              type="button"
              onClick={exportAnalyticsCsv}
              disabled={!retentionHasData && summary.sessions.length === 0}
              style={{
                border: '1px solid rgba(96,165,250,0.28)',
                background: 'rgba(96,165,250,0.1)',
                color: '#93c5fd',
                borderRadius: 8,
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 800,
                cursor: (!retentionHasData && summary.sessions.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (!retentionHasData && summary.sessions.length === 0) ? 0.5 : 1,
              }}
            >
              Baixar CSV
            </button>
          </div>
        </div>
        {comparison.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {comparison.map(item => {
              const positive = item.absolute >= 0
              return (
                <div
                  key={item.label}
                  title={`Atual ${item.current} vs anterior ${item.previous}`}
                  style={{
                    border: `1px solid ${positive ? 'rgba(34,197,94,0.24)' : 'rgba(239,68,68,0.24)'}`,
                    background: positive ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
                    color: positive ? '#22c55e' : '#f87171',
                    borderRadius: 8,
                    padding: '6px 9px',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {item.label}: {positive ? '+' : ''}{item.absolute}
                  {item.pct !== null ? ` (${positive ? '+' : ''}${item.pct}%)` : ''}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {[
            { label: 'Visualizacoes', value: summary.pageViews.toLocaleString(), sub: 'page views' },
            { label: 'Visualizacoes Unicas', value: summary.uniquePageViews.toLocaleString(), sub: 'sessoes unicas' },
            { label: 'Plays', value: summary.plays.toLocaleString(), sub: 'eventos de play' },
            { label: 'Plays Unicos', value: summary.uniquePlays.toLocaleString(), sub: 'sessoes com play' },
            { label: 'Play Rate', value: `${summary.playRate}%`, sub: 'plays / views' },
            { label: 'Retencao ao Pitch', value: summary.retentionAtPitch > 0 ? `${summary.retentionAtPitch}%` : '--', sub: summary.pitchAtMinute !== null ? `min ${summary.pitchAtMinute}` : 'sem pitch' },
            { label: 'Audiencia no Pitch', value: summary.audienceAtPitch.toLocaleString(), sub: 'presentes no minuto' },
            { label: 'Engajamento', value: `${summary.averageEngagementPct}%`, sub: 'tempo medio assistido' },
            { label: 'Cliques no Botao', value: summary.ctaClicks.toLocaleString(), sub: 'todos os CTAs' },
            { label: 'Conversoes', value: '0', sub: 'pendente checkout' },
            { label: 'Taxa de Conversao', value: '0,00%', sub: 'pendente checkout' },
            { label: 'Receita', value: 'R$ 0,00', sub: 'pendente checkout' },
          ].map(metric => (
            <div key={metric.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minHeight: 74 }}>
              <div style={{ fontSize: 20, lineHeight: 1, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>{metric.value}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{metric.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{metric.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {[
            { label: '25%', value: summary.progress25, color: '#60a5fa' },
            { label: '50%', value: summary.progress50, color: '#818cf8' },
            { label: '75%', value: summary.progress75, color: '#a78bfa' },
            { label: '90%', value: summary.progress90, color: '#22c55e' },
          ].map(item => {
            const pct = summary.uniquePlays > 0 ? Math.round((item.value / summary.uniquePlays) * 100) : 0
            return (
              <div key={item.label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                  <span>{item.label} assistido</span>
                  <span style={{ color: item.color }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: 99 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── KPI Row (11 métricas) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12, marginBottom: 28,
      }}>
        <KpiCard icon="👤" label="Total Leads" value={summary.totalLeads.toLocaleString()} tooltip="Total de usuários que se cadastraram na landing page do webinar." />
        <KpiCard icon="▶️" label="Visualizações Únicas" value={summary.joined.toLocaleString()} tooltip="Número de pessoas únicas que acessaram a sala do webinar." />
        <KpiCard icon="📈" label="Pico Simultâneo" value={summary.peakViewers.toLocaleString()} color="#a78bfa" tooltip="O maior número de pessoas assistindo ao mesmo tempo durante a transmissão." />
        <KpiCard icon="🎯" label="Show-up Rate" value={`${attendanceRate}%`}
          color={parseFloat(attendanceRate) >= 30 ? '#10b981' : parseFloat(attendanceRate) >= 15 ? '#eab308' : '#ef4444'}
          sub="leads → sala" tooltip="Porcentagem de leads cadastrados que efetivamente entraram na sala (Show-up)." />
        <KpiCard icon="⏱️" label="Retenção 50%+" value={summary.progress50.toLocaleString()}
          sub={`${summary.joined > 0 ? Math.round((summary.progress50 / summary.joined) * 100) : 0}% dos presentes`} tooltip="Número de pessoas que assistiram a pelo menos 50% da duração total do vídeo." />
        <KpiCard icon="🎯" label="Retenção ao Pitch"
          value={summary.retentionAtPitch > 0 ? `${summary.retentionAtPitch}%` : '—'}
          color={summary.retentionAtPitch >= 60 ? '#10b981' : '#f97316'}
          sub={summary.pitchAtMinute !== null ? `minuto ${summary.pitchAtMinute}` : 'sem dados'} tooltip="Porcentagem de audiência retida no minuto em que o botão de oferta (CTA) foi revelado." />
        <KpiCard icon="💬" label="Mensagens Chat" value={summary.chatMessagesCount.toLocaleString()}
          sub={`${summary.chatUniqueSenders} usuários únicos`} tooltip="Total de mensagens enviadas no chat pelos usuários (exclui mensagens simuladas)." />
        <KpiCard icon="📝" label="Respostas Quiz" value={summary.quizResponsesCount.toLocaleString()}
          sub={`média ${summary.quizAvgScore}%`} tooltip="Quantidade total de respostas enviadas nos quizzes interativos." />
        <KpiCard icon="🛒" label="Cliques no CTA" value={summary.ctaClicks.toLocaleString()}
          color="#f97316" highlight tooltip="Número total de cliques no botão de oferta (CTA) exibido na tela." />
        <KpiCard icon="💰" label="Pop-ups Vistos" value={summary.popupSeen.toLocaleString()} tooltip="Total de vezes que o pop-up de oferta foi exibido na tela dos usuários." />
        <KpiCard icon="🎬" label="Play Rate" value={`${summary.playRate}%`}
          sub={`${summary.plays} plays / ${summary.pageViews} views`} tooltip="Porcentagem de pessoas que entraram na página e iniciaram a reprodução do vídeo (plays / visualizações)." />
        <KpiCard icon="📊" label="Taxa de Conversão"
          value={`${summary.conversionRate.toFixed(1)}%`}
          color={summary.conversionRate >= 10 ? '#10b981' : summary.conversionRate >= 3 ? '#f97316' : '#ef4444'}
          sub="cliques / entraram" highlight tooltip="Porcentagem de cliques no botão de oferta em relação ao número total de visualizações únicas." />
      </div>

      {/* ── Segmentation Tabs + Charts ── */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>

        {/* Tab strip */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          {SEG_TABS.map(tab => (
            <button
              key={tab.id}
              className="seg-tab"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 16px', fontSize: 13, fontWeight: 600,
                borderRadius: '8px 8px 0 0',
                border: 'none', cursor: 'pointer',
                background: activeTab === tab.id ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: activeTab === tab.id ? 'var(--brand-light)' : 'var(--text-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--brand-light)' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Retenção Geral ── */}
        {activeTab === 'retention' && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>📉 Curva de Retenção</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {peakMinute !== null && (
                    <span style={{ fontSize: 11, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 8, padding: '3px 10px' }}>
                      📈 Pico no minuto {peakMinute}
                    </span>
                  )}
                  {maxDropoffMinute && (
                    <span style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '3px 10px' }}>
                      ⚠️ Maior queda min. {maxDropoffMinute.minute} ({maxDropoffMinute.dropoff} saíram)
                    </span>
                  )}
                  {summary.pitchAtMinute !== null && (
                    <span style={{ fontSize: 11, color: '#fb923c', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 8, padding: '3px 10px' }}>
                      🎯 Pitch no min. {summary.pitchAtMinute} · {summary.retentionAtPitch}% audiência
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 12, height: 3, background: '#818cf8', display: 'inline-block', borderRadius: 2 }} /> Retenção %
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 12, height: 8, background: '#fb923c', display: 'inline-block', borderRadius: 2 }} /> CTA Clicks
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 12, height: 8, background: '#f87171', opacity: 0.4, display: 'inline-block', borderRadius: 2 }} /> Saídas
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 12, height: 3, background: '#c084fc', display: 'inline-block', borderRadius: 2 }} /> Msg Chat
                </span>
              </div>
            </div>

            {retentionData.length === 0 || retentionData.every(d => d.viewers === 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 12, color: 'var(--text-muted)', fontSize: 14 }}>
                <div style={{ fontSize: 40 }}>📭</div>
                <div>Dados aparecerão após o primeiro espectador assistir ao vídeo</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>O tracker coleta dados a cada 10–30s de reprodução</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={retentionData} margin={{ top: 15, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradViewers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time_seconds" stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} dy={10} tickFormatter={formatChartTime} minTickGap={28} />
                  <YAxis yAxisId="left" domain={[0, 100]} stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} dx={-5} tickFormatter={v => `${v}%`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={11} hide />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const pct = payload.find(p => p.dataKey === 'retention_pct')?.value || 0
                      const dropoff = payload.find(p => p.dataKey === 'dropoff')?.value || 0
                      const clicks = payload.find(p => p.dataKey === 'clicks')?.value || 0
                      const chatVal = payload.find(p => p.dataKey === 'chatMessages')?.value || 0
                      const comparePct = payload.find(p => p.dataKey === 'compare_retention_pct')?.value
                      const viewers = payload[0]?.payload?.viewers || 0
                      const progressPct = durationSeconds > 0 ? Math.min(100, Math.round((Number(label) / durationSeconds) * 100)) : 0
                      
                      return (
                        <div style={{
                          background: 'rgba(10,12,20,0.97)', backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
                          padding: '12px 16px', fontSize: 12, color: '#fff',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        }}>
                          <div style={{ fontWeight: 700, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                            {formatChartTime(label ?? 0)} - {progressPct}%
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                              <span style={{ color: '#9ca3af' }}>Audiência:</span>
                              <strong style={{ marginLeft: 'auto' }}>{viewers.toLocaleString()}</strong>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                              <span style={{ color: '#9ca3af' }}>Retenção:</span>
                              <strong style={{ marginLeft: 'auto' }}>{pct}%</strong>
                            </div>
                            {typeof comparePct === 'number' && (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa' }} />
                                <span style={{ color: '#9ca3af' }}>Comparativo:</span>
                                <strong style={{ color: '#93c5fd', marginLeft: 'auto' }}>{comparePct}%</strong>
                              </div>
                            )}
                            {Number(chatVal) > 0 && (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c084fc' }} />
                                <span style={{ color: '#9ca3af' }}>Chat:</span>
                                <strong style={{ color: '#c084fc', marginLeft: 'auto' }}>{chatVal} msgs</strong>
                              </div>
                            )}
                            {Number(dropoff) > 0 && (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                                <span style={{ color: '#9ca3af' }}>Saídas:</span>
                                <strong style={{ color: '#f87171', marginLeft: 'auto' }}>{dropoff}</strong>
                              </div>
                            )}
                            {Number(clicks) > 0 && (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb923c' }} />
                                <span style={{ color: '#9ca3af' }}>CTA Clicks:</span>
                                <strong style={{ color: '#fb923c', marginLeft: 'auto' }}>{clicks}</strong>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }}
                  />
                  {peakMinute !== null && (
                    <ReferenceDot
                      yAxisId="left"
                      x={peakMinute}
                      y={getRetentionPctAt(peakMinute)}
                      r={5}
                      fill="#a78bfa"
                      stroke="#fff"
                      strokeWidth={1.5}
                      label={{
                        value: `📈 Pico: ${getRetentionPctAt(peakMinute)}%`,
                        fill: '#a78bfa',
                        fontSize: 10,
                        fontWeight: 'bold',
                        position: 'top',
                        offset: 8
                      }}
                    />
                  )}
                  {worstDropoff && (
                    <ReferenceDot
                      yAxisId="left"
                      x={worstDropoff.time_seconds}
                      y={worstDropoff.retention_pct}
                      r={5}
                      fill="#ef4444"
                      stroke="#fff"
                      strokeWidth={1.5}
                      label={{
                        value: `⚠️ Queda: -${worstDropoff.dropoff} (${worstDropoff.dropoff_pct}%)`,
                        fill: '#fca5a5',
                        fontSize: 10,
                        fontWeight: 'bold',
                        position: 'bottom',
                        offset: 8
                      }}
                    />
                  )}
                  {pitchSecond !== null && (
                    <ReferenceDot
                      yAxisId="left"
                      x={pitchSecond}
                      y={summary.retentionAtPitch}
                      r={5}
                      fill="#fb923c"
                      stroke="#fff"
                      strokeWidth={1.5}
                      label={{
                        value: `🛒 Pitch: ${summary.retentionAtPitch}%`,
                        fill: '#fb923c',
                        fontSize: 10,
                        fontWeight: 'bold',
                        position: 'top',
                        offset: 8
                      }}
                    />
                  )}
                  <Bar yAxisId="right" dataKey="dropoff" fill="#f87171" barSize={6} opacity={0.35} radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="clicks" fill="#fb923c" barSize={10} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="chatMessages" stroke="#c084fc" strokeWidth={2} dot={false} name="Mensagens Chat" />
                  {hasCompareCurve && (
                    <Line yAxisId="left" type="monotone" dataKey="compare_retention_pct" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 4" dot={false} name="Comparativo" />
                  )}
                  <Area yAxisId="left" type="monotone" dataKey="retention_pct" stroke="#818cf8" strokeWidth={3}
                    fillOpacity={1} fill="url(#gradViewers)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {criticalDropoffs.length > 0 && (
              <div style={{
                marginTop: 18,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 14,
              }}>
                <div style={{
                  border: '1px solid rgba(248,113,113,0.22)',
                  background: 'rgba(248,113,113,0.06)',
                  borderRadius: 12,
                  padding: 16,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Ponto critico
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#fca5a5', marginBottom: 4 }}>
                    {worstDropoff ? formatChartTime(worstDropoff.time_seconds) : '--'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {worstDropoff
                      ? `${worstDropoff.dropoff} pessoas sairam nesse intervalo (${worstDropoff.dropoff_pct}% da audiencia anterior).`
                      : 'Sem queda relevante no intervalo filtrado.'}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    Top 5 quedas somam {criticalDropoffTotal.toLocaleString('pt-BR')} saidas.
                  </div>
                </div>
                <div style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  borderRadius: 12,
                  padding: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🚨 Alertas de Queda e Recomendações
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {criticalDropoffs.slice(0, 3).map((item, index) => {
                      const isPitchArea = pitchSecond !== null && Math.abs(item.time_seconds - pitchSecond) <= 120
                      const action = isPitchArea
                        ? 'Perda antes da oferta. Considere trabalhar melhor o gancho de transição, reduzir a enrolação ou criar um bônus irresistível de ancoragem.'
                        : item.dropoff_pct > 30
                        ? 'Queda severa de atenção. Considere revisar o conteúdo neste trecho: acelerar o ritmo, remover silêncios ou inserir uma pergunta de engajamento no chat.'
                        : 'Oscilação na retenção. Considere revisar o conteúdo neste trecho ou animar o chat com uma enquete para recuperar atenção.'
                      
                      return (
                        <div
                          key={`${item.time_seconds}-${index}`}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.015)',
                            border: '1px solid rgba(255,255,255,0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#f87171', fontSize: 12 }}>
                              ⚠️ Queda de {item.dropoff_pct}% aos {formatChartTime(item.time_seconds)}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {item.previous_viewers} → {item.viewers} esp.
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            💡 <strong>Ação sugerida:</strong> {action}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 5-Minute Interval Retention Table */}
            {retentionData.length > 0 && (
              <div style={{
                marginTop: 24,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                borderRadius: 12,
                padding: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>📊 Retenção por Intervalo (5 minutos)</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Análise detalhada de evasão e presença em blocos de 5 minutos</p>
                  </div>
                  {summary.pitchAtMinute !== null && (
                    <span style={{ fontSize: 11, background: 'rgba(251,146,60,0.12)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.25)', padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>
                      🎯 Pitch revelado no minuto {summary.pitchAtMinute}
                    </span>
                  )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Intervalo</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, width: '40%' }}>Retenção (%)</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Espectadores Retidos</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Saídas no Bloco</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Destaque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {minuteIntervals.map((item, index) => {
                        const isPitchHighlighted = item.hasPitch
                        return (
                          <tr
                            key={index}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                              background: isPitchHighlighted ? 'rgba(251,146,60,0.04)' : 'transparent',
                              borderLeft: isPitchHighlighted ? '3px solid #fb923c' : '3px solid transparent',
                              transition: 'background 0.2s',
                            }}
                            className="hover-row"
                          >
                            <td style={{ padding: '12px', fontWeight: isPitchHighlighted ? 800 : 500 }}>
                              {item.label}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ width: 36, fontWeight: 700, color: isPitchHighlighted ? '#fb923c' : '#fff' }}>{item.retentionPct}%</span>
                                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${item.retentionPct}%`,
                                    height: '100%',
                                    background: isPitchHighlighted
                                      ? 'linear-gradient(90deg, #fb923c, #f97316)'
                                      : 'linear-gradient(90deg, #818cf8, #6366f1)',
                                    borderRadius: 99
                                  }} />
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '12px', fontWeight: 700 }}>
                              {item.viewers.toLocaleString('pt-BR')}
                            </td>
                            <td style={{ padding: '12px', color: item.dropoff > 0 ? '#f87171' : 'var(--text-muted)' }}>
                              {item.dropoff > 0 ? `-${item.dropoff.toLocaleString('pt-BR')}` : '0'}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              {isPitchHighlighted ? (
                                <span style={{ fontSize: 11, background: '#fb923c', color: '#000', padding: '2px 8px', borderRadius: 4, fontWeight: 900 }}>
                                  🛒 MOMENTO PITCH
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Países ── */}
        {activeTab === 'countries' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>🌎 Audiência por País</div>
            <SegmentTable data={summary.countriesBreakdown} label="País" total={totalJoined} />
          </>
        )}

        {/* ── Tab: Dispositivos ── */}
        {activeTab === 'devices' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>📱 Audiência por Dispositivo</div>
            <SegmentTable data={summary.devicesBreakdown} label="Dispositivo" total={totalJoined} />
          </>
        )}

        {/* ── Tab: OS ── */}
        {activeTab === 'os' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>💻 Sistema Operacional</div>
            <SegmentTable data={summary.osBreakdown} label="Sistema" total={totalJoined} />
          </>
        )}

        {/* ── Tab: Browsers ── */}
        {activeTab === 'browsers' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>🌐 Navegadores</div>
            <SegmentTable data={summary.browsersBreakdown} label="Navegador" total={totalJoined} />
          </>
        )}

        {/* ── Tab: UTM ── */}
        {activeTab === 'utm' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>🔗 Origem do Tráfego (UTMs)</div>
            {Object.keys(summary.utmSourceBreakdown).length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '40px 0' }}>
                Nenhum lead com parâmetro UTM registrado ainda.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 0', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Fonte (utm_source)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>Leads</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>Presença</th>
                      <th style={{ padding: '8px 0', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Show Up %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.utmSourceBreakdown)
                      .sort(([, a], [, b]) => b.count - a.count)
                      .map(([source, data]) => {
                        const showUpPct = data.count > 0 ? (data.attended / data.count) * 100 : 0
                        const barPct = (data.count / (summary.totalLeads || 1)) * 100
                        return (
                          <tr key={source} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '10px 0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 80, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                                  <div style={{ width: `${barPct}%`, height: '100%', background: '#818cf8', borderRadius: 99 }} />
                                </div>
                                <span style={{ fontWeight: 600 }}>{source}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>{data.count}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#10b981', fontWeight: 700 }}>{data.attended}</td>
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
          </>
        )}

        {/* ── Tab: Linha do Tempo dos Leads ── */}
        {activeTab === 'leads' && (() => {
          const getLeadQualification = (watchTime: number, duration: number, clickedCta: boolean) => {
            const ratio = duration > 0 ? watchTime / duration : 0
            if (ratio >= 0.7 && clickedCta) {
              return { label: '🔥 Hot', color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)' }
            } else if (ratio >= 0.4) {
              return { label: '🟡 Warm', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.2)' }
            } else {
              return { label: '❄️ Cold', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)' }
            }
          }

          const filteredSessions = summary.sessions.filter(session => {
            const qual = getLeadQualification(session.watch_time, durationSeconds, session.clicked_cta)
            if (leadFilter === 'all') return true
            if (leadFilter === 'hot') return qual.label.includes('Hot')
            if (leadFilter === 'warm') return qual.label.includes('Warm')
            if (leadFilter === 'cold') return qual.label.includes('Cold')
            return true
          })

          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>👥 Linha do Tempo dos Leads ({filteredSessions.length})</div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Exibindo até 100 leads mais ativos</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Qualificação:</span>
                  <select
                    value={leadFilter}
                    onChange={(e) => setLeadFilter(e.target.value as any)}
                    className="form-input"
                    style={{ fontSize: 12, padding: '4px 8px', width: 140, height: 'auto', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="all">Todos os Leads</option>
                    <option value="hot">🔥 Hot ({'>'}70% + CTA)</option>
                    <option value="warm">🟡 Warm ({'>'}40%)</option>
                    <option value="cold">❄️ Cold (≤40%)</option>
                  </select>
                </div>
              </div>
              
              {filteredSessions.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: 13 }}>
                  Nenhum lead correspondente a esta qualificação.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Lead</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Local / Disp.</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>Tempo Assistido</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>Qualificação</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>CTA Clicado</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSessions.map((session) => {
                        const minutes = Math.floor(session.watch_time / 60)
                        const seconds = session.watch_time % 60
                        const watchStr = minutes > 0 ? `${minutes} min ${seconds}s` : `${seconds}s`
                        const deviceIcon = session.device === 'Mobile' ? '📱' : session.device === 'Tablet' ? '📟' : '💻'
                        const qual = getLeadQualification(session.watch_time, durationSeconds, session.clicked_cta)
                      
                      return (
                        <tr key={session.session_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} className="hover-row">
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{session.lead_name}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{session.lead_email || 'Não cadastrado'}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                              <span>{session.country === 'Desconhecido' ? '🌍 Outro' : `📍 ${session.country}`}</span>
                              <span style={{ opacity: 0.3 }}>•</span>
                              <span>{deviceIcon} {session.device}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700 }}>
                            {watchStr}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{
                              background: qual.bg, color: qual.color, border: `1px solid ${qual.border}`,
                              padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                              whiteSpace: 'nowrap'
                            }}>
                              {qual.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {session.clicked_cta ? (
                              <span style={{
                                background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.25)',
                                padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700
                              }}>
                                🛒 Sim
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {session.lead_phone ? (
                                <a
                                  href={getWhatsAppUrl(session.lead_phone, session.lead_name)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)',
                                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', transition: 'all 0.2s'
                                  }}
                                  className="wa-btn"
                                >
                                  💬 Contatar
                                </a>
                              ) : (
                                <button
                                  disabled
                                  style={{
                                    background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'not-allowed', opacity: 0.5
                                  }}
                                >
                                  Sem Telefone
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedSession(session)}
                                style={{
                                  background: 'rgba(99,102,241,0.1)', color: 'var(--brand-light)', border: '1px solid rgba(99,102,241,0.2)',
                                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                                }}
                              >
                                🔍 Timeline
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
          )
        })()}

        {/* ── Tab: Comparativo de Runs ── */}
        {activeTab === 'comparison' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>📊 Comparativo de Retenção Multisseção</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Comparação direta das curvas de retenção das últimas 5 runs encerradas</span>
              </div>
            </div>

            {loadingCompare ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 10 }}>
                <span className="spinner" style={{ width: 30, height: 30, border: '3px solid var(--border)', borderTopColor: 'var(--brand)', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando dados das sessões...</span>
              </div>
            ) : compareRunsList.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: 13 }}>
                Não há execuções anteriores encerradas registradas para comparar.
              </div>
            ) : (
              <div>
                {/* Legenda colorida para cada linha do comparativo */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20, justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 16px', border: '1px solid var(--border)' }}>
                  {compareRunsList.map((run, idx) => {
                    const colors = ['#38bdf8', '#34d399', '#facc15', '#f472b6', '#a78bfa']
                    const color = colors[idx % colors.length]
                    return (
                      <span key={run.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ width: 12, height: 3, background: color, display: 'inline-block', borderRadius: 2 }} />
                        <strong>{run.title || new Date(run.started_at).toLocaleDateString('pt-BR')}</strong>
                      </span>
                    )
                  })}
                </div>

                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={compareRunsData} margin={{ top: 15, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time_seconds" stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} dy={10} tickFormatter={formatChartTime} minTickGap={28} />
                    <YAxis domain={[0, 100]} stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} dx={-5} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div style={{
                            background: 'rgba(10,12,20,0.97)', backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
                            padding: '12px 16px', fontSize: 12, color: '#fff',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                          }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                              Tempo: {formatChartTime(label ?? 0)}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {payload.map((p, idx) => (
                                <span key={idx} style={{ color: p.color }}>
                                  {p.name}: <b>{p.value}%</b>
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      }}
                    />
                    {compareRunsList.map((run, idx) => {
                      const colors = ['#38bdf8', '#34d399', '#facc15', '#f472b6', '#a78bfa']
                      const color = colors[idx % colors.length]
                      const title = run.title || new Date(run.started_at).toLocaleDateString('pt-BR')
                      return (
                        <Line
                          key={run.id}
                          type="monotone"
                          dataKey={title}
                          name={title}
                          stroke={color}
                          strokeWidth={2.5}
                          dot={false}
                        />
                      )
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Funnel + Engagement (2-col) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, marginBottom: 24 }}>

        {/* Funnel */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>⏳ Funil de Performance</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData} margin={{ top: 40, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#4b5563"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                dy={10}
                tickFormatter={val => val.split('. ')[1]}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                stroke="#4b5563"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dx={-5}
                tickFormatter={v => `${v}%`}
              />
              <Bar
                dataKey="pct"
                radius={[6, 6, 0, 0]}
                fill="#3b82f6"
                background={{ fill: 'rgba(59, 130, 246, 0.08)', radius: 6 }}
                barSize={50}
              >
                <LabelList dataKey="pct" content={renderFunnelLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 20, padding: 14, background: 'var(--bg-elevated)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            {summary.totalLeads === 0 && '📋 Nenhum lead registrado ainda.'}
            {summary.totalLeads > 0 && summary.joined < summary.totalLeads * 0.5 && (
              <div style={{ color: '#eab308', marginBottom: 4 }}>⚠️ Menos de 50% dos leads entrou na sala. Reforce os e-mails de lembrete.</div>
            )}
            {summary.joined > 0 && summary.progress50 < summary.joined * 0.4 && (
              <div style={{ color: '#f97316', marginBottom: 4 }}>⚠️ Muitos saem antes da metade. Revise o gancho inicial.</div>
            )}
            {summary.conversionRate >= 5 && (
              <div style={{ color: '#22c55e' }}>✅ Boa conversão! Considere escalar o tráfego.</div>
            )}
            {summary.conversionRate > 0 && summary.conversionRate < 3 && (
              <div style={{ color: '#ef4444' }}>🔴 Conversão abaixo de 3%. Revise a oferta e o timing do CTA.</div>
            )}
          </div>
        </div>

        {/* Engagement */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>💬 Engajamento & Quiz</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total de mensagens', value: summary.chatMessagesCount, color: '#6366f1', sub: 'reais (não simuladas)' },
              { label: 'Usuários ativos no chat', value: summary.chatUniqueSenders, color: '#3b82f6', sub: 'enviaram ≥1 msg' },
              { label: 'Respostas de quiz', value: summary.quizResponsesCount, color: '#10b981', sub: 'total de envios' },
              { label: 'Pontuação média quiz', value: `${summary.quizAvgScore}%`, color: '#eab308', sub: 'acurácia média' },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🔥 Hot Leads (Top Comentaristas)</h4>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, overflow: 'hidden' }}>
            {summary.topChatters.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Nenhum lead comentou ainda.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {summary.topChatters.slice(0, 6).map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600 }}>
                        <span style={{ color: i === 0 ? '#facc15' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : 'var(--text-muted)', marginRight: 8 }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </span>
                        {c.author}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#6366f1' }}>
                        {c.messages} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>msgs</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Pitch A/B Performance ── */}
      {Object.keys(summary.pitchPerformance).length > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>🛒 A/B — Performance do Botão de Oferta</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {Object.entries(summary.pitchPerformance)
              .sort(([, a], [, b]) => b.clicks - a.clicks)
              .map(([image, data], index) => {
                const isTop = index === 0
                return (
                  <div key={image} style={{
                    background: 'var(--bg-elevated)', borderRadius: 12, padding: 16,
                    border: isTop ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border)',
                    position: 'relative', display: 'flex', flexDirection: 'column', gap: 12,
                  }}>
                    {isTop && (
                      <div style={{ position: 'absolute', top: -10, right: 14, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 10 }}>
                        🏆 VENCEDOR
                      </div>
                    )}
                    {image !== 'sem-imagem' ? (
                      <div style={{ width: '100%', height: 110, borderRadius: 8, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={image} alt="Pitch CTA" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: 110, borderRadius: 8, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        (Apenas texto)
                      </div>
                    )}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#f97316' }}>{data.clicks}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Cliques Gerados</div>
                    </div>
                    {data.text && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', fontStyle: 'italic', background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: 6 }}>
                        &quot;{data.text}&quot;
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ── Bottom Actions ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href={`/admin/projects/${id}/webinars/${wid}/events`} className="btn btn-secondary btn-sm">
          ⚡ Configurar Eventos
        </Link>
        <Link href={`/admin/projects/${id}/webinars/${wid}/live`} className="btn btn-ghost btn-sm">
          🎬 Controle de Live
        </Link>
        <Link href={`/admin/projects/${id}/webinars/${wid}/registrants`} className="btn btn-ghost btn-sm">
          👤 Ver Leads
        </Link>
      </div>

      {/* ── Modal: Session Timeline ── */}
      {selectedSession && (() => {
        const session = selectedSession
        const minutes = Math.floor(session.watch_time / 60)
        const seconds = session.watch_time % 60
        const watchStr = minutes > 0 ? `${minutes} min ${seconds}s` : `${seconds}s`
        const filteredEvents = session.events.filter(e => e.type !== 'watch_second')
        
        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20,
          }} onClick={() => setSelectedSession(null)}>
            
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }} onClick={e => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div style={{
                padding: '20px 24px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-elevated)',
              }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                    👤 {session.lead_name}
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{session.lead_email || 'Visitante Sem E-mail'}</span>
                    {session.lead_phone && (
                      <>
                        <span style={{ opacity: 0.3 }}>•</span>
                        <span>{session.lead_phone}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSession(null)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-muted)',
                    fontSize: 20, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Stats Grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
                  padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Tempo Assistido</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand-light)' }}>{watchStr}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Dispositivo / OS</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{session.device} ({session.os})</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Localização</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📍 {session.country}</div>
                  </div>
                </div>

                {/* Vertical Timeline */}
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>🕒 Linha do Tempo de Ações</h4>
                  
                  {filteredEvents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                      Nenhum evento interativo registrado para esta sessão.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', paddingLeft: 12 }}>
                      {/* Line connecting nodes */}
                      <div style={{
                        position: 'absolute', top: 8, bottom: 8, left: 19, width: 2,
                        background: 'linear-gradient(180deg, rgba(99,102,241,0.3) 0%, rgba(255,255,255,0.05) 100%)'
                      }} />
                      
                      {filteredEvents.map((ev, i) => {
                        const disp = getEventDisplay(ev)
                        const formattedTime = new Date(ev.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        
                        return (
                          <div key={i} style={{ display: 'flex', gap: 16, position: 'relative', alignItems: 'flex-start' }}>
                            {/* Node Icon */}
                            <div style={{
                              width: 16, height: 16, borderRadius: '50%', background: 'var(--bg-card)',
                              border: `2.5px solid ${disp.color}`, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: `0 0 6px ${disp.color}40`, marginTop: 3
                            }} />
                            
                            {/* Content Block */}
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>{disp.icon}</span> {disp.title}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
                                  {formattedTime} {disp.timeStr && `(Víd. ${disp.timeStr})`}
                                </span>
                              </div>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                                {disp.desc}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px', borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--bg-elevated)',
              }}>
                {session.lead_phone && (
                  <a
                    href={getWhatsAppUrl(session.lead_phone, session.lead_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: '#22c55e', color: '#fff', border: 'none',
                      padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
                      boxShadow: '0 4px 12px rgba(34,197,94,0.2)'
                    }}
                  >
                    💬 Falar no WhatsApp
                  </a>
                )}
                <button
                  onClick={() => setSelectedSession(null)}
                  style={{
                    background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                    padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Fechar
                </button>
              </div>

            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWhatsAppUrl(phone: string, name: string) {
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11 || cleaned.length === 10) {
    cleaned = '55' + cleaned
  }
  const message = `Olá ${name}, tudo bem? Vi que você assistiu ao nosso webinar. Gostaria de tirar alguma dúvida ou saber mais sobre nossa oferta?`
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`
}

function getEventDisplay(ev: SessionEventDetail) {
  const timeStr = ev.timestamp !== null && ev.timestamp !== undefined
    ? (() => {
        const m = Math.floor(ev.timestamp / 60)
        const s = ev.timestamp % 60
        return `${m}:${s.toString().padStart(2, '0')}`
      })()
    : null

  switch (ev.type) {
    case 'page_view':
      return {
        icon: '📄',
        title: 'Acessou a Página',
        desc: 'O lead carregou a página do webinar.',
        color: '#60a5fa',
        timeStr,
      }
    case 'joined':
      return {
        icon: '🚪',
        title: 'Entrou na Sala',
        desc: 'O lead entrou na sala do webinar e está pronto.',
        color: '#34d399',
        timeStr,
      }
    case 'play_started':
      return {
        icon: '▶️',
        title: 'Iniciou o Vídeo',
        desc: 'O lead deu play e começou a assistir ao vídeo.',
        color: '#a78bfa',
        timeStr,
      }
    case 'progress_50':
      return {
        icon: '⏱️',
        title: 'Metade Assistida (50%)',
        desc: 'O lead atingiu a marca de 50% de reprodução do vídeo.',
        color: '#eab308',
        timeStr,
      }
    case 'watch_milestone_30min':
      return {
        icon: '🔥',
        title: 'Engajamento Elevado (30 min)',
        desc: 'O lead completou 30 minutos de reprodução assistida.',
        color: '#ec4899',
        timeStr,
      }
    case 'cta_clicked':
      return {
        icon: '🛒',
        title: 'Clicou no CTA',
        desc: ev.details ? `Clicou no botão: "${ev.details}"` : 'Clicou no botão de oferta (CTA).',
        color: '#f97316',
        timeStr,
      }
    case 'chat_sent':
      return {
        icon: '💬',
        title: 'Mensagem no Chat',
        desc: ev.details || 'Enviou uma mensagem no chat.',
        color: '#c084fc',
        timeStr,
      }
    default:
      return {
        icon: '⚡',
        title: ev.type,
        desc: ev.details || 'Ação registrada.',
        color: '#94a3b8',
        timeStr,
      }
  }
}
