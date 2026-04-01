import { createClient } from '@/lib/supabase/server'
import PreviewButton from '@/components/PreviewButton'

export default async function WebinarLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string; wid: string }>
}) {
  const { wid } = await params
  const supabase = await createClient()
  const { data: w } = await supabase
    .from('webi_webinars')
    .select('slug, name')
    .eq('id', wid)
    .single()

  return (
    <>
      {children}
      {w && <PreviewButton slug={w.slug} />}
    </>
  )
}
