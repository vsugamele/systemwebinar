import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import WebinarRoom from '@/components/WebinarRoom'

export default async function WebinarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: webinar } = await supabase
    .from('webi_webinars')
    .select('*')
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
