'use client'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/policy'

export default function ResetForm() {
  const router = useRouter()
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    const d = new FormData(e.currentTarget)
    const password = String(d.get('password') ?? '')
    if (password !== d.get('confirm')) {
      setError('The two passwords do not match.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not change the password.')
      router.push('/studio')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect. Try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        New password
        <div className="password">
          <input
            name="password"
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
            type={show ? 'text' : 'password'}
            required
            placeholder={`At least ${PASSWORD_MIN} characters`}
          />
          <button type="button" onClick={() => setShow(!show)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>
      <label>
        Confirm new password
        <input name="confirm" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} autoComplete="new-password" type={show ? 'text' : 'password'} required />
      </label>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <button className="brand-button auth-submit" disabled={loading}>
        {loading ? 'Saving…' : 'Save new password →'}
      </button>
    </form>
  )
}
