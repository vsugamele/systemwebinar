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

    // "Online agora" = sessões únicas que enviaram watch_second nos últimos 90s
    const windowSeconds = 90
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString()

    const { data: activeSessions } = await supabase
      .from('webi_session_events')
      .select('session_id')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'watch_second')
      .gte('created_at', since)

    const onlineNow = new Set(activeSessions?.map(s => s.session_id) ?? []).size

    // Pico de simultâneos de hoje (janela dos últimos 3 dias)
    // Agrupa watch_second por minuto e pega o max de sessões únicas
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const { data: allRecentEvents } = await supabase
      .from('webi_session_events')
      .select('session_id, created_at')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'watch_second')
      .gte('created_at', threeDaysAgo)

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
    const { data: joinedSessions } = await supabase
      .from('webi_session_events')
      .select('session_id')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'joined')

    const totalJoined = new Set(joinedSessions?.map(s => s.session_id) ?? []).size

    // Sessões que saíram (event_type = 'left') nos últimos 5 min (saídas recentes)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: recentLeft } = await supabase
      .from('webi_session_events')
      .select('session_id')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'left')
      .gte('created_at', fiveMinAgo)

    const recentDropoffs = new Set(recentLeft?.map(s => s.session_id) ?? []).size

    // CTAs clicados nesta sessão (últimas 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentCTAs } = await supabase
      .from('webi_session_events')
      .select('session_id')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'cta_clicked')
      .gte('created_at', oneDayAgo)

    const recentCTAClicks = new Set(recentCTAs?.map(s => s.session_id) ?? []).size

    return NextResponse.json({
      online_now: onlineNow,
      peak_simultaneous: peakSimultaneous,
      total_joined: totalJoined,
      recent_dropoffs: recentDropoffs,
      recent_cta_clicks: recentCTAClicks,
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
