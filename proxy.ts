import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { REMEMBER_COOKIE, sessionCookie } from '@/lib/backend/cookies'
import { ensureDevEnv } from '@/lib/env'

// Runs before the signed-in pages render. Two jobs:
//   1. Refresh the Supabase session. Server Components cannot write cookies, so an expiring token has to be
//      renewed here or the person would be signed out mid-session.
//   2. Send visitors without a session to the sign-in page before any page code runs.
// The pages and API routes still check who is signed in themselves; this is a fast path, not the authority.

export async function proxy(request: NextRequest) {
  ensureDevEnv()
  let response = NextResponse.next({ request })
  // Read by name at run time. A literal `process.env.NEXT_PUBLIC_…` is replaced with its value when the file is
  // compiled, which would freeze whatever the environment held then and defeat the development repair above.
  const env = process.env
  const url = env['NEXT_PUBLIC_SUPABASE_URL' as string]
  const key = env['NEXT_PUBLIC_SUPABASE_ANON_KEY' as string]
  // Missing or unusable configuration (an absent value, or a placeholder like "YOUR_SUPABASE_URL"): step aside.
  // This file runs in a sandbox that cannot read .env files, so it cannot repair anything; the pages and API
  // routes still check the session themselves and report the real problem instead of this one crashing first.
  if (!url || !key || key.length < 20 || !/^https?:\/\/[^\s/]+/.test(url)) return response

  const remember = request.cookies.get(REMEMBER_COOKIE)?.value === '1'
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: object }[]) => {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, sessionCookie(options as Record<string, unknown>, value, remember))
        }
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    const target = new URL('/auth', request.url)
    target.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(target)
  }
  return response
}

export const config = { matcher: ['/studio/:path*', '/admin/:path*', '/card/:path*'] }
