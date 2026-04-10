import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import LandingPageClient from './LandingPageClient'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: w } = await supabase.from('webi_webinars').select('name, landing_headline, thumbnail_url').eq('slug', slug).single()
  
  const title = w?.landing_headline || w?.name || 'Cadastro Liberado'
  return {
    title,
    openGraph: {
      title,
      type: 'website',
      ...(w?.thumbnail_url && { images: [{ url: w.thumbnail_url, width: 1200, height: 630 }] }),
    },
  }
}

export default async function LandingRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const supabase = await createClient()

  // Fetch Webinar & Project
  const { data: webinar } = await supabase
    .from('webi_webinars')
    .select(`
      *,
      webi_projects(
        id,
        name,
        brand_color
      )
    `)
    .eq('slug', slug)
    .single()

  if (!webinar) return notFound()

  // Squeeze typing
  const project = (webinar as any).webi_projects || {}

  return (
    <LandingPageClient 
      webinarId={webinar.id}
      projectId={project.id}
      slug={slug}
      params={sp}
      brandColor={project.brand_color || '#6366f1'}
      headline={webinar.landing_headline || `Participe do ${webinar.name}`}
      subheadline={webinar.landing_subheadline || 'Cadastre-se abaixo para garantir seu lugar exclusivo.'}
      buttonText={webinar.landing_button_text || 'Quero me inscrever'}
      customBackgroundUrl={webinar.custom_background_url}
    />
  )
}
