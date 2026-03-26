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

export default async function WebinarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: webinar } = await supabase
    .from('webi_webinars')
    .select('*, webi_projects(name, accent_color)')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (!webinar) return notFound()

  const { data: events } = await supabase
    .from('webi_events')
    .select('*')
    .eq('webinar_id', webinar.id)
    .order('timestamp_seconds')

  return <WebinarRoom webinar={webinar} events={events || []} />
}
