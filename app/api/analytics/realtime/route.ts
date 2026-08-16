import { NextRequest, NextResponse } from 'next/server'
import { createPureServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SessionRow = {
  session_id: string
  created_at?: string
  timestamp_video?: number | null
  metadata?: Record<string, any> | null
}

type RetentionRow = {
  session_id: string
  bucket_start_seconds: number
  watch_delta_seconds: number
  updated_at: string
  metadata?: Record<string, any> | null
}

type ChatRow = {
  session_id: string
  timestamp_video: number | null
  created_at: string
}

function uniqueCount(rows: { session_id: string }[] | null | undefined) {
  return new Set((rows || []).map(row => row.session_id).filter(Boolean)).size
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function minuteFromSeconds(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds)) return 0
  return Math.max(0, Math.floor(Number(seconds) / 60))
}

function isoMax(a: string, b: string) {
  return a > b ? a : b
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const webinarId = searchParams.get('webinar_id')
    if (!webinarId) {
      return NextResponse.json({ error: 'webinar_id required' }, { status: 400 })
    }

    const supabase = createPureServiceClient()

    const [{ data: webinar }, { data: pitchEvents }] = await Promise.all([
      supabase
        .from('webi_webinars')
        .select('session_started_at, current_run_id, duration_seconds, analytics_pitch_minute')
        .eq('id', webinarId)
        .single(),
      supabase
        .from('webi_events')
        .select('timestamp_seconds')
        .eq('webinar_id', webinarId)
        .eq('type', 'pitch_button')
        .order('timestamp_seconds', { ascending: true })
        .limit(1),
    ])

    const sessionStart = webinar?.session_started_at as string | null | undefined
    const currentRunId = webinar?.current_run_id as string | null | undefined
    const durationSeconds = Number(webinar?.duration_seconds) || 3600
    const elapsedSeconds = sessionStart
      ? Math.max(0, Math.floor((Date.now() - new Date(sessionStart).getTime()) / 1000))
      : 0
    const currentVideoMinute = minuteFromSeconds(elapsedSeconds)
    const configuredPitchMinute = typeof webinar?.analytics_pitch_minute === 'number'
      ? webinar.analytics_pitch_minute
      : null
    const eventPitchMinute = pitchEvents?.[0]?.timestamp_seconds != null
      ? minuteFromSeconds(pitchEvents[0].timestamp_seconds)
      : null
    const pitchAtMinute = configuredPitchMinute ?? eventPitchMinute

    const windowSeconds = 90
    const nowIso = new Date().toISOString()
    const sessionFloor = sessionStart || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const activeSince = sessionStart
      ? isoMax(sessionStart, new Date(Date.now() - windowSeconds * 1000).toISOString())
      : new Date(Date.now() - windowSeconds * 1000).toISOString()
    const last5mSince = sessionStart
      ? isoMax(sessionStart, new Date(Date.now() - 5 * 60 * 1000).toISOString())
      : new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const last60sSince = sessionStart
      ? isoMax(sessionStart, new Date(Date.now() - 60 * 1000).toISOString())
      : new Date(Date.now() - 60 * 1000).toISOString()

    const withRun = (query: any) => currentRunId ? query.eq('run_id', currentRunId) : query

    const [
      activeEventsResult,
      activeBucketsResult,
      joinedResult,
      leftResult,
      ctaResult,
      recentClicksResult,
      retentionResult,
      chatResult,
      pitchSeenResult,
    ] = await Promise.all([
      withRun(supabase
        .from('webi_session_events')
        .select('session_id')
        .eq('webinar_id', webinarId)
        .eq('event_type', 'watch_second')
        .gte('created_at', activeSince)),
      withRun(supabase
        .from('webi_retention_buckets')
        .select('session_id')
        .eq('webinar_id', webinarId)
        .gte('updated_at', activeSince)),
      withRun(supabase
        .from('webi_session_events')
        .select('session_id, created_at, metadata')
        .eq('webinar_id', webinarId)
        .eq('event_type', 'joined')
        .gte('created_at', sessionFloor)),
      withRun(supabase
        .from('webi_session_events')
        .select('session_id')
        .eq('webinar_id', webinarId)
        .eq('event_type', 'left')
        .gte('created_at', last5mSince)),
      withRun(supabase
        .from('webi_session_events')
        .select('session_id, timestamp_video, created_at, metadata')
        .eq('webinar_id', webinarId)
        .eq('event_type', 'cta_clicked')
        .gte('created_at', sessionFloor)),
      withRun(supabase
        .from('webi_session_events')
        .select('session_id, created_at, metadata')
        .eq('webinar_id', webinarId)
        .eq('event_type', 'cta_clicked')
        .gte('created_at', sessionFloor)
        .order('created_at', { ascending: false })
        .limit(8)),
      withRun(supabase
        .from('webi_retention_buckets')
        .select('session_id, bucket_start_seconds, watch_delta_seconds, updated_at, metadata')
        .eq('webinar_id', webinarId)
        .gte('updated_at', sessionFloor)
        .limit(8000)),
      withRun(supabase
        .from('webi_live_chat')
        .select('session_id, timestamp_video, created_at')
        .eq('webinar_id', webinarId)
        .eq('is_simulated', false)
        .gte('created_at', sessionFloor)
        .limit(3000)),
      withRun(supabase
        .from('webi_session_events')
        .select('session_id, timestamp_video, created_at, metadata')
        .eq('webinar_id', webinarId)
        .eq('event_type', 'popup_seen')
        .gte('created_at', sessionFloor)),
    ])

    const activeEvents = (activeEventsResult.data || []) as SessionRow[]
    const activeRetentionBuckets = (activeBucketsResult.data || []) as SessionRow[]
    const joinedRows = (joinedResult.data || []) as SessionRow[]
    const leftRows = (leftResult.data || []) as SessionRow[]
    const ctaRows = (ctaResult.data || []) as SessionRow[]
    const retentionRows = (retentionResult.data || []) as RetentionRow[]
    const chatRows = (chatResult.data || []) as ChatRow[]
    const pitchSeenRows = ((pitchSeenResult.data || []) as SessionRow[])
      .filter(row => row.metadata?.type === 'pitch')

    const onlineSessions = new Set<string>()
    activeEvents.forEach(row => onlineSessions.add(row.session_id))
    activeRetentionBuckets.forEach(row => onlineSessions.add(row.session_id))

    const totalJoined = uniqueCount(joinedRows)
    const onlineNow = onlineSessions.size
    const recentDropoffs = uniqueCount(leftRows)
    const recentCTAClicks = uniqueCount(ctaRows)
    const pitchSeen = uniqueCount(pitchSeenRows)
    const ctaLast5m = uniqueCount(ctaRows.filter(row => row.created_at && row.created_at >= last5mSince))

    const retentionMinuteMap = new Map<number, Set<string>>()
    const watchTimeBySession = new Map<string, number>()

    retentionRows.forEach(row => {
      const minute = minuteFromSeconds(row.bucket_start_seconds)
      if (!retentionMinuteMap.has(minute)) retentionMinuteMap.set(minute, new Set())
      retentionMinuteMap.get(minute)!.add(row.session_id)
      watchTimeBySession.set(row.session_id, (watchTimeBySession.get(row.session_id) || 0) + (Number(row.watch_delta_seconds) || 0))
    })

    const peakSimultaneous = retentionMinuteMap.size > 0
      ? Math.max(...Array.from(retentionMinuteMap.values()).map(sessions => sessions.size))
      : onlineNow
    const peakRetention = Math.max(peakSimultaneous, totalJoined, 1)

    const clicksByMinute = new Map<number, Set<string>>()
    ctaRows.forEach(row => {
      const minute = minuteFromSeconds(row.timestamp_video)
      if (!clicksByMinute.has(minute)) clicksByMinute.set(minute, new Set())
      clicksByMinute.get(minute)!.add(row.session_id)
    })

    const chatByMinute = new Map<number, number>()
    chatRows.forEach(row => {
      const minute = minuteFromSeconds(row.timestamp_video)
      chatByMinute.set(minute, (chatByMinute.get(minute) || 0) + 1)
    })

    const timelineMaxMinute = Math.max(
      currentVideoMinute,
      Math.ceil(durationSeconds / 60),
      ...Array.from(retentionMinuteMap.keys()),
      ...Array.from(clicksByMinute.keys()),
      ...Array.from(chatByMinute.keys()),
      pitchAtMinute ?? 0,
    )
    const timelineStart = Math.max(0, currentVideoMinute - 20)
    const timelineEnd = Math.min(timelineMaxMinute, Math.max(currentVideoMinute + 5, timelineStart + 12))
    const videoTimeline = Array.from({ length: Math.max(0, timelineEnd - timelineStart + 1) }, (_, idx) => {
      const minute = timelineStart + idx
      const viewers = retentionMinuteMap.get(minute)?.size || 0
      return {
        minute,
        label: `${minute}m`,
        viewers,
        retention_pct: pct(viewers, peakRetention),
        cta_clicks: clicksByMinute.get(minute)?.size || 0,
        chat_messages: chatByMinute.get(minute) || 0,
        is_pitch: pitchAtMinute === minute,
        is_current: currentVideoMinute === minute,
      }
    })

    const pitchViewers = pitchAtMinute !== null
      ? retentionMinuteMap.get(pitchAtMinute)?.size || 0
      : 0
    const pitchBase = Math.max(pitchSeen, pitchViewers, 0)
    const pitchCtr = pct(recentCTAClicks, pitchBase)
    const currentRetentionPct = pct(onlineNow, Math.max(totalJoined, 1))
    const twoMinutesAgoViewers = retentionMinuteMap.get(Math.max(0, currentVideoMinute - 2))?.size || 0
    const audienceDeltaPct2m = twoMinutesAgoViewers > 0
      ? Math.round(((onlineNow - twoMinutesAgoViewers) / twoMinutesAgoViewers) * 100)
      : 0

    const avgWatchSeconds = watchTimeBySession.size > 0
      ? Math.round(Array.from(watchTimeBySession.values()).reduce((sum, value) => sum + value, 0) / watchTimeBySession.size)
      : 0
    const chatLast5m = chatRows.filter(row => row.created_at >= last5mSince).length
    const chatLast60s = chatRows.filter(row => row.created_at >= last60sSince).length
    const activeChattersLast5m = uniqueCount(chatRows.filter(row => row.created_at >= last5mSince))

    const alerts: string[] = []
    if (totalJoined > 10 && currentRetentionPct < 45) {
      alerts.push(`Retencao atual baixa: ${currentRetentionPct}% dos participantes iniciais ainda estao ativos.`)
    }
    if (audienceDeltaPct2m <= -20) {
      alerts.push(`Queda de audiencia nos ultimos 2 minutos: ${audienceDeltaPct2m}%.`)
    }
    if (pitchAtMinute !== null && currentVideoMinute >= pitchAtMinute + 5 && pitchCtr < 2) {
      alerts.push(`Pitch ja rodou e o CTR esta em ${pitchCtr}%. Reforce o CTA no chat ou antecipe uma objecao.`)
    }
    if (chatLast5m === 0 && onlineNow >= 10) {
      alerts.push('Chat sem interacao nos ultimos 5 minutos apesar de audiencia ativa.')
    }

    const recentClicksList = ((recentClicksResult.data || []) as SessionRow[]).map(row => ({
      id: `${row.session_id}_${row.created_at}`,
      session_id: row.session_id,
      created_at: row.created_at || nowIso,
      lead_name: row.metadata?.lead_name || 'Alguém',
      lead_email: row.metadata?.lead_email || '',
    }))

    return NextResponse.json({
      online_now: onlineNow,
      peak_simultaneous: peakSimultaneous,
      total_joined: totalJoined,
      recent_dropoffs: recentDropoffs,
      recent_cta_clicks: recentCTAClicks,
      recent_clicks_list: recentClicksList,
      window_seconds: windowSeconds,
      updated_at: nowIso,
      session_started_at: sessionStart || null,
      current_run_id: currentRunId || null,
      duration_seconds: durationSeconds,
      elapsed_seconds: elapsedSeconds,
      current_video_minute: currentVideoMinute,
      current_retention_pct: currentRetentionPct,
      audience_delta_pct_2m: audienceDeltaPct2m,
      average_watch_seconds: avgWatchSeconds,
      pitch_at_minute: pitchAtMinute,
      pitch_viewers: pitchViewers,
      pitch_seen: pitchSeen,
      pitch_ctr: pitchCtr,
      cta_last_5m: ctaLast5m,
      chat_messages_last_5m: chatLast5m,
      chat_messages_last_60s: chatLast60s,
      active_chatters_last_5m: activeChattersLast5m,
      video_timeline: videoTimeline,
      alerts,
    })
  } catch (error: any) {
    console.error('Error in /api/analytics/realtime:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
