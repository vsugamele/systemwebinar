import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = await createServiceClient()

    await supabase.from('webi_session_events').insert({
      session_id: body.session_id,
      webinar_id: body.webinar_id,
      project_id: body.project_id,
      event_type: body.event_type,
      timestamp_video: body.timestamp_video,
      metadata: body.metadata || {},
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const webinarId = searchParams.get('webinar_id')
    if (!webinarId) return NextResponse.json({ error: 'webinar_id required' }, { status: 400 })

    const supabase = await createServiceClient()

    // Aggregate viewers by minute
    const { data: sessionsRaw } = await supabase
      .from('webi_session_events')
      .select('session_id, event_type, timestamp_video')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'watch_second')

    // Build viewers per minute
    const minuteMap = new Map<number, Set<string>>()
    sessionsRaw?.forEach(s => {
      if (s.timestamp_video !== null) {
        const minute = Math.floor(s.timestamp_video / 60)
        if (!minuteMap.has(minute)) minuteMap.set(minute, new Set())
        minuteMap.get(minute)!.add(s.session_id)
      }
    })

    const viewersByMinute = Array.from(minuteMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([minute, sessions]) => ({ minute, viewers: sessions.size }))

    // Other aggregates
    const { count: totalLeads } = await supabase
      .from('webi_leads').select('id', { count: 'exact', head: true }).eq('webinar_id', webinarId)

    const { count: ctaClicks } = await supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'cta_clicked')

    const { count: popupSeen } = await supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'popup_seen')

    const { count: uniqueJoined } = await supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'joined')

    return NextResponse.json({
      total_leads: totalLeads || 0,
      joined: uniqueJoined || 0,
      cta_clicks: ctaClicks || 0,
      popup_seen: popupSeen || 0,
      viewers_by_minute: viewersByMinute,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
