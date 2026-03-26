import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import RegisterForm from './RegisterForm'

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: webinar } = await supabase
    .from('webi_webinars')
    .select('*, webi_projects(name, accent_color)')
    .eq('slug', slug)
    .single()

  if (!webinar) return notFound()

  return <RegisterForm webinar={webinar} />
}
