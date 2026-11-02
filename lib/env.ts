import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

// Development convenience, never used in production.
//
// A variable that is already set in the environment beats every .env file, which is the rule you want in
// production. In development it has a nasty failure mode: a placeholder left in the terminal session or in some
// launcher ("YOUR_SUPABASE_URL") silently overrides the real value in .env, and the app fails with an error that
// points at the wrong place. So in development only, a Supabase variable that is plainly unusable is replaced by
// the first usable value from .env.local / .env, and the log says exactly what happened.

const CHECKS: Record<string, (value: string) => boolean> = {
  NEXT_PUBLIC_SUPABASE_URL: (v) => /^https?:\/\/[^\s/]+/.test(v),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: (v) => v.length >= 20 && !looksLikePlaceholder(v),
  SUPABASE_SERVICE_ROLE_KEY: (v) => v.length >= 20 && !looksLikePlaceholder(v),
}

/** "YOUR_KEY", "your-project-url", "<paste here>", "changeme"… */
export function looksLikePlaceholder(v: string): boolean {
  return /^(your|<|\{|change|todo|xxx|placeholder|example)/i.test(v.trim()) || /^[A-Z][A-Z0-9_]*$/.test(v.trim())
}

export type EnvRepair = { name: string; from: string; reason: string }

/**
 * Replaces unusable Supabase variables in `env` with usable ones from the .env files in `dir`. Returns what it did.
 * `env` and `dir` are parameters so this can be tested; callers use the defaults.
 */
export function repairDevEnv(env: NodeJS.ProcessEnv = process.env, dir: string = process.cwd()): EnvRepair[] {
  if (env.NODE_ENV === 'production') return []
  const repairs: EnvRepair[] = []

  for (const [name, usable] of Object.entries(CHECKS)) {
    const current = env[name]
    if (current !== undefined && current !== '' && usable(current)) continue

    for (const file of ['.env.local', '.env']) {
      let parsed: Record<string, string>
      try {
        parsed = parseEnv(readFileSync(join(dir, file), 'utf8')) as Record<string, string>
      } catch {
        continue // no such file
      }
      const candidate = parsed[name]
      if (candidate && usable(candidate)) {
        env[name] = candidate
        const shown = current === undefined ? 'not set' : current === '' ? 'empty' : `"${name === 'NEXT_PUBLIC_SUPABASE_URL' ? current : `${current.length} characters`}"`
        repairs.push({ name, from: file, reason: `the environment had ${shown}, which cannot work` })
        break
      }
    }
  }
  return repairs
}

let done = false
/** Runs the repair once per server process and tells the developer about it. */
export function ensureDevEnv(): void {
  if (done) return
  done = true
  for (const r of repairDevEnv()) {
    console.warn(
      `[fuddo] ${r.name}: ${r.reason}, so the value from ${r.from} is being used instead. ` +
        `Something in the terminal or launcher that started this server sets it; remove it to silence this (PowerShell: Remove-Item Env:${r.name}).`,
    )
  }
}
