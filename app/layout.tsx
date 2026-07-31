// import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { VirahubProvider } from '@/components/virahub-provider'
import './globals.css'

const _inter = Inter({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'VIRAHUB — Detector de tendencias virales',
  description:
    'Análisis en tiempo real de millones de conversaciones, noticias y señales para descubrir tendencias antes que nadie.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b0912',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background">
      <body className="bg-background font-sans antialiased">
        <VirahubProvider>{children}</VirahubProvider>
        {/* <Analytics /> */}
      </body>
    </html>
  )
}
