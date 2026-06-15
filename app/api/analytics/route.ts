import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { imperioSend } from '@/lib/imperio'
import { getResend } from '@/lib/resend'
import {
  countUniqueSessions,
  getWatchDeltaSeconds,
  shouldMarkLeadAttended,
} from '@/lib/analytics-metrics.mjs'

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
    if (leadEmail && body.webinar_id && shouldMarkLeadAttended(body.event_type)) {
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
      .select('session_id, event_type, timestamp_video, metadata')
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

    // Peak viewers for retention %
    const peakViewers = viewersByMinute.reduce((max, v) => Math.max(max, v.viewers), 1)
    const viewersByMinutePct = viewersByMinute.map(v => ({
      ...v,
      retention_pct: Math.round((v.viewers / peakViewers) * 100),
    }))

    // Leads and UTM breakdown
    const { data: leadsData } = await supabase
      .from('webi_leads')
      .select('id, email, name, phone, attended, metadata')
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

    // Device/Browser/OS/Country breakdown from joined events
    let joinedEventsQuery = supabase
      .from('webi_session_events')
      .select('session_id, metadata')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'joined')

    if (sessionStart) {
      joinedEventsQuery = joinedEventsQuery.gte('created_at', sessionStart)
    }
    const { data: joinedEventsRaw } = await joinedEventsQuery

    function parseDevice(ua: string): string {
      if (/Mobi|Android/i.test(ua) && !/Tablet|iPad/i.test(ua)) return 'Mobile'
      if (/Tablet|iPad/i.test(ua)) return 'Tablet'
      return 'Desktop'
    }
    function parseBrowser(ua: string): string {
      if (/Edg\//i.test(ua)) return 'Edge'
      if (/OPR|Opera/i.test(ua)) return 'Opera'
      if (/Chrome/i.test(ua)) return 'Chrome'
      if (/Firefox/i.test(ua)) return 'Firefox'
      if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari'
      return 'Outro'
    }
    function parseOS(ua: string): string {
      if (/Windows/i.test(ua)) return 'Windows'
      if (/Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) return 'macOS'
      if (/iPhone|iPad/i.test(ua)) return 'iOS'
      if (/Android/i.test(ua)) return 'Android'
      if (/Linux/i.test(ua)) return 'Linux'
      return 'Outro'
    }
    function tzToCountry(tz: string): string {
      const map: Record<string, string> = {
        'America/Sao_Paulo': 'Brasil', 'America/Fortaleza': 'Brasil', 'America/Manaus': 'Brasil',
        'America/Belem': 'Brasil', 'America/Recife': 'Brasil', 'America/Bahia': 'Brasil',
        'America/Cuiaba': 'Brasil', 'America/Porto_Velho': 'Brasil', 'America/Boa_Vista': 'Brasil',
        'America/Noronha': 'Brasil', 'America/Rio_Branco': 'Brasil', 'America/Maceio': 'Brasil',
        'America/New_York': 'EUA', 'America/Chicago': 'EUA', 'America/Los_Angeles': 'EUA',
        'America/Denver': 'EUA', 'America/Phoenix': 'EUA', 'America/Anchorage': 'EUA',
        'America/Mexico_City': 'México', 'America/Bogota': 'Colômbia', 'America/Lima': 'Peru',
        'America/Santiago': 'Chile', 'America/Buenos_Aires': 'Argentina', 'America/Montevideo': 'Uruguai',
        'America/Caracas': 'Venezuela', 'America/La_Paz': 'Bolívia', 'America/Asuncion': 'Paraguai',
        'Europe/Lisbon': 'Portugal', 'Europe/Madrid': 'Espanha', 'Europe/London': 'Reino Unido',
        'Europe/Paris': 'França', 'Europe/Berlin': 'Alemanha', 'Europe/Rome': 'Itália',
        'Africa/Luanda': 'Angola', 'Africa/Maputo': 'Moçambique',
      }
      return map[tz] || tz?.split('/').pop()?.replace(/_/g, ' ') || 'Desconhecido'
    }

    const devicesBreakdown: Record<string, number> = {}
    const browsersBreakdown: Record<string, number> = {}
    const osBreakdown: Record<string, number> = {}
    const countriesBreakdown: Record<string, number> = {}
    const seenSessions = new Set<string>()

    joinedEventsRaw?.forEach(ev => {
      if (seenSessions.has(ev.session_id)) return
      seenSessions.add(ev.session_id)
      const meta = (ev.metadata as Record<string, any>) || {}
      const ua = (meta.user_agent as string) || ''
      const tz = (meta.timezone as string) || ''

      const device = parseDevice(ua)
      const browser = parseBrowser(ua)
      const os = parseOS(ua)
      const country = tzToCountry(tz)

      devicesBreakdown[device] = (devicesBreakdown[device] || 0) + 1
      browsersBreakdown[browser] = (browsersBreakdown[browser] || 0) + 1
      osBreakdown[os] = (osBreakdown[os] || 0) + 1
      countriesBreakdown[country] = (countriesBreakdown[country] || 0) + 1
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
      .from('webi_session_events').select('session_id')
      .eq('webinar_id', webinarId).eq('event_type', 'joined')

    let progressQuery = supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'progress_50')

    let pageViewQuery = supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'page_view')

    let playStartedQuery = supabase
      .from('webi_session_events').select('id', { count: 'exact', head: true })
      .eq('webinar_id', webinarId).eq('event_type', 'play_started')

    if (sessionStart) {
      popupQuery = popupQuery.gte('created_at', sessionStart)
      joinedQuery = joinedQuery.gte('created_at', sessionStart)
      progressQuery = progressQuery.gte('created_at', sessionStart)
      pageViewQuery = pageViewQuery.gte('created_at', sessionStart)
      playStartedQuery = playStartedQuery.gte('created_at', sessionStart)
    }

    const { count: popupSeen } = await popupQuery
    const { data: joinedRows } = await joinedQuery
    const uniqueJoined = countUniqueSessions(joinedRows || [])
    const { count: progress50 } = await progressQuery
    const { count: pageViews } = await pageViewQuery
    const { count: plays } = await playStartedQuery

    const playRate = pageViews && pageViews > 0 ? ((plays || 0) / pageViews) * 100 : 0

    // Chat metrics
    let chatMessagesCount = 0
    let chatUniqueSenders = 0
    let topChatters: { author: string, messages: number }[] = []
    let chatMessagesRaw: any[] = []
    try {
      let chatQuery = supabase
        .from('webi_live_chat')
        .select('session_id, author, text, timestamp, created_at')
        .eq('webinar_id', webinarId)
        .eq('is_simulated', false)

      if (sessionStart) {
        chatQuery = chatQuery.gte('created_at', sessionStart)
      }
      const { data: chatMessages } = await chatQuery
      chatMessagesRaw = chatMessages || []

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

    // Timeline sessions & Chat by minute
    let timelineEventsQuery = supabase
      .from('webi_session_events')
      .select('session_id, event_type, timestamp_video, metadata, created_at')
      .eq('webinar_id', webinarId)

    if (sessionStart) {
      timelineEventsQuery = timelineEventsQuery.gte('created_at', sessionStart)
    }
    const { data: timelineEvents } = await timelineEventsQuery

    // 1. Map leads by email for easy lookup
    const leadMapByEmail = new Map<string, { name: string; phone: string | null }>()
    leadsData?.forEach(lead => {
      if (lead.email) {
        leadMapByEmail.set(lead.email.trim().toLowerCase(), {
          name: lead.name,
          phone: lead.phone || null
        })
      }
    })

    // 2. Build session map
    const sessionMap = new Map<string, {
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
      events: {
        type: string
        timestamp: number | null
        created_at: string
        details?: string
      }[]
    }>()

    timelineEvents?.forEach(ev => {
      const sid = ev.session_id
      if (!sessionMap.has(sid)) {
        sessionMap.set(sid, {
          session_id: sid,
          lead_name: 'Visitante Anônimo',
          lead_email: '',
          lead_phone: null,
          device: 'Desktop',
          browser: 'Outro',
          os: 'Outro',
          country: 'Desconhecido',
          watch_time: 0,
          clicked_cta: false,
          events: []
        })
      }

      const entry = sessionMap.get(sid)!
      const meta = (ev.metadata as Record<string, any>) || {}

      if (ev.event_type === 'joined') {
        const ua = meta.user_agent || ''
        const tz = meta.timezone || ''
        entry.device = parseDevice(ua)
        entry.browser = parseBrowser(ua)
        entry.os = parseOS(ua)
        entry.country = tzToCountry(tz)

        if (meta.lead_name) entry.lead_name = meta.lead_name
        if (meta.lead_email) entry.lead_email = meta.lead_email
        if (meta.lead_phone) entry.lead_phone = meta.lead_phone
      }

      if (ev.event_type === 'watch_second') {
        entry.watch_time += getWatchDeltaSeconds(ev)
      }

      if (ev.event_type === 'cta_clicked') {
        entry.clicked_cta = true
      }

      // Add to timeline events
      entry.events.push({
        type: ev.event_type,
        timestamp: ev.timestamp_video,
        created_at: ev.created_at,
        details: ev.event_type === 'cta_clicked' ? (meta.source || undefined) : undefined
      })
    })

    // 3. Process Chat Messages & Group by minute
    const chatMinuteMap = new Map<number, number>()
    chatMessagesRaw?.forEach(c => {
      // Group by minute
      if (c.timestamp !== null && c.timestamp !== undefined) {
        const minute = Math.floor(c.timestamp / 60)
        chatMinuteMap.set(minute, (chatMinuteMap.get(minute) || 0) + 1)
      }

      // Add to lead timeline
      const sid = c.session_id
      if (sid) {
        if (!sessionMap.has(sid)) {
          sessionMap.set(sid, {
            session_id: sid,
            lead_name: c.author || 'Visitante Anônimo',
            lead_email: '',
            lead_phone: null,
            device: 'Desktop',
            browser: 'Outro',
            os: 'Outro',
            country: 'Desconhecido',
            watch_time: 0,
            clicked_cta: false,
            events: []
          })
        }
        const entry = sessionMap.get(sid)!
        entry.events.push({
          type: 'chat_sent',
          timestamp: c.timestamp,
          created_at: c.created_at,
          details: c.text
        })
      }
    })

    // Sort and finalize
    sessionMap.forEach(entry => {
      if (entry.lead_email) {
        const dbLead = leadMapByEmail.get(entry.lead_email.trim().toLowerCase())
        if (dbLead) {
          if (dbLead.name && entry.lead_name === 'Visitante Anônimo') entry.lead_name = dbLead.name
          if (dbLead.phone && !entry.lead_phone) entry.lead_phone = dbLead.phone
        }
      }
      entry.events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    })

    const chatByMinuteArray = Array.from(chatMinuteMap.entries())
      .map(([minute, messages]) => ({ minute, messages }))
      .sort((a, b) => a.minute - b.minute)

    const sessionsArray = Array.from(sessionMap.values())
      .sort((a, b) => b.watch_time - a.watch_time)
      .slice(0, 100)

    // Pitch at minute (first CTA click minute)
    const pitchAtMinute = clicksByMinuteArray.length > 0 ? clicksByMinuteArray[0].minute : null
    const retentionAtPitch = pitchAtMinute !== null
      ? (() => {
          const atPitch = viewersByMinute.find(v => v.minute === pitchAtMinute)
          return atPitch ? Math.round((atPitch.viewers / peakViewers) * 100) : 0
        })()
      : 0

    return NextResponse.json({
      total_leads: totalLeads,
      total_attended: totalAttended,
      joined: uniqueJoined || 0,
      cta_clicks: ctaClicks || 0,
      popup_seen: popupSeen || 0,
      progress_50: progress50 || 0,
      page_views: pageViews || 0,
      plays: plays || 0,
      play_rate: Math.round(playRate),
      peak_viewers: peakViewers,
      chat_messages_count: chatMessagesCount,
      chat_unique_senders: chatUniqueSenders,
      top_chatters: topChatters,
      quiz_responses_count: quizResponsesCount,
      quiz_avg_score: Math.round(quizAvgScore),
      utm_source_breakdown: utmSourceBreakdown,
      pitch_performance: pitchPerformance,
      viewers_by_minute: viewersByMinutePct,
      clicks_by_minute: clicksByMinuteArray,
      chat_by_minute: chatByMinuteArray,
      sessions: sessionsArray,
      pitch_at_minute: pitchAtMinute,
      retention_at_pitch: retentionAtPitch,
      devices_breakdown: devicesBreakdown,
      browsers_breakdown: browsersBreakdown,
      os_breakdown: osBreakdown,
      countries_breakdown: countriesBreakdown,
      is_live_active: !!webinar?.session_started_at,
      duration_seconds: webinar?.duration_seconds || 3600,
    })
  } catch (error: any) {
    console.error('Error in /api/analytics:', error)
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message || String(error) }, { status: 500 })
  }
}
