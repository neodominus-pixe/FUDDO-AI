import { redirect } from 'next/navigation'
import AuthArt from '@/components/AuthArt'
import Logo from '@/components/Logo'
import ResetForm from '@/components/ResetForm'
import { currentUser } from '@/lib/auth'

// Depends on the session the reset link just created, so it can never be prerendered.
export const dynamic = 'force-dynamic'

export default async function ResetPage() {
  const user = await currentUser()
  if (!user) redirect('/auth?mode=forgot&error=link')
  return (
    <main className="auth-shell">
      <AuthArt />
      <section className="auth-panel">
        <div className="auth-box">
          <Logo tagline={null} size={44} />
          <p className="land-kicker">Account recovery</p>
          <h2>Choose a new password</h2>
          <p className="auth-intro">
            Signed in as <strong>{user.email}</strong>. Once you save, every other device is signed out.
          </p>
          <ResetForm />
        </div>
      </section>
    </main>
  )
}
