import type { Metadata } from 'next'
import Link from 'next/link'
import StatusPage from '@/components/StatusPage'

export const metadata: Metadata = { title: 'Page not found — FUDDO AI' }

export default function NotFound() {
  return (
    <StatusPage
      eyebrow="404"
      title="This page isn’t on the menu"
      actions={
        <>
          <Link href="/" className="brand-button">
            Back to home
          </Link>
          <Link href="/studio" className="ghost-button">
            Open the studio
          </Link>
        </>
      }
    >
      <p>The link may be old or mistyped. If a consultant link brought you here, ask the chef to send it again.</p>
    </StatusPage>
  )
}
