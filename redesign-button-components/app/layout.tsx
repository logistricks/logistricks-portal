import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '900'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Logistricks — Every carrier. Every rate. One reply.',
  description:
    'AI-powered rate collection and quoting for international freight forwarders. Logistricks reads every carrier reply — WhatsApp, email, PDF — collects your rates, and builds a professional quote in 30 minutes.',
  generator: 'v0.app',
  keywords: [
    'freight forwarding',
    'AI rate collection',
    'freight quoting',
    'logistics automation',
    'carrier rates',
  ],
  openGraph: {
    title: 'Logistricks — Every carrier. Every rate. One reply.',
    description:
      'AI-powered rate collection and quoting for international freight forwarders.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0D1B2A',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <SpeedInsights />
      </body>
    </html>
  )
}
