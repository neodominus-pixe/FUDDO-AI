'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, type FormEvent, useState } from 'react'
import AuthArt from '@/components/AuthArt'
import Logo from '@/components/Logo'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/policy'

type Mode = 'signin' | 'signup' | 'forgot'

/** Only ever follow a path on this site, never a full URL someone put in the link. */
function safeNext(value: string | null, fallback: string) {
  return value && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) ? value : fallback
}

function AuthForm() {
  const router = useRouter()
  const params = useSearchParams()
  const initial = params.get('mode')
  const [mode, setMode] = useState<Mode>(initial === 'signup' ? 'signup' : initial === 'forgot' ? 'forgot' : 'signin')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(params.get('error') === 'link' ? 'That reset link is invalid or has expired. Request a new one.' : '')
  const [notice, setNotice] = useState('')
  const signup = mode === 'signup'
  const forgot = mode === 'forgot'

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setNotice('')
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    const d = new FormData(e.currentTarget)
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const response = await fetch(`/api/auth/${forgot ? 'forgot' : signup ? 'signup' : 'signin'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: d.get('name'),
          email: d.get('email'),
          password: d.get('password'),
          remember: d.get('remember') === 'on',
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.')
      if (forgot) {
        setNotice(data.message ?? 'If that address has an account, a reset link is on its way.')
        setLoading(false)
        return
      }
      if (data.pending) {
        // Email confirmation is on: the account exists but cannot sign in yet.
        setNotice(data.message ?? 'Check your email to confirm your account, then sign in.')
        setMode('signin')
        setLoading(false)
        return
      }
      router.push(safeNext(params.get('next'), data.user.role === 'admin' ? '/admin' : '/studio'))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect. Try again.')
      setLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <AuthArt />
      <section className="auth-panel">
        <div className="auth-box">
          <Logo tagline={null} size={44} />
          <p className="land-kicker">Your creative workspace</p>
          <h2>{forgot ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back, Chef'}</h2>
          <p className="auth-intro">
            {forgot
              ? 'Enter your email and we will send you a link to choose a new password.'
              : signup
                ? 'Start shaping and sharing your plating concepts.'
                : 'Sign in to continue to your FUDDO AI studio.'}
          </p>
          {!forgot && (
            <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
              <button type="button" role="tab" aria-selected={!signup} className={!signup ? 'active' : ''} onClick={() => switchMode('signin')}>
                Sign in
              </button>
              <button type="button" role="tab" aria-selected={signup} className={signup ? 'active' : ''} onClick={() => switchMode('signup')}>
                Create account
              </button>
            </div>
          )}
          <form onSubmit={submit}>
            {signup && (
              <label>
                Full name
                <input name="name" autoComplete="name" maxLength={100} required placeholder="Alex Moreau" />
              </label>
            )}
            <label>
              Email address
              <input name="email" autoComplete="email" maxLength={254} type="email" required placeholder="chef@restaurant.com" />
            </label>
            {!forgot && (
              <label>
                Password
                <div className="password">
                  <input
                    name="password"
                    // The length rule is stated when choosing a password, never when signing in with an existing one.
                    minLength={signup ? PASSWORD_MIN : undefined}
                    maxLength={PASSWORD_MAX}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    type={show ? 'text' : 'password'}
                    required
                    placeholder={signup ? `At least ${PASSWORD_MIN} characters` : 'Your password'}
                  />
                  <button type="button" onClick={() => setShow(!show)} aria-pressed={show}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
            )}
            {mode === 'signin' && (
              <div className="auth-options">
                <label>
                  <input name="remember" type="checkbox" /> Remember me
                </label>
                <button type="button" className="link-brand" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              </div>
            )}
            {notice && (
              <p role="status" className="auth-intro">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="auth-error">
                {error}
              </p>
            )}
            <button className="brand-button auth-submit" disabled={loading}>
              {loading ? (forgot ? 'Sending…' : 'Opening your studio…') : forgot ? 'Send reset link →' : signup ? 'Create account →' : 'Sign in →'}
            </button>
            {forgot && (
              <button type="button" className="link-brand mt-3 min-h-11" onClick={() => switchMode('signin')}>
                ← Back to sign in
              </button>
            )}
          </form>
          <p className="auth-terms">By continuing, you agree to the Terms of Service and Privacy Policy.</p>
        </div>
      </section>
    </main>
  )
}

export default function AuthPage() {
  // useSearchParams needs a Suspense boundary so the rest of the page can be prerendered.
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  )
}
