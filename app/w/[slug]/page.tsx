import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import WebinarRoom from '@/components/WebinarRoom'

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
        openrouter_api_key
      )
    `)
    .eq('slug', slug)

  if (!isTest) {
    query = query.eq('status', 'active')
  }

  const { data: webinar } = await query.single()

  if (!webinar) return notFound()

  // Flatten project fields onto webinar for convenience
  const project = (webinar as Record<string, unknown> & { webi_projects?: { brand_color?: string | null; openrouter_api_key?: string | null; name?: string } | null }).webi_projects || {}

  // Compute effective session_started_at for recurring schedules
  function computeEffectiveStart(w: typeof webinar): string | null {
    const rec = (w as Record<string, unknown>).schedule_recurrence as string | undefined
    if (!rec || rec === 'once') return w.session_started_at ?? null
    const timeStr = ((w as Record<string, unknown>).schedule_time as string) ?? '00:00'
    const [hh, mm] = timeStr.split(':').map(Number)
    const now = new Date()
    const candidate = new Date(now)
    candidate.setHours(hh, mm, 0, 0)

    if (rec === 'daily') {
      if (candidate > now) candidate.setDate(candidate.getDate() - 1)
      return candidate.toISOString()
    }
    if (rec === 'weekly') {
      const days = ((w as Record<string, unknown>).schedule_days as number[]) ?? []
      for (let i = 0; i <= 7; i++) {
        const d = new Date(candidate)
        d.setDate(d.getDate() - i)
        if (days.includes(d.getDay()) && d <= now) return d.toISOString()
      }
      return null
    }
    if (rec === 'monthly') {
      const src = w.scheduled_start_at ? new Date(w.scheduled_start_at) : now
      candidate.setDate(src.getDate())
      if (candidate > now) candidate.setMonth(candidate.getMonth() - 1)
      return candidate.toISOString()
    }
    return w.session_started_at ?? null
  }

  const enrichedWebinar = {
    ...webinar,
    session_started_at: computeEffectiveStart(webinar),
    brand_color: project.brand_color || '#6366f1',
    openrouter_api_key: project.openrouter_api_key,
    project_name: project.name,
  }

  const { data: events } = await supabase
    .from('webi_events')
    .select('*')
    .eq('webinar_id', webinar.id)
    .order('timestamp_seconds')

  return <WebinarRoom webinar={enrichedWebinar} events={events || []} />
}

