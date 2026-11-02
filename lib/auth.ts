import 'server-only'
import { createHash } from 'node:crypto'
import { apiError } from './api-response'
import { backend, type User } from './backend'
import { config } from './config'

export type { User }
export { PASSWORD_MAX, PASSWORD_MIN } from './policy'

export const currentUser = () => backend.currentUser()

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Browsers always send Origin on cross-site and same-site POSTs; a mismatch is a forged request. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const trust = config().trustProxy
  const host = (trust && request.headers.get('x-forwarded-host')) || request.headers.get('host') || new URL(request.url).host
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * The caller's address, for throttling. X-Forwarded-For is client-controlled unless a proxy you run
 * overwrites it, so it is only honoured when TRUST_PROXY is set (automatic on Vercel).
 */
export function clientIp(request: Request): string {
  if (config().trustProxy) {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
    const real = request.headers.get('x-real-ip')?.trim()
    if (real) return real
  }
  return 'direct'
}

/** Throttle keys are hashed so raw addresses and emails never sit in the rate_limits table. */
export const throttleKeys = (email: string, ip: string) => ({
  ip: `ip:${sha256(ip)}`,
  account: `acct:${sha256(email.trim().toLowerCase())}:${sha256(ip)}`,
})

/** Password-reset requests are counted whether or not the account exists, so the limit itself leaks nothing. */
export const forgotKeys = (email: string, ip: string) => ({
  ip: `forgot:ip:${sha256(ip)}`,
  account: `forgot:acct:${sha256(email.trim().toLowerCase())}`,
})

export const signupKey = (ip: string) => `signup:${sha256(ip)}`
export const reviewKey = (ip: string, shareId: string) => `review:${sha256(ip)}:${sha256(shareId)}`

type Guard = { user: User } | { response: Response }

/**
 * Standard entry check for authenticated API routes: same-origin for anything that changes state,
 * a signed-in active user, and optionally an administrator.
 */
export async function guard(request: Request, options: { admin?: boolean } = {}): Promise<Guard> {
  if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request)) {
    return { response: apiError('Invalid request origin.', 403) }
  }
  const user = await currentUser()
  if (!user) return { response: apiError('Please sign in.', 401) }
  if (options.admin && user.role !== 'admin') return { response: apiError('Administrator access required.', 403) }
  return { user }
}
