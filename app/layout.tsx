import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WebinarFlow — Plataforma de Webinar Evergreen',
  description: 'Crie e automatize webinars que convertem com chat ao vivo, overlays de oferta e analytics detalhados.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
