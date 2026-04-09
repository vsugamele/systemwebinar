import { createClient } from '@/lib/supabase/server'
import PreviewButton from '@/components/PreviewButton'
import { SidebarWebinar } from './components/SidebarWebinar'

export default async function WebinarLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string; wid: string }>
}) {
  const { id, wid } = await params
  const supabase = await createClient()
  const { data: w } = await supabase
    .from('webi_webinars')
    .select('slug, name')
    .eq('id', wid)
    .single()

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 'calc(100vh - 65px)' }}>
      <SidebarWebinar projectId={id} webinarId={wid} />
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0, position: 'relative' }}>
        {children}
        {w && <PreviewButton slug={w.slug} />}
      </div>
    </div>
  )
}
