import { randomUUID } from 'node:crypto'

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3111'
export const PASSWORD = 'correct-horse-battery-staple'

/** A tiny cookie-aware HTTP client, so tests behave like a browser: cookies persist, Origin is sent. */
export class Session {
  cookies = new Map<string, string>()
  lastSetCookie: string[] = []

  constructor(private readonly origin: string | null = BASE) {}

  async request(path: string, init: RequestInit & { json?: unknown; origin?: string | null } = {}) {
    const headers = new Headers(init.headers)
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '))
    const origin = init.origin === undefined ? this.origin : init.origin
    if (origin && init.method && init.method !== 'GET') headers.set('origin', origin)
    let body = init.body
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(init.json)
    }
    // Absolute URLs (the Supabase auth server, the mail catcher) are another origin: never send them our cookies.
    const external = /^https?:\/\//.test(path)
    if (external) headers.delete('cookie')
    const res = await fetch(external ? path : BASE + path, { ...init, headers, body, redirect: 'manual' })
    this.lastSetCookie = res.headers.getSetCookie()
    for (const line of this.lastSetCookie) {
      const [pair] = line.split(';')
      const eq = pair.indexOf('=')
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1)
      if (/max-age=0/i.test(line) || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    const text = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: bodies are inspected freely
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      /* not JSON */
    }
    return { status: res.status, headers: res.headers, data, text }
  }

  post(path: string, json: unknown, extra: { origin?: string | null } = {}) {
    return this.request(path, { method: 'POST', json, ...extra })
  }
  get(path: string) {
    return this.request(path)
  }
  patch(path: string, json: unknown) {
    return this.request(path, { method: 'PATCH', json })
  }
  delete(path: string) {
    return this.request(path, { method: 'DELETE' })
  }
}

export { resetSignupThrottle }
export const uniqueEmail = () => `e2e-${randomUUID().slice(0, 8)}@example.test`

// Tests create far more accounts (and failed sign-ins) from one address than the per-address caps allow, so reset
// those counters (server-side, with the service key) before each account. The caps have their own tests.
async function resetSignupThrottle() {
  const { createClient } = await import('@supabase/supabase-js')
  const { createHash } = await import('node:crypto')
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
  const direct = createHash('sha256').update('direct').digest('hex')
  for (const key of [`signup:${direct}`, `ip:${direct}`, `forgot:ip:${direct}`]) await svc.rpc('clear_rate_limit', { p_key: key })
}

export async function signUp(name = 'E2E Chef', extra: Record<string, unknown> = {}) {
  await resetSignupThrottle()
  const s = new Session()
  const email = uniqueEmail()
  const res = await s.post('/api/auth/signup', { name, email, password: PASSWORD, ...extra })
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${res.text}`)
  return { s, email, id: res.data.user.id as string }
}

export const sampleDish = () => ({
  id: 'dish-1',
  name: 'Seared duck, celeriac, red wine',
  components: [
    { id: 'c1', name: 'Seared duck breast', role: 'hero', imagePath: null },
    { id: 'c2', name: 'Celeriac puree', role: 'support', imagePath: null },
    { id: 'c3', name: 'Red wine jus', role: 'sauce', imagePath: null },
    { id: 'c4', name: 'Micro chervil', role: 'garnish', imagePath: null },
  ],
  createdAt: new Date().toISOString(),
})

/** A 1x1 PNG. */
export const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
)
