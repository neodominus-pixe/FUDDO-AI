// Repaints the library's locally painted textures with the painters as they are now.
//
// A texture is a picture made once per ingredient name and shared by everyone, so when the colour table or the
// painters improve, the pictures already in the library stay as they were: a fish fillet painted green stays green.
// This repaints every locally painted one (the free stand-in, `procedural:*`) and leaves anything an image service
// made, or an administrator uploaded, alone. It is free and quick, and safe to run again.
//
//   npm run textures:refresh                 repaint all of them
//   npm run textures:refresh -- --force      repaint even the ones that look unchanged by colour (after a painter change)
//   npm run textures:refresh -- --dry-run    only say which would change
//   npm run textures:refresh -- --kind root  only the ones painted as that kind (meat, root, bread, ...)
//   npm run textures:refresh -- --only "fish fillet,crushed potatoes"

import { createClient } from '@supabase/supabase-js'
import { backend } from '../lib/backend'
import { config } from '../lib/config'
import { mockTextureProvider } from '../lib/textures/mock'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const only = (() => {
  const at = args.indexOf('--only')
  return at >= 0 ? args[at + 1]?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : undefined
})()

const kind = (() => {
  const at = args.indexOf('--kind')
  return at >= 0 ? args[at + 1] : undefined
})()

async function main() {
  const c = config()
  if (!c.supabaseUrl || !c.serviceKey) throw new Error('This needs the Supabase service key in the environment.')
  const sb = createClient(c.supabaseUrl, c.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data, error } = await sb.from('ingredient_textures').select('key, name, path, model, avg_color').eq('status', 'ready').like('model', 'procedural:%')
  if (error) throw new Error(error.message)
  const rows = (data ?? []).filter((r) => (!only || only.includes(r.key)) && (!kind || r.model === `procedural:${kind}`))
  console.log(`${rows.length} locally painted textures${only ? ' (chosen)' : ''}.`)

  let changed = 0
  for (const row of rows) {
    const made = await mockTextureProvider.generate(row.name)
    const same = !flag('force') && made.model === row.model && made.avgColor === row.avg_color
    if (same) continue
    changed++
    console.log(`  ${flag('dry-run') ? 'would repaint' : 'repainting   '} ${row.name}  (${row.model} ${row.avg_color} -> ${made.model} ${made.avgColor})`)
    if (flag('dry-run')) continue
    await backend.textures.complete(row.key, made.bytes, made.mime, { avgColor: made.avgColor ?? null, model: made.model, prompt: made.prompt, source: 'generated' })
    // The old picture is no longer referenced by anything.
    if (row.path) await sb.storage.from('media').remove([row.path])
  }
  console.log(`${changed} ${flag('dry-run') ? 'would change' : 'repainted'}, ${rows.length - changed} already up to date.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
