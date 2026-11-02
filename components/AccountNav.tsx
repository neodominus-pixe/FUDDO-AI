'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// The thin bar above every signed-in screen: who you are, where you can go, and
// the way out. The studio masthead sits directly under it, so this one stays
// deliberately quiet.
export default function AccountNav({ name, admin }: { name: string; admin: boolean }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signout() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/signout', { method: 'POST' })
      if (!response.ok) throw new Error()
      router.push('/auth')
      router.refresh() // drop any server-rendered page that still holds the signed-in user
    } catch {
      setError('Could not sign out. Please try again.')
      setBusy(false)
    }
  }

  return (
    <nav className="flex flex-nowrap items-center justify-between min-h-11 gap-3 border-b border-rule bg-sunken px-4 sm:px-8 text-xs text-muted">
      <span className="truncate max-w-[130px] sm:max-w-none">
        Signed in as <span className="font-medium text-ink">{name}</span>
      </span>
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/studio" className="link-brand min-h-11 flex items-center">
          Studio
        </Link>
        {admin && (
          <Link href="/admin" className="link-brand min-h-11 flex items-center">
            Admin
          </Link>
        )}
        <button onClick={signout} disabled={busy} className="link-brand cursor-pointer min-h-11 flex items-center disabled:opacity-60">
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </nav>
  )
}
