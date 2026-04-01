import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import WebinarRoom from '@/components/WebinarRoom'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: w } = await supabase.from('webi_webinars').select('name, description').eq('slug', slug).single()
  return {
    title: w?.name ? `${w.name} | Ao Vivo` : 'Webinar ao Vivo',
    description: w?.description || 'Participe do nosso webinar.',
    icons: {
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎬</text></svg>',
    },
    openGraph: {
      title: w?.name ? `${w.name} | Ao Vivo` : 'Webinar ao Vivo',
      description: w?.description || 'Participe do nosso webinar.',
    }
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
  const enrichedWebinar = {
    ...webinar,
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

