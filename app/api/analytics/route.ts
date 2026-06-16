import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { imperioSend } from '@/lib/imperio'
import { getResend } from '@/lib/resend'
import {
  countUniqueSessions,
  getAudienceAtMinute,
  getAverageEngagementPct,
  getWatchDeltaSeconds,
  shouldMarkLeadAttended,
} from '@/lib/analytics-metrics.mjs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = await createServiceClient()
    const metadata = body.metadata || {}

    if (body.event_type === 'watch_second') {
      const timestampVideo = Number(body.timestamp_video)
      const bucketSeconds = 5
      const bucketStartSeconds = Number.isFinite(timestampVideo) && timestampVideo >= 0
        ? Math.floor(timestampVideo / bucketSeconds) * bucketSeconds
        : 0
      const rawDelta = Number(metadata.watch_delta_seconds)
      const watchDeltaSeconds = Number.isFinite(rawDelta) && rawDelta > 0
        ? Math.round(rawDelta)
        : bucketSeconds

      const { error: retentionError } = await supabase
        .from('webi_retention_buckets')
        .upsert({
          session_id: body.session_id,
          webinar_id: body.webinar_id,
          project_id: body.project_id,
          bucket_seconds: bucketSeconds,
          bucket_start_seconds: bucketStartSeconds,
          watch_delta_seconds: watchDeltaSeconds,
          sample_count: 1,
          session_mode: typeof metadata.session_mode === 'string' ? metadata.session_mode : null,
          lead_email: typeof metadata.lead_email === 'string' ? metadata.lead_email : null,
          lead_name: typeof metadata.lead_name === 'string' ? metadata.lead_name : null,
          lead_phone: typeof metadata.lead_phone === 'string' ? metadata.lead_phone : null,
          user_agent: typeof metadata.user_agent === 'string' ? metadata.user_agent : null,
          timezone: typeof metadata.timezone === 'string' ? metadata.timezone : null,
          last_timestamp_video: Number.isFinite(timestampVideo) ? Math.round(timestampVideo) : null,
          metadata,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'webinar_id,session_id,bucket_seconds,bucket_start_seconds' })

      if (retentionError) {
        throw retentionError
      }
    } else {
      const { error: eventError } = await supabase.from('webi_session_events').insert({
        session_id: body.session_id,
        webinar_id: body.webinar_id,
        project_id: body.project_id,
        event_type: body.event_type,
        timestamp_video: body.timestamp_video,
        metadata,
      })

      if (eventError) {
        throw eventError
      }
    }

    // Automatically mark lead as attended in the database
    const leadEmail = metadata?.lead_email as string | undefined
    if (leadEmail && body.webinar_id && shouldMarkLeadAttended(body.event_type)) {
      await supabase
        .from('webi_leads')
        .update({ attended: true })
        .eq('webinar_id', body.webinar_id)
        .eq('email', leadEmail.trim())
    }

    // Imperio HQ — dispatch on key events (fire-and-forget, never block response)
    const imperioProjectId = metadata?.imperio_project_id as string | undefined
    if (imperioProjectId) {
      const leadEmail = metadata?.lead_email as string | undefined
      const leadName = metadata?.lead_name as string | undefined
      const leadPhone = metadata?.lead_phone as string | undefined

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
      const emailId = metadata?.email_id as string
      const rawSubject = metadata?.subject as string
      const rawBody = metadata?.body as string
      const leadEmail = metadata?.lead_email as string
      const leadName = metadata?.lead_name as string || 'Espectador'
      const webinarName = metadata?.webinar_name as string || ''

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

    const rawMode = searchParams.get('session_mode') || searchParams.get('mode') || 'all'
    const mode = ['all', 'live', 'replay', 'evergreen'].includes(rawMode) ? rawMode : 'all'
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const campaign = (searchParams.get('campaign') || '').trim().toLowerCase()
    const requestedBucketSeconds = Number(searchParams.get('bucket_seconds') || 60)
    const bucketSeconds = Number.isFinite(requestedBucketSeconds)
      ? Math.min(300, Math.max(5, Math.round(requestedBucketSeconds)))
      : 60

    const toDateStartIso = (value: string | null) => {
      if (!value) return null
      const parsed = new Date(`${value}T00:00:00.000Z`)
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
    }
    const toDateEndIso = (value: string | null) => {
      if (!value) return null
      const parsed = new Date(`${value}T23:59:59.999Z`)
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
    }
    const dateFromIso = toDateStartIso(dateFrom)
    const dateToIso = toDateEndIso(dateTo)

    // 1. Obter informações de início de sessão para filtrar testes/dados antigos se a sessão estiver ativa
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('session_started_at, duration_seconds, analytics_pitch_minute')
      .eq('id', webinarId)
      .single()

    const sessionStart = mode === 'live' ? webinar?.session_started_at : null

    const applyEventFilters = (query: any) => {
      let filtered = query
      if (sessionStart) filtered = filtered.gte('created_at', sessionStart)
      if (dateFromIso) filtered = filtered.gte('created_at', dateFromIso)
      if (dateToIso) filtered = filtered.lte('created_at', dateToIso)
      if (mode === 'replay' || mode === 'evergreen') {
        filtered = filtered.filter('metadata->>session_mode', 'eq', mode)
      }
      if (mode === 'live' && !sessionStart) {
        filtered = filtered.filter('metadata->>session_mode', 'eq', 'live')
      }
      return filtered
    }

    const applyCreatedAtFilters = (query: any) => {
      let filtered = query
      if (sessionStart) filtered = filtered.gte('created_at', sessionStart)
      if (dateFromIso) filtered = filtered.gte('created_at', dateFromIso)
      if (dateToIso) filtered = filtered.lte('created_at', dateToIso)
      return filtered
    }

    const applyRetentionFilters = (query: any) => {
      let filtered = query
      if (sessionStart) filtered = filtered.gte('updated_at', sessionStart)
      if (dateFromIso) filtered = filtered.gte('updated_at', dateFromIso)
      if (dateToIso) filtered = filtered.lte('updated_at', dateToIso)
      if (mode === 'replay' || mode === 'evergreen') {
        filtered = filtered.eq('session_mode', mode)
      }
      if (mode === 'live' && !sessionStart) {
        filtered = filtered.eq('session_mode', 'live')
      }
      return filtered
    }

    const applyLeadFilters = (query: any) => {
      let filtered = query
      if (dateFromIso) filtered = filtered.gte('registered_at', dateFromIso)
      if (dateToIso) filtered = filtered.lte('registered_at', dateToIso)
      return filtered
    }

    const matchesCampaign = (metadata: Record<string, any>) => {
      if (!campaign) return true
      const values = [
        metadata.utm_source,
        metadata.utm_campaign,
        metadata.utm_medium,
        metadata.source,
        metadata.campaign,
      ]
      return values.some(value => String(value || '').toLowerCase().includes(campaign))
    }

    // Leads and UTM breakdown
    let leadsQuery = supabase
      .from('webi_leads')
      .select('id, email, name, phone, attended, metadata')
      .eq('webinar_id', webinarId)
    leadsQuery = applyLeadFilters(leadsQuery)
    const { data: leadsRaw } = await leadsQuery
    const leadsData = (leadsRaw || []).filter(lead => matchesCampaign((lead.metadata as Record<string, any>) || {}))
    const campaignLeadEmails = campaign
      ? new Set(leadsData.map(lead => lead.email?.trim().toLowerCase()).filter(Boolean))
      : null

    const filterEventRowsByCampaign = <T extends { metadata?: any }>(rows: T[] | null | undefined): T[] => {
      const allRows = rows || []
      if (!campaignLeadEmails) return allRows
      return allRows.filter(row => {
        const meta = (row.metadata as Record<string, any>) || {}
        const email = typeof meta.lead_email === 'string' ? meta.lead_email.trim().toLowerCase() : ''
        return !!email && campaignLeadEmails.has(email)
      })
    }

    const filterRetentionRowsByCampaign = <T extends { metadata?: any; lead_email?: string | null }>(rows: T[] | null | undefined): T[] => {
      const allRows = rows || []
      if (!campaignLeadEmails) return allRows
      return allRows.filter(row => {
        const meta = (row.metadata as Record<string, any>) || {}
        const email = typeof row.lead_email === 'string'
          ? row.lead_email.trim().toLowerCase()
          : typeof meta.lead_email === 'string'
            ? meta.lead_email.trim().toLowerCase()
            : ''
        return !!email && campaignLeadEmails.has(email)
      })
    }

    // Aggregate viewers by minute
    let sessionsQuery = supabase
      .from('webi_session_events')
      .select('session_id, event_type, timestamp_video, metadata')
      .eq('webinar_id', webinarId)
      .eq('event_type', 'watch_second')

    sessionsQuery = applyEventFilters(sessionsQuery)
    const { data: sessionsRaw } = await sessionsQuery
    const sessionsEvents = filterEventRowsByCampaign(sessionsRaw)

    let retentionQuery = supabase
      .from('webi_retention_buckets')
      .select('session_id, bucket_seconds, bucket_start_seconds, watch_delta_seconds, session_mode, lead_email, lead_name, lead_phone, user_agent, timezone, metadata, created_at, updated_at')
      .eq('webinar_id', webinarId)

    retentionQuery = applyRetentionFilters(retentionQuery)
    const { data: retentionRaw } = await retentionQuery
    const retentionBuckets = filterRetentionRowsByCampaign(retentionRaw)

    // Build viewers per minute and finer interval buckets for VTurb-style retention charts.
    const minuteMap = new Map<number, Set<string>>()
    const intervalMap = new Map<number, Set<string>>()
    const legacyWatchBucketKeys = new Set<string>()
    sessionsEvents?.forEach(s => {
      if (s.timestamp_video !== null) {
        const minute = Math.floor(s.timestamp_video / 60)
        if (!minuteMap.has(minute)) minuteMap.set(minute, new Set())
        minuteMap.get(minute)!.add(s.session_id)

        const bucketStart = Math.floor(s.timestamp_video / bucketSeconds) * bucketSeconds
        if (!intervalMap.has(bucketStart)) intervalMap.set(bucketStart, new Set())
        intervalMap.get(bucketStart)!.add(s.session_id)

        const nativeBucketStart = Math.floor(s.timestamp_video / 5) * 5
        legacyWatchBucketKeys.add(`${s.session_id}:${nativeBucketStart}`)
      }
    })
    retentionBuckets?.forEach(bucket => {
      const timestampVideo = Number(bucket.bucket_start_seconds)
      if (!Number.isFinite(timestampVideo) || timestampVideo < 0) return

      const minute = Math.floor(timestampVideo / 60)
      if (!minuteMap.has(minute)) minuteMap.set(minute, new Set())
      minuteMap.get(minute)!.add(bucket.session_id)

      const intervalBucketStart = Math.floor(timestampVideo / bucketSeconds) * bucketSeconds
      if (!intervalMap.has(intervalBucketStart)) intervalMap.set(intervalBucketStart, new Set())
      intervalMap.get(intervalBucketStart)!.add(bucket.session_id)
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

    const viewersByInterval = Array.from(intervalMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([timeSeconds, sessions]) => ({
        time_seconds: timeSeconds,
        viewers: sessions.size,
      }))
    const intervalPeakViewers = viewersByInterval.reduce((max, v) => Math.max(max, v.viewers), 1)
    const viewersByIntervalPct = viewersByInterval.map(v => ({
      ...v,
      retention_pct: Math.round((v.viewers / intervalPeakViewers) * 100),
    }))

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

    joinedEventsQuery = applyEventFilters(joinedEventsQuery)
    const { data: joinedEventsRaw } = await joinedEventsQuery
    const joinedEvents = filterEventRowsByCampaign(joinedEventsRaw)

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

    joinedEvents?.forEach(ev => {
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

    ctaQuery = applyEventFilters(ctaQuery)
    const { data: ctaClickEventsRaw } = await ctaQuery
    const ctaClickEvents = filterEventRowsByCampaign(ctaClickEventsRaw)

    const ctaClicks = ctaClickEvents?.length || 0
    const pitchPerformance: Record<string, { clicks: number; text?: string }> = {}
    const clicksByMinute: Record<number, number> = {}
    const clicksByInterval: Record<number, number> = {}

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

        const bucketStart = Math.floor(ev.timestamp_video / bucketSeconds) * bucketSeconds
        if (!clicksByInterval[bucketStart]) clicksByInterval[bucketStart] = 0
        clicksByInterval[bucketStart]++
      }
    })

    const clicksByMinuteArray = Object.entries(clicksByMinute)
      .map(([minute, clicks]) => ({ minute: Number(minute), clicks }))
      .sort((a, b) => a.minute - b.minute)
    const clicksByIntervalArray = Object.entries(clicksByInterval)
      .map(([timeSeconds, clicks]) => ({ time_seconds: Number(timeSeconds), clicks }))
      .sort((a, b) => a.time_seconds - b.time_seconds)

    let popupQuery = supabase
      .from('webi_session_events').select('session_id, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'popup_seen')

    let joinedQuery = supabase
      .from('webi_session_events').select('session_id, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'joined')

    let progress25Query = supabase
      .from('webi_session_events').select('session_id, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'progress_25')

    let progressQuery = supabase
      .from('webi_session_events').select('session_id, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'progress_50')

    let progress75Query = supabase
      .from('webi_session_events').select('session_id, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'progress_75')

    let progress90Query = supabase
      .from('webi_session_events').select('session_id, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'progress_90')

    let pageViewQuery = supabase
      .from('webi_session_events').select('session_id, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'page_view')

    let playStartedQuery = supabase
      .from('webi_session_events').select('session_id, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'play_started')

    let pitchSeenQuery = supabase
      .from('webi_session_events').select('timestamp_video, metadata')
      .eq('webinar_id', webinarId).eq('event_type', 'popup_seen')

    popupQuery = applyEventFilters(popupQuery)
    joinedQuery = applyEventFilters(joinedQuery)
    progress25Query = applyEventFilters(progress25Query)
    progressQuery = applyEventFilters(progressQuery)
    progress75Query = applyEventFilters(progress75Query)
    progress90Query = applyEventFilters(progress90Query)
    pageViewQuery = applyEventFilters(pageViewQuery)
    playStartedQuery = applyEventFilters(playStartedQuery)
    pitchSeenQuery = applyEventFilters(pitchSeenQuery)

    const { data: popupSeenRowsRaw } = await popupQuery
    const { data: joinedRowsRaw } = await joinedQuery
    const { data: progress25RowsRaw } = await progress25Query
    const { data: progress50RowsRaw } = await progressQuery
    const { data: progress75RowsRaw } = await progress75Query
    const { data: progress90RowsRaw } = await progress90Query
    const { data: pageViewRowsRaw } = await pageViewQuery
    const { data: playRowsRaw } = await playStartedQuery
    const { data: pitchSeenEventsRaw } = await pitchSeenQuery
    const popupSeenRows = filterEventRowsByCampaign(popupSeenRowsRaw)
    const joinedRows = filterEventRowsByCampaign(joinedRowsRaw)
    const progress25Rows = filterEventRowsByCampaign(progress25RowsRaw)
    const progress50Rows = filterEventRowsByCampaign(progress50RowsRaw)
    const progress75Rows = filterEventRowsByCampaign(progress75RowsRaw)
    const progress90Rows = filterEventRowsByCampaign(progress90RowsRaw)
    const pageViewRows = filterEventRowsByCampaign(pageViewRowsRaw)
    const playRows = filterEventRowsByCampaign(playRowsRaw)
    const pitchSeenEvents = filterEventRowsByCampaign(pitchSeenEventsRaw)
    const popupSeen = popupSeenRows.length
    const uniqueJoined = countUniqueSessions(joinedRows || [])
    const progress25 = progress25Rows.length
    const progress50 = progress50Rows.length
    const progress75 = progress75Rows.length
    const progress90 = progress90Rows.length
    const pageViews = pageViewRows?.length || 0
    const uniquePageViews = countUniqueSessions(pageViewRows || [])
    const plays = playRows?.length || 0
    const uniquePlays = countUniqueSessions(playRows || [])

    const playRate = uniquePageViews > 0 ? (uniquePlays / uniquePageViews) * 100 : 0

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

      chatQuery = applyCreatedAtFilters(chatQuery)
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

      quizQuery = applyCreatedAtFilters(quizQuery)
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

    timelineEventsQuery = applyEventFilters(timelineEventsQuery)
    const { data: timelineEventsRaw } = await timelineEventsQuery
    const timelineEvents = filterEventRowsByCampaign(timelineEventsRaw)

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

    retentionBuckets?.forEach(bucket => {
      const sid = bucket.session_id
      const bucketStart = Number(bucket.bucket_start_seconds)
      if (!sid || !Number.isFinite(bucketStart)) return
      if (legacyWatchBucketKeys.has(`${sid}:${bucketStart}`)) return

      if (!sessionMap.has(sid)) {
        sessionMap.set(sid, {
          session_id: sid,
          lead_name: 'Visitante AnÃ´nimo',
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
      const meta = (bucket.metadata as Record<string, any>) || {}
      const leadName = bucket.lead_name || meta.lead_name
      const leadEmail = bucket.lead_email || meta.lead_email
      const leadPhone = bucket.lead_phone || meta.lead_phone
      const ua = bucket.user_agent || meta.user_agent || ''
      const tz = bucket.timezone || meta.timezone || ''
      const watchDelta = Number(bucket.watch_delta_seconds)

      if (ua) {
        entry.device = parseDevice(ua)
        entry.browser = parseBrowser(ua)
        entry.os = parseOS(ua)
      }
      if (tz) {
        entry.country = tzToCountry(tz)
      }
      if (leadName) entry.lead_name = leadName
      if (leadEmail) entry.lead_email = leadEmail
      if (leadPhone) entry.lead_phone = leadPhone
      entry.watch_time += Number.isFinite(watchDelta) && watchDelta > 0
        ? watchDelta
        : Number(bucket.bucket_seconds) || 5
    })

    // 3. Process Chat Messages & Group by minute / finer interval
    const chatMinuteMap = new Map<number, number>()
    const chatIntervalMap = new Map<number, number>()
    chatMessagesRaw?.forEach(c => {
      if (c.timestamp !== null && c.timestamp !== undefined) {
        const minute = Math.floor(c.timestamp / 60)
        chatMinuteMap.set(minute, (chatMinuteMap.get(minute) || 0) + 1)

        const bucketStart = Math.floor(c.timestamp / bucketSeconds) * bucketSeconds
        chatIntervalMap.set(bucketStart, (chatIntervalMap.get(bucketStart) || 0) + 1)
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
    const chatByIntervalArray = Array.from(chatIntervalMap.entries())
      .map(([timeSeconds, messages]) => ({ time_seconds: timeSeconds, messages }))
      .sort((a, b) => a.time_seconds - b.time_seconds)

    const sessionsArray = Array.from(sessionMap.values())
      .sort((a, b) => b.watch_time - a.watch_time)
      .slice(0, 100)

    // Pitch at minute (first pitch exposure, fallback to first CTA click for legacy data)
    const pitchSeenMinutes = (pitchSeenEvents || [])
      .filter(ev => {
        const meta = (ev.metadata as Record<string, any>) || {}
        return meta.type === 'pitch'
      })
      .map(ev => ev.timestamp_video)
      .filter((timestamp): timestamp is number => typeof timestamp === 'number' && timestamp >= 0)
      .map(timestamp => Math.floor(timestamp / 60))
      .sort((a, b) => a - b)
    const configuredPitchMinute = typeof webinar?.analytics_pitch_minute === 'number' && webinar.analytics_pitch_minute >= 0
      ? webinar.analytics_pitch_minute
      : null
    const pitchAtMinute = configuredPitchMinute ?? pitchSeenMinutes[0] ?? (clicksByMinuteArray.length > 0 ? clicksByMinuteArray[0].minute : null)
    const pitchAudience = pitchAtMinute !== null
      ? getAudienceAtMinute(viewersByMinute, pitchAtMinute, peakViewers)
      : { audience: 0, retention_pct: 0 }
    const averageEngagementPct = getAverageEngagementPct(sessionsArray, webinar?.duration_seconds || 3600)

    return NextResponse.json({
      total_leads: totalLeads,
      total_attended: totalAttended,
      joined: uniqueJoined || 0,
      cta_clicks: ctaClicks || 0,
      popup_seen: popupSeen || 0,
      progress_25: progress25 || 0,
      progress_50: progress50 || 0,
      progress_75: progress75 || 0,
      progress_90: progress90 || 0,
      page_views: pageViews || 0,
      unique_page_views: uniquePageViews || 0,
      plays: plays || 0,
      unique_plays: uniquePlays || 0,
      play_rate: Math.round(playRate),
      peak_viewers: peakViewers,
      average_engagement_pct: averageEngagementPct,
      chat_messages_count: chatMessagesCount,
      chat_unique_senders: chatUniqueSenders,
      top_chatters: topChatters,
      quiz_responses_count: quizResponsesCount,
      quiz_avg_score: Math.round(quizAvgScore),
      utm_source_breakdown: utmSourceBreakdown,
      pitch_performance: pitchPerformance,
      viewers_by_minute: viewersByMinutePct,
      viewers_by_interval: viewersByIntervalPct,
      clicks_by_minute: clicksByMinuteArray,
      clicks_by_interval: clicksByIntervalArray,
      chat_by_minute: chatByMinuteArray,
      chat_by_interval: chatByIntervalArray,
      retention_bucket_seconds: bucketSeconds,
      sessions: sessionsArray,
      pitch_at_minute: pitchAtMinute,
      retention_at_pitch: pitchAudience.retention_pct,
      audience_at_pitch: pitchAudience.audience,
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
