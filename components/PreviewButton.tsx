'use client'

export default function PreviewButton({ slug }: { slug: string }) {
  return (
    <a
      href={`/w/${slug}?test=1`}
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
  )
}
