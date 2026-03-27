import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import RegisterForm from './RegisterForm'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: w } = await supabase.from('webi_webinars').select('name, description').eq('slug', slug).single()
  return {
    title: w?.name ? `Registro: ${w.name}` : 'Registro para o Webinar',
    description: w?.description || 'Garanta sua vaga neste webinar exclusivo.',
    icons: {
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎬</text></svg>',
    },
    openGraph: {
      title: w?.name ? `Registro: ${w.name}` : 'Registro para o Webinar',
      description: w?.description || 'Garanta sua vaga neste webinar exclusivo.',
    }
  }
}

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: webinar } = await supabase
    .from('webi_webinars')
    .select('*, webi_projects(name, accent_color)')
    .eq('slug', slug)
    .single()

  if (!webinar) return notFound()

  return <RegisterForm webinar={webinar} slug={slug} />
}
