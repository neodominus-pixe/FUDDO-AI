// Fills the ingredient texture library with the foods the studio already knows by name, slowly enough for a free
// image key. Safe to stop and run again: anything already made is skipped, so it picks up where it left off.
//
//   npm run textures:seed                 the next 20 missing ingredients
//   npm run textures:seed -- --limit 100  the next 100
//   npm run textures:seed -- --dry-run    show what it would make
//   npm run textures:seed -- --only salmon,beetroot
//
// It uses whichever provider the environment selects (Gemini with GEMINI_API_KEY, otherwise the local stand-in)
// and the same shared allowance as the app, so it never spends faster than the app would.

import { KNOWN_INGREDIENTS } from '../lib/palette'
import { TEMPLATE_COMPONENT_NAMES } from '../lib/suggest'
import { normalizeIngredient } from '../lib/ingredients'
import { backend } from '../lib/backend'
import { config } from '../lib/config'
import { ensureTexture, textureProvider } from '../lib/textures/service'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const value = (name: string) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const limit = Math.max(1, Number(value('limit') ?? 20) || 20)
  const only = value('only')?.split(',').map((s) => s.trim()).filter(Boolean)
  // The foods the starter templates offer come first, then everything the colour table knows by name.
  const names = only ?? [...new Set([...TEMPLATE_COMPONENT_NAMES, ...KNOWN_INGREDIENTS])]

  const keys = names.map(normalizeIngredient)
  const known = new Set<string>()
  for (let i = 0; i < keys.length; i += 100) {
    for (const t of await backend.textures.lookup(keys.slice(i, i + 100))) if (t.status !== 'failed') known.add(t.key)
  }
  const todo = names.filter((n) => !known.has(normalizeIngredient(n))).slice(0, limit)
  console.log(`${names.length} ingredients known, ${known.size} already have a texture, making ${todo.length} using ${textureProvider().id}.`)
  if (flag('dry-run')) {
    for (const n of todo) console.log('  ' + n)
    return
  }

  // A little under the allowance, so a person using the app at the same time is not starved.
  const gap = Math.ceil(60_000 / Math.max(1, config().texturesPerMinute - 1))
  let made = 0
  for (const name of todo) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const t = await ensureTexture(name, null)
        console.log(`  ${t.status === 'ready' ? 'made   ' : t.status}  ${name}`)
        if (t.status === 'ready') made++
        break
      } catch (error) {
        const status = (error as { status?: number }).status
        const message = error instanceof Error ? error.message : String(error)
        // Out of allowance for now: wait it out and try the same one again. Anything else will not get better.
        if (status === 429 || status === 503) {
          console.log(`  waiting (${message})`)
          await wait(((error as { retryAfter?: number }).retryAfter ?? 30) * 1000)
          continue
        }
        console.error(`  stopped on "${name}": ${message}`)
        process.exitCode = 1
        return
      }
    }
    await wait(gap)
  }
  console.log(`Done: ${made} made.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
