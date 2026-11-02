// Session cookie policy, shared by the server client (lib/backend/supabase.ts) and proxy.ts.

export const REMEMBER_COOKIE = 'fuddo-remember'
export const REMEMBER_SECONDS = 30 * 86400

/**
 * Session cookies are HttpOnly (this app never uses a Supabase client in the browser), SameSite=Lax, Secure in
 * production, and last 30 days only when the person ticked "Remember me"; otherwise they end with the browser session.
 */
export function sessionCookie(options: Record<string, unknown>, value: string, remember: boolean) {
  const out: Record<string, unknown> = {
    ...options,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
  if (value === '' || out.maxAge === 0) return out // deleting
  if (remember) out.maxAge = REMEMBER_SECONDS
  else {
    delete out.maxAge
    delete out.expires
  }
  return out
}
