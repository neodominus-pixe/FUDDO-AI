import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FUDDO AI — Plating Studio',
  description:
    'Develop plating for a dish, send it to your consultant, and get one decision back — without cooking twelve plates to get there.',
}

export const viewport: Viewport = {
  // The browser chrome follows the theme: white bar in light, near-black in dark.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0c0b' },
  ],
}

/* Runs before the first paint, so a dark-mode visitor never gets a white flash
   on the way in. Kept to one statement and inlined for that reason -- anything
   loaded as a module would arrive after the page has already been painted. */
const themeScript = `try{var t=localStorage.getItem('fuddo-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}`

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>{children}</body>
    </html>
  )
}
