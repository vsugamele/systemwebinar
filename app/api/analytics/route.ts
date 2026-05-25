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

    // Automatically mark lead as attended in the database
    const leadEmail = body.metadata?.lead_email as string | undefined
    if (leadEmail && body.webinar_id) {
      await supabase
        .from('webi_leads')
        .update({ attended: true })
        .eq('webinar_id', body.webinar_id)
        .eq('email', leadEmail.trim())
    }

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

    const mode = searchParams.get('mode') || 'all'

    // 1. Obter informações de início de sessão para filtrar testes/dados antigos se a sessão estiver ativa
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('session_started_at, duration_seconds')
      .eq('id', webinarId)
      .single()

    const sessionStart = mode === 'live' ? webinar?.session_started_at : null

    // Aggregate viewers by minute
    let sessionsQuery = supabase
      .from('webi_session_events')
      .select('session_id, event_type, timestamp_video')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'watch_second')

    if (sessionStart) {
      sessionsQuery = sessionsQuery.gte('created_at', sessionStart)
    }
    const { data: sessionsRaw } = await sessionsQuery

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

    // Leads and UTM breakdown
    const { data: leadsData } = await supabase
      .from('webi_leads')
      .select('id, attended, metadata')
      .eq('webinar_id', webinarId)

    const totalLeads = leadsData?.length || 0
    const totalAttended = leadsData?.filter(l => l.attended)?.length || 0

    const utmSourceBreakdown: Record<string, { count: number; attended: number }> = {}
    leadsData?.forEach(lead => {
      const meta = (lead.metadata as Record<string, any>) || {}
      const source = meta.utm_source || meta.source || 'Direto / Orgânico'
      if (!utmSourceBreakdown[source]) {
        utmSourceBreakdown[source] = { count: 0, attended: 0 }
      }
      utmSourceBreakdown[source].count++
      if (lead.attended) {
        utmSourceBreakdown[source].attended++
      }
    })

    // CTA & Popup clicks/views
    let ctaQuery = supabase
      .from('webi_session_events').select('metadata, timestamp_video')
      .eq('webinar_id', webinarId).eq('event_type', 'cta_clicked')

    if (sessionStart) {
      ctaQuery = ctaQuery.gte('created_at', sessionStart)
    }
    const { data: ctaClickEvents } = await ctaQuery

    const ctaClicks = ctaClickEvents?.length || 0
    const pitchPerformance: Record<string, { clicks: number; text?: string }> = {}
    const clicksByMinute: Record<number, number> = {}

    ctaClickEvents?.forEach(ev => {
      // 1. A/B Testing Pitch
      const meta = ev.metadata as Record<string, any>
      if (meta && meta.source === 'pitch_button') {
        const image = meta.pitch_image || 'sem-imagem'
        if (!pitchPerformance[image]) {
          pitchPerformance[image] = { clicks: 0, text: meta.pitch_text }
        }
        pitchPerformance[image].clicks++
      }

      // 2. Clicks by Minute (Mapa de Conversão)
      if (ev.timestamp_video !== null && ev.timestamp_video !== undefined) {
        const minute = Math.floor(ev.timestamp_video / 60)
        if (!clicksByMinute[minute]) clicksByMinute[minute] = 0
        clicksByMinute[minute]++
      }
    })

    const clicksByMinuteArray = Object.entries(clicksByMinute)
      .map(([minute, clicks]) => ({ minute: Number(minute), clicks }))
      .sort((a, b) => a.minute - b.minute)

    let popupQuery = supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'popup_seen')

    let joinedQuery = supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'joined')

    let progressQuery = supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'progress_50')

    if (sessionStart) {
      popupQuery = popupQuery.gte('created_at', sessionStart)
      joinedQuery = joinedQuery.gte('created_at', sessionStart)
      progressQuery = progressQuery.gte('created_at', sessionStart)
    }

    const { count: popupSeen } = await popupQuery
    const { count: uniqueJoined } = await joinedQuery
    const { count: progress50 } = await progressQuery

    // Chat metrics
    let chatMessagesCount = 0
    let chatUniqueSenders = 0
    let topChatters: { author: string, messages: number }[] = []
    try {
      let chatQuery = supabase
        .from('webi_live_chat')
        .select('session_id, author')
        .eq('webinar_id', webinarId)
        .eq('is_simulated', false)

      if (sessionStart) {
        chatQuery = chatQuery.gte('created_at', sessionStart)
      }
      const { data: chatMessages } = await chatQuery

      chatMessagesCount = chatMessages?.length || 0
      chatUniqueSenders = new Set(chatMessages?.map(c => c.session_id) || []).size

      // Top Chatters (Hot Leads)
      const chattersMap: Record<string, number> = {}
      chatMessages?.forEach(c => {
        const author = c.author || 'Anônimo'
        if (!chattersMap[author]) chattersMap[author] = 0
        chattersMap[author]++
      })
      topChatters = Object.entries(chattersMap)
        .map(([author, messages]) => ({ author, messages }))
        .sort((a, b) => b.messages - a.messages)
        .slice(0, 10) // Top 10
    } catch (err) {
      console.warn('Erro ao ler mensagens de chat do banco para analytics:', err)
    }

    // Quiz metrics
    let quizResponsesCount = 0
    let quizAvgScore = 0
    try {
      let quizQuery = supabase
        .from('webi_quiz_responses')
        .select('score')
        .eq('webinar_id', webinarId)

      if (sessionStart) {
        quizQuery = quizQuery.gte('created_at', sessionStart)
      }
      const { data: quizResponses } = await quizQuery

      quizResponsesCount = quizResponses?.length || 0
      quizAvgScore = quizResponsesCount > 0
        ? quizResponses!.reduce((acc, r) => acc + (r.score || 0), 0) / quizResponsesCount
        : 0
    } catch (err) {
      console.warn('Erro ao ler respostas de quiz do banco para analytics:', err)
    }

    return NextResponse.json({
      total_leads: totalLeads,
      total_attended: totalAttended,
      joined: uniqueJoined || 0,
      cta_clicks: ctaClicks || 0,
      popup_seen: popupSeen || 0,
      progress_50: progress50 || 0,
      chat_messages_count: chatMessagesCount,
      chat_unique_senders: chatUniqueSenders,
      top_chatters: topChatters,
      quiz_responses_count: quizResponsesCount,
      quiz_avg_score: Math.round(quizAvgScore),
      utm_source_breakdown: utmSourceBreakdown,
      pitch_performance: pitchPerformance,
      viewers_by_minute: viewersByMinute,
      clicks_by_minute: clicksByMinuteArray,
      is_live_active: !!webinar?.session_started_at,
      duration_seconds: webinar?.duration_seconds || 3600,
    })
  } catch (error: any) {
    console.error('Error in /api/analytics:', error)
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message || String(error) }, { status: 500 })
  }
}
