import { createClient } from '@/lib/supabase/server'

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
      {w && (
        <a
          href={`/w/${w.slug}?test=1`}
          target="_blank"
          rel="noopener noreferrer"
          title="Pré-visualizar sala do webinar"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 99,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLAnchorElement
            el.style.borderColor = 'rgba(99,102,241,0.5)'
            el.style.color = '#a5b4fc'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLAnchorElement
            el.style.borderColor = 'var(--border)'
            el.style.color = 'var(--text-secondary)'
          }}
        >
          👁 Preview
        </a>
      )}
    </>
  )
}
