import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import WebinarRoom from '@/components/WebinarRoom'
import RegistrationGate from '@/components/RegistrationGate'
import { cookies } from 'next/headers'

// Force every request to be server-rendered so session_started_at is always fresh
// Without this, CDN/Next.js edge cache returns stale session offsets
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050508',
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: w } = await supabase.from('webi_webinars').select('name, description, thumbnail_url').eq('slug', slug).single()
  const title = w?.name ? `${w.name} | Ao Vivo` : 'Webinar ao Vivo'
  const description = w?.description || 'Participe do nosso webinar ao vivo.'
  return {
    title,
    description,
    icons: {
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎬</text></svg>',
    },
    openGraph: {
      title,
      description,
      type: 'video.other',
      ...(w?.thumbnail_url && { images: [{ url: w.thumbnail_url, width: 1200, height: 630 }] }),
    },
    other: {
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
      'mobile-web-app-capable': 'yes',
    },
  }
}

export default async function WebinarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ test?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const isTest = sp?.test === '1'

  const supabase = await createClient()

  // Allow any status when in test mode, otherwise require active
  let query = supabase
    .from('webi_webinars')
    .select(`
      *,
      webi_projects(
        id,
        name,
        brand_color,
        openrouter_api_key,
        timezone,
        imperio_project_id
      )
    `)
    .eq('slug', slug)

  if (!isTest) {
    query = query.eq('status', 'active')
  }

  const { data: webinar } = await query.single()

  if (!webinar) return notFound()

  // Squeeze Page Logic
  const cookieStore = await cookies()
  const hasLeadCookie = cookieStore.get(`webi_lead_id_${webinar.id}`)
  
  // Flatten project fields onto webinar for convenience
  const project = (webinar as Record<string, unknown> & { webi_projects?: { brand_color?: string | null; openrouter_api_key?: string | null; name?: string; timezone?: string | null; imperio_project_id?: string | null } | null }).webi_projects || {}
  const projectTimezone = (project as { timezone?: string | null }).timezone || 'America/Sao_Paulo'

  type WebinarRow = typeof webinar

  /**
   * Returns a Date representing baseDate's calendar date in `tz`, at hh:mm local time.
   * Correctly handles DST and non-integer UTC offsets.
   */
  function getScheduledDate(baseDate: Date, hh: number, mm: number, tz: string): Date {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    const parts = fmt.formatToParts(baseDate)
    const y = parts.find(p => p.type === 'year')!.value
    const mo = parts.find(p => p.type === 'month')!.value
    const d = parts.find(p => p.type === 'day')!.value
    const isoLocal = `${y}-${mo}-${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
    // Trick: parse as UTC, then compute actual offset of that TZ at that moment
    const guessUTC = new Date(isoLocal + 'Z')
    const tzOffset =
      new Date(guessUTC.toLocaleString('en-US', { timeZone: tz })).getTime() -
      new Date(guessUTC.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
    return new Date(guessUTC.getTime() - tzOffset)
  }

  /** Next upcoming scheduled occurrence (future), or null if nothing ahead */
  function computeNextScheduledStart(w: WebinarRow): string | null {
    const rec = (w as Record<string, unknown>).schedule_recurrence as string | undefined
    if (!rec || rec === 'once') {
      const sat = w.scheduled_start_at
      if (sat && new Date(sat) > new Date()) return sat
      return null
    }
    const timeStr = ((w as Record<string, unknown>).schedule_time as string) ?? '00:00'
    const [hh, mm] = timeStr.split(':').map(Number)
    const now = new Date()
    const candidate = getScheduledDate(now, hh, mm, projectTimezone)

    if (rec === 'daily') {
      if (candidate <= now) return getScheduledDate(new Date(now.getTime() + 86400000), hh, mm, projectTimezone).toISOString()
      return candidate.toISOString()
    }
    if (rec === 'weekly') {
      const days = ((w as Record<string, unknown>).schedule_days as number[]) ?? []
      for (let i = 1; i <= 8; i++) {
        const base = new Date(now.getTime() + i * 86400000)
        const d = getScheduledDate(base, hh, mm, projectTimezone)
        // Use local weekday in project timezone (not UTC) to match computeEffectiveStart
        const localDay = new Date(base.toLocaleString('en-US', { timeZone: projectTimezone })).getDay()
        if (days.includes(localDay)) return d.toISOString()
      }
      return null
    }
    if (rec === 'monthly') {
      const src = w.scheduled_start_at ? new Date(w.scheduled_start_at) : now
      const dayOfMonth = new Date(src.toLocaleString('en-US', { timeZone: projectTimezone })).getDate()
      const thisMonthCandidate = getScheduledDate(now, hh, mm, projectTimezone)
      // Force day-of-month using UTC arithmetic
      const adjusted = new Date(thisMonthCandidate)
      adjusted.setUTCDate(adjusted.getUTCDate() + (dayOfMonth - new Date(thisMonthCandidate.toLocaleString('en-US', { timeZone: projectTimezone })).getDate()))
      if (adjusted <= now) adjusted.setMonth(adjusted.getMonth() + 1)
      return adjusted.toISOString()
    }
    return null
  }

  /** Most recent past occurrence of the schedule, or null if session hasn't started yet today */
  function computeEffectiveStart(w: WebinarRow): string | null {
    const rec = (w as Record<string, unknown>).schedule_recurrence as string | undefined

    if (!rec || rec === 'once') {
      if (w.session_started_at) return w.session_started_at
      // Use scheduled_start_at when it's already in the past (auto-evergreen for once)
      if (w.scheduled_start_at && new Date(w.scheduled_start_at) <= new Date()) {
        return w.scheduled_start_at
      }
      return null
    }

    // Recurring: find the most recent past occurrence
    const timeStr = ((w as Record<string, unknown>).schedule_time as string) ?? '00:00'
    const [hh, mm] = timeStr.split(':').map(Number)
    const now = new Date()
    // Today's occurrence at hh:mm in project timezone
    const todayCandidate = getScheduledDate(now, hh, mm, projectTimezone)

    if (rec === 'daily') {
      // If today's occurrence hasn't happened yet → no active session
      if (todayCandidate > now) return null
      return todayCandidate.toISOString()
    }
    if (rec === 'weekly') {
      const days = ((w as Record<string, unknown>).schedule_days as number[]) ?? []
      for (let i = 0; i <= 7; i++) {
        const base = new Date(now.getTime() - i * 86400000)
        const d = getScheduledDate(base, hh, mm, projectTimezone)
        // base.getDay() is UTC day — use locale day in project tz for accuracy
        const localDay = new Date(base.toLocaleString('en-US', { timeZone: projectTimezone })).getDay()
        if (days.includes(localDay) && d <= now) return d.toISOString()
      }
      return null
    }
    if (rec === 'monthly') {
      const src = w.scheduled_start_at ? new Date(w.scheduled_start_at) : now
      const dayOfMonth = new Date(src.toLocaleString('en-US', { timeZone: projectTimezone })).getDate()
      const thisMonthCandidate = getScheduledDate(now, hh, mm, projectTimezone)
      const adjusted = new Date(thisMonthCandidate)
      adjusted.setUTCDate(adjusted.getUTCDate() + (dayOfMonth - new Date(thisMonthCandidate.toLocaleString('en-US', { timeZone: projectTimezone })).getDate()))
      if (adjusted > now) adjusted.setMonth(adjusted.getMonth() - 1)
      return adjusted.toISOString()
    }
    return w.session_started_at ?? null
  }

  const [{ data: events }, { data: quizQs }] = await Promise.all([
    supabase.from('webi_events').select('*').eq('webinar_id', webinar.id).order('timestamp_seconds'),
    supabase.from('webi_quiz_questions').select('id').eq('webinar_id', webinar.id).limit(1),
  ])

  const nextScheduledStart = computeNextScheduledStart(webinar)
  const effectiveStart = computeEffectiveStart(webinar)

  // Determine if the session is currently running (not ended)
  const isSessionRunning = effectiveStart
    ? (Date.now() - new Date(effectiveStart).getTime()) / 1000 < (webinar.duration_seconds || 3600)
    : false

  // Compute countdown server-side so WebinarRoom gets the correct initial value
  // without needing Date.now() on the client (which causes SSR/hydration flash)
  const initialCountdownSeconds = nextScheduledStart
    ? Math.max(0, Math.ceil((new Date(nextScheduledStart).getTime() - Date.now()) / 1000))
    : 0

  const enrichedWebinar = {
    ...webinar,
    session_started_at: effectiveStart,
    next_scheduled_start: nextScheduledStart,
    has_quiz: (quizQs?.length ?? 0) > 0,
    brand_color: project.brand_color || '#6366f1',
    openrouter_api_key: project.openrouter_api_key,
    project_name: project.name,
    imperio_project_id: (project as { imperio_project_id?: string | null }).imperio_project_id || undefined,
  }

  const guestMode = !hasLeadCookie && !isTest

  return (
    <>
      {webinar.tracking_head_code && (
        <div dangerouslySetInnerHTML={{ __html: webinar.tracking_head_code }} />
      )}
      <WebinarRoom 
        webinar={enrichedWebinar} 
        events={events || []} 
        initialCountdownSeconds={initialCountdownSeconds}
        guestMode={guestMode}
      />
      {webinar.tracking_body_code && (
        <div dangerouslySetInnerHTML={{ __html: webinar.tracking_body_code }} />
      )}
    </>
  )
}
