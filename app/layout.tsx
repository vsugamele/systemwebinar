import type { Metadata, Viewport } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'WebinarFlow — Plataforma de Webinar Evergreen',
  description: 'Crie e automatize webinars que convertem com chat ao vivo, overlays de oferta e analytics detalhados.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050508',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Toaster position="top-right" />
        {children}
      </body>
    </html>
  )
}
