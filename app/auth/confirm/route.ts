import { NextResponse, type NextRequest } from 'next/server'
import { backend } from '@/lib/backend'

export const dynamic = 'force-dynamic'

// Where a password-reset email lands. The link carries a one-time code; exchanging it signs the person in
// (in this browser, the one that asked for the reset) and sends them to choose a new password.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const failed = NextResponse.redirect(new URL('/auth?mode=forgot&error=link', request.nextUrl))
  if (!code || code.length > 300) return failed
  try {
    if (!(await backend.exchangeRecoveryCode(code))) return failed
  } catch {
    return failed
  }
  const response = NextResponse.redirect(new URL('/auth/reset', request.nextUrl))
  response.headers.set('Cache-Control', 'no-store')
  return response
}
