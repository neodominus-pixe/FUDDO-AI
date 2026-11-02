import { NextResponse } from 'next/server'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { backend, BackendError, type User } from '@/lib/backend'
import { clientIp, currentUser, forgotKeys, sameOrigin, signupKey, throttleKeys } from '@/lib/auth'
import { ForgotSchema, ResetSchema, SigninSchema, SignupSchema } from '@/lib/schemas'

export const runtime = 'nodejs'

const WINDOW_MS = 15 * 60_000
const IP_LIMIT = 30 // failed sign-ins per address
const ACCOUNT_LIMIT = 8 // failed sign-ins per account from one address
const SIGNUP_LIMIT = 10 // sign-up attempts per address per hour

const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, role: u.role })

export const GET = route(async (_req: Request, { params }: { params: Promise<{ action: string }> }) => {
  if ((await params).action !== 'me') return new Response(null, { status: 404 })
  return NextResponse.json({ user: await currentUser() }, { headers: { 'Cache-Control': 'no-store' } })
})

export const POST = route(async (req: Request, { params }: { params: Promise<{ action: string }> }) => {
  if (!sameOrigin(req)) return apiError('Invalid request origin.', 403)
  const { action } = await params
  if (!['signup', 'signin', 'signout', 'forgot', 'reset'].includes(action)) return new Response(null, { status: 404 })

  if (action === 'signout') {
    await backend.signOut()
    return apiSuccess({ ok: true })
  }

  const body = await readJson(req, 10_000)
  const ip = clientIp(req)

  if (action === 'forgot') {
    const parsed = ForgotSchema.safeParse(body)
    // The answer never depends on whether the address has an account, or on how many requests it has had.
    const answer = () => apiSuccess({ message: 'If that address has an account, a reset link is on its way. It works for one hour.' })
    if (!parsed.success) return answer()
    const keys = forgotKeys(parsed.data.email, ip)
    const limited = (await backend.limiter.hit(keys.ip, 5, 60 * 60_000)) || (await backend.limiter.hit(keys.account, 3, 60 * 60_000))
    if (!limited) await backend.requestPasswordReset(parsed.data.email, `${new URL(req.headers.get('origin')!).origin}/auth/confirm`)
    return answer()
  }

  if (action === 'reset') {
    const parsed = ResetSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Choose a new password.', 400, 'VALIDATION_ERROR')
    if (await backend.limiter.hit(`reset:${(await currentUser())?.id ?? ip}`, 10, 60 * 60_000)) {
      return apiError('Too many attempts. Try again later.', 429, undefined, undefined, { 'Retry-After': '3600' })
    }
    await backend.changePassword(parsed.data.password)
    return apiSuccess({ ok: true })
  }

  if (action === 'signup') {
    const parsed = SignupSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Enter your name, a valid email and a password.', 400, 'VALIDATION_ERROR')
    if (await backend.limiter.hit(signupKey(ip), SIGNUP_LIMIT, 60 * 60_000)) {
      return apiError('Too many attempts. Try again later.', 429, undefined, undefined, { 'Retry-After': '3600' })
    }
    if (!(await backend.registrationOpen())) {
      return apiError('Registration is currently closed. Contact the studio administrator.', 403)
    }
    const { name, email, password, remember } = parsed.data
    const result = await backend.signUp({ name, email, password }, remember === true)
    if ('pending' in result) {
      return apiSuccess({ pending: true, message: 'Check your email to confirm your account, then sign in.' }, 202)
    }
    return apiSuccess({ user: publicUser(result.user) }, 201)
  }

  // Sign in ---------------------------------------------------------------------
  const parsed = SigninSchema.safeParse(body)
  if (!parsed.success) return apiError('Enter a valid email and password.', 400, 'VALIDATION_ERROR')
  const { email, password, remember } = parsed.data
  const keys = throttleKeys(email, ip)

  // Only FAILED attempts count, and the account counter is per address. A stranger who types someone else's
  // email ten times locks out their own address, never the real owner, and a correct sign-in is never refused
  // for failures somebody else made.
  if ((await backend.limiter.isLimited(keys.ip, IP_LIMIT)) || (await backend.limiter.isLimited(keys.account, ACCOUNT_LIMIT))) {
    throw new BackendError('Too many attempts. Try again in 15 minutes.', 429, 'rate_limited', WINDOW_MS / 1000)
  }

  let user: User
  try {
    user = await backend.signIn({ email, password }, remember === true)
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) {
      await Promise.all([backend.limiter.hit(keys.ip, IP_LIMIT, WINDOW_MS), backend.limiter.hit(keys.account, ACCOUNT_LIMIT, WINDOW_MS)])
    }
    throw error
  }
  await backend.limiter.clear(keys.account)
  return apiSuccess({ user: publicUser(user) })
})
