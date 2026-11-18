import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { contentSecurityPolicy, securityHeaders } from '../../lib/security-headers'

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

describe('content security policy', () => {
  const live = contentSecurityPolicy({ dev: false, supabaseUrl: 'https://abc.supabase.co/some/path' })

  it('refuses plugins, framing and a swapped base address', () => {
    assert.equal(directive(live, 'object-src'), "object-src 'none'")
    assert.equal(directive(live, 'frame-ancestors'), "frame-ancestors 'none'")
    assert.equal(directive(live, 'base-uri'), "base-uri 'self'")
  })

  it('lets the page reach its own Supabase project and no other', () => {
    assert.match(directive(live, 'connect-src'), /https:\/\/abc\.supabase\.co(\s|$)/)
    assert.doesNotMatch(live, /\*\.supabase\.co/)
  })

  it('keeps the development allowances out of production', () => {
    assert.doesNotMatch(directive(live, 'script-src'), /'unsafe-eval'/)
    assert.doesNotMatch(directive(live, 'connect-src'), /ws:/)
    assert.match(directive(contentSecurityPolicy({ dev: true }), 'script-src'), /'unsafe-eval'/)
  })

  it('still allows the WebAssembly decoder and its workers that the 3D models need', () => {
    assert.match(directive(live, 'script-src'), /'wasm-unsafe-eval'/)
    assert.match(directive(live, 'worker-src'), /blob:/)
  })

  it('falls back to Supabase hosting when the project address is missing or malformed', () => {
    assert.match(contentSecurityPolicy({ dev: false }), /https:\/\/\*\.supabase\.co/)
    assert.match(contentSecurityPolicy({ dev: false, supabaseUrl: 'not a url' }), /https:\/\/\*\.supabase\.co/)
  })

  it('only asks browsers to insist on HTTPS in production', () => {
    const has = (dev: boolean) => securityHeaders({ dev }).some((h) => h.key === 'Strict-Transport-Security')
    assert.equal(has(false), true)
    assert.equal(has(true), false)
  })
})
