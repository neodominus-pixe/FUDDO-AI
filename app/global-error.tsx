'use client'

import './globals.css'
import { useEffect } from 'react'
import StatusPage from '@/components/StatusPage'
import { themeScript } from '@/lib/theme-script'

// Shown when the root layout itself fails, so it has to bring its own document, styles and theme.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong — FUDDO AI</title>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <StatusPage
          eyebrow="Something went wrong"
          title="FUDDO AI couldn’t load"
          actions={
            <button type="button" className="brand-button" onClick={() => retry()}>
              Try again
            </button>
          }
        >
          <p>Your saved work is safe. Please try again in a moment.</p>
        </StatusPage>
      </body>
    </html>
  )
}
