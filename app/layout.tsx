import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono, Bricolage_Grotesque } from 'next/font/google'
import './globals.css'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
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
  themeColor: '#0f1e36',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${bricolage.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Logistricks" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var p=location.pathname;if(p.indexOf('/login')===0||p.indexOf('/api')===0)return;
              var d=document.documentElement,t=localStorage.getItem('portal-theme');
              d.style.backgroundColor=t==='dark'?'#0C1424':'#f2f5fa';
              var c=JSON.parse(localStorage.getItem('portal-theme-colors')||'null');
              if(c){
                if(c.primaryDark)d.style.setProperty('--brand-navy',c.primaryDark);
                if(c.primaryMid)d.style.setProperty('--brand-navy-mid',c.primaryMid);
                if(c.primaryLight)d.style.setProperty('--brand-navy-light',c.primaryLight);
                if(c.accent){d.style.setProperty('--brand-accent',c.accent);var m=/^#?([0-9a-f]{6})$/i.exec(String(c.accent).trim());if(m){var v=parseInt(m[1],16);d.style.setProperty('--brand-accent-rgb',((v>>16)&255)+' '+((v>>8)&255)+' '+(v&255));}}
              }
            }catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
