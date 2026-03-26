import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import ReplayRoomClient from './ReplayRoomClient'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: w } = await supabase.from('webi_webinars').select('name, description').eq('slug', slug).single()
  return {
    title: w?.name ? `${w.name} | Replay` : 'Replay do Webinar',
    description: w?.description || 'Assista ao replay do webinar.',
    icons: {
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎬</text></svg>',
    },
    openGraph: {
      title: w?.name ? `${w.name} | Replay` : 'Replay do Webinar',
      description: w?.description || 'Assista ao replay do webinar.',
    }
  }
}

export default async function ReplayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: webinar } = await supabase
    .from('webi_webinars')
    .select('*, webi_projects(name, accent_color)')
    .eq('slug', slug)
    .single()

  if (!webinar) redirect('/')

  return <ReplayRoomClient webinar={webinar} />
}
