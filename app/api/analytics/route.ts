import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { imperioSend } from '@/lib/imperio'
import { getResend } from '@/lib/resend'

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

    // Imperio HQ — dispatch on key events (fire-and-forget, never block response)
    const imperioProjectId = body.metadata?.imperio_project_id as string | undefined
    if (imperioProjectId) {
      const leadEmail = body.metadata?.lead_email as string | undefined
      const leadName = body.metadata?.lead_name as string | undefined
      const leadPhone = body.metadata?.lead_phone as string | undefined

      if (body.event_type === 'joined' && leadEmail) {
        imperioSend({
          project_id: imperioProjectId,
          event_type: 'webinar_acessado',
          email: leadEmail,
          nome: leadName,
          phone: leadPhone,
          origem: `webinar-${body.webinar_id}`,
          tags: ['webinar-viewer'],
          metadata: { webinar_id: body.webinar_id, session_id: body.session_id },
        })
      }

      // 30-minute milestone — only dispatch once (client marks it in metadata)
      if (body.event_type === 'watch_milestone_30min' && leadEmail) {
        imperioSend({
          project_id: imperioProjectId,
          event_type: 'webinar_assistido',
          email: leadEmail,
          nome: leadName,
          phone: leadPhone,
          origem: `webinar-${body.webinar_id}`,
          tags: ['webinar-engajado'],
          metadata: { webinar_id: body.webinar_id, tempo_assistido_min: 30 },
        })
      }
    }

    // Custom in-webinar emails via Resend
    if (body.event_type === 'trigger_in_webinar_email') {
      const emailId = body.metadata?.email_id as string
      const rawSubject = body.metadata?.subject as string
      const rawBody = body.metadata?.body as string
      const leadEmail = body.metadata?.lead_email as string
      const leadName = body.metadata?.lead_name as string || 'Espectador'
      const webinarName = body.metadata?.webinar_name as string || ''

      if (leadEmail && rawSubject && rawBody) {
        // Evaluate variables
        const subject = rawSubject
          .replace(/{{name}}/g, leadName)
          .replace(/{{email}}/g, leadEmail)
          .replace(/{{webinar_name}}/g, webinarName)
        
        const content = rawBody
          .replace(/{{name}}/g, leadName)
          .replace(/{{email}}/g, leadEmail)
          .replace(/{{webinar_name}}/g, webinarName)
          .replace(/\n/g, '<br/>')

        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;line-height:1.6">
            ${content}
          </div>
        `

        try {
          const resend = getResend()
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
            to: leadEmail,
            subject,
            html,
          })
        } catch (e) {
          console.error('Failed to send in-webinar email:', e)
        }
      }
    }

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
