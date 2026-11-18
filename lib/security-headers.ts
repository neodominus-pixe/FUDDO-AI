// The response headers every page and API route is sent with.
//
// The Content Security Policy is the browser's list of where this site may load things from, so that a script slipped
// into a page cannot quietly talk to someone else's server. Pages are prerendered, so it cannot use per-request nonces;
// inline scripts stay allowed because Next.js and the theme script in the root layout depend on them.

type Env = { dev: boolean; supabaseUrl?: string }

/** The Supabase project's origin (photos, textures), or every Supabase project when the address is not known at build. */
function supabaseOrigin(url?: string) {
  try {
    return new URL(url ?? '').origin
  } catch {
    return 'https://*.supabase.co'
  }
}

export function contentSecurityPolicy({ dev, supabaseUrl }: Env) {
  const supabase = supabaseOrigin(supabaseUrl)
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // wasm-unsafe-eval: the 3D models are Draco-compressed and the decoder is WebAssembly. React's development build needs eval.
    'script-src': ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', supabase],
    'font-src': ["'self'", 'data:'],
    // data: and blob: are how the 3D viewer reads a model it was handed. Development also needs the live-reload socket.
    'connect-src': ["'self'", 'data:', 'blob:', supabase, ...(dev ? ['ws:'] : [])],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

export function securityHeaders(env: Env) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(env) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    ...(env.dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
  ]
}
