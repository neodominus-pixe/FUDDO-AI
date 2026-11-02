import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { looksLikePlaceholder, repairDevEnv } from '@/lib/env'

const REAL = { url: 'https://abcdefghijklmnopqrst.supabase.co', anon: 'a'.repeat(120), service: 's'.repeat(140) }
const files = (contents: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'fuddo-env-'))
  for (const [name, text] of Object.entries(contents)) writeFileSync(join(dir, name), text)
  return dir
}
const dotenv = (v = REAL) => `NEXT_PUBLIC_SUPABASE_URL=${v.url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${v.anon}\nSUPABASE_SERVICE_ROLE_KEY=${v.service}\n`

describe('development env repair', () => {
  it('recognises placeholders', () => {
    for (const p of ['YOUR_SUPABASE_URL', 'your-project-url', '<paste here>', 'changeme', 'TODO', 'SUPABASE_ANON_KEY']) assert.ok(looksLikePlaceholder(p), p)
    for (const real of [REAL.url, REAL.anon]) assert.ok(!looksLikePlaceholder(real))
  })

  it('replaces placeholders in the environment with the real values from .env', () => {
    const dir = files({ '.env': dotenv() })
    try {
      const env = { NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: 'YOUR_SUPABASE_URL', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x'.repeat(22), SUPABASE_SERVICE_ROLE_KEY: '' } as NodeJS.ProcessEnv
      const repairs = repairDevEnv(env, dir)
      assert.deepEqual(repairs.map((r) => r.name).sort(), ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
      assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, REAL.url)
      assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, REAL.anon)
      assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, REAL.service)
      assert.ok(repairs.every((r) => r.from === '.env'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips a placeholder .env.local and uses the first usable file', () => {
    const dir = files({ '.env.local': 'NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL\n', '.env': dotenv() })
    try {
      const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv
      repairDevEnv(env, dir)
      assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, REAL.url)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves good values alone, and the explicit environment wins when it is usable', () => {
    const dir = files({ '.env': dotenv() })
    try {
      const mine = 'https://my-own-project.supabase.co'
      const env = { NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: mine, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k'.repeat(60), SUPABASE_SERVICE_ROLE_KEY: 'z'.repeat(60) } as NodeJS.ProcessEnv
      assert.deepEqual(repairDevEnv(env, dir), [])
      assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, mine)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('never touches anything in production, and does nothing without a usable file', () => {
    const dir = files({ '.env': dotenv() })
    try {
      const prod = { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'YOUR_SUPABASE_URL' } as NodeJS.ProcessEnv
      assert.deepEqual(repairDevEnv(prod, dir), [])
      assert.equal(prod.NEXT_PUBLIC_SUPABASE_URL, 'YOUR_SUPABASE_URL')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const empty = files({})
    try {
      const env = { NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: 'YOUR_SUPABASE_URL' } as NodeJS.ProcessEnv
      assert.deepEqual(repairDevEnv(env, empty), [])
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
