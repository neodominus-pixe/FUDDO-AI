'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import StatusPage from '@/components/StatusPage'

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  // In production a server error carries only this reference, which matches the entry in the server log.
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  return (
    <StatusPage
      eyebrow="Something went wrong"
      title="That didn’t work"
      actions={
        <>
          <button type="button" className="brand-button" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className="ghost-button">
            Back to home
          </Link>
        </>
      }
    >
      <p>The page hit a problem. Your saved work is safe, so try again in a moment.</p>
      {digest ? <p className="mt-3 text-xs">Reference: {digest}</p> : null}
    </StatusPage>
  )
}
