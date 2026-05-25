import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const webinarId = searchParams.get('webinar_id')
    if (!webinarId) {
      return NextResponse.json({ error: 'webinar_id required' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // 1. Obter início da sessão ativa para filtrar testes
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('session_started_at')
      .eq('id', webinarId)
      .single()

    const sessionStart = webinar?.session_started_at

    // "Online agora" = sessões únicas que enviaram watch_second nos últimos 90s
    const windowSeconds = 90
    let since = new Date(Date.now() - windowSeconds * 1000).toISOString()
    if (sessionStart && sessionStart > since) {
      since = sessionStart
    }

    const { data: activeSessions } = await supabase
      .from('webi_session_events')
      .select('session_id')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'watch_second')
      .gte('created_at', since)

    const onlineNow = new Set(activeSessions?.map(s => s.session_id) ?? []).size

    // Pico de simultâneos (últimos 3 dias ou desde o início da sessão)
    let peakSince = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    if (sessionStart) {
      peakSince = sessionStart
    }
    const { data: allRecentEvents } = await supabase
      .from('webi_session_events')
      .select('session_id, created_at')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'watch_second')
      .gte('created_at', peakSince)

    // Bucket por minuto, find max unique sessions
    const buckets = new Map<string, Set<string>>()
    for (const ev of allRecentEvents ?? []) {
      const minuteKey = ev.created_at.slice(0, 16) // "YYYY-MM-DDTHH:MM"
      if (!buckets.has(minuteKey)) buckets.set(minuteKey, new Set())
      buckets.get(minuteKey)!.add(ev.session_id)
    }
    const peakSimultaneous = buckets.size > 0
      ? Math.max(...Array.from(buckets.values()).map(s => s.size))
      : 0

    // Total de sessões únicas que já entraram na sala
    let joinedQuery = supabase
      .from('webi_session_events')
      .select('session_id')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'joined')

    if (sessionStart) {
      joinedQuery = joinedQuery.gte('created_at', sessionStart)
    }
    const { data: joinedSessions } = await joinedQuery

    const totalJoined = new Set(joinedSessions?.map(s => s.session_id) ?? []).size

    // Sessões que saíram (event_type = 'left') nos últimos 5 min
    let dropoffSince = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    if (sessionStart && sessionStart > dropoffSince) {
      dropoffSince = sessionStart
    }
    const { data: recentLeft } = await supabase
      .from('webi_session_events')
      .select('session_id')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'left')
      .gte('created_at', dropoffSince)

    const recentDropoffs = new Set(recentLeft?.map(s => s.session_id) ?? []).size

    // CTAs clicados nesta sessão (últimas 24h ou desde o início)
    let ctaSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    if (sessionStart) {
      ctaSince = sessionStart
    }
    const { data: recentCTAs } = await supabase
      .from('webi_session_events')
      .select('session_id')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'cta_clicked')
      .gte('created_at', ctaSince)

    const recentCTAClicks = new Set(recentCTAs?.map(s => s.session_id) ?? []).size

    // Buscar os últimos 5 cliques com metadados para feeds em tempo real (toasts)
    let recentClicksQuery = supabase
      .from('webi_session_events')
      .select('session_id, created_at, metadata')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'cta_clicked')
      .order('created_at', { ascending: false })
      .limit(5)

    if (sessionStart) {
      recentClicksQuery = recentClicksQuery.gte('created_at', sessionStart)
    }
    const { data: clicksList } = await recentClicksQuery
    const recentClicksList = (clicksList || []).map((c: any) => ({
      id: `${c.session_id}_${c.created_at}`,
      session_id: c.session_id,
      created_at: c.created_at,
      lead_name: c.metadata?.lead_name || 'Alguém',
      lead_email: c.metadata?.lead_email || '',
    }))

    return NextResponse.json({
      online_now: onlineNow,
      peak_simultaneous: peakSimultaneous,
      total_joined: totalJoined,
      recent_dropoffs: recentDropoffs,
      recent_cta_clicks: recentCTAClicks,
      recent_clicks_list: recentClicksList,
      window_seconds: windowSeconds,
      updated_at: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error in /api/analytics/realtime:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
