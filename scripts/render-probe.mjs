// Renders a plate of several components through both renderers and checks the
// output is sane: every element present, nothing off the plate, no NaN in the
// geometry. The picture lands in data/shape-sheet/ next to the contact sheet.
//
//   node scripts/render-probe.mjs
import { register } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
register('./ts-ext.mjs', import.meta.url)
const { renderSvg } = await import('../lib/providers/mock.ts')
const { buildPlatingModel } = await import('../lib/model3d.ts')
const { layout } = await import('../lib/layout.ts')
const { familyFor } = await import('../lib/shapes.ts')

const names = process.argv.slice(2)
const components = (
  names.length
    ? names.map((n, i) => ({ name: n, role: i === 0 ? 'hero' : 'support' }))
    : [
        { name: 'lamb kofta skewers', role: 'hero' },
        { name: 'pizza slice', role: 'support' },
        { name: 'onion rings', role: 'support' },
        { name: 'meatballs', role: 'support' },
        { name: 'ravioli', role: 'support' },
        { name: 'harissa yoghurt', role: 'sauce' },
        { name: 'coriander', role: 'garnish' },
      ]
).map((c, i) => ({ id: `c${i}`, imagePath: null, ...c }))

const dish = { id: 'probe', name: 'Coverage probe', components, createdAt: new Date().toISOString() }
const spec = {
  id: 's1', composition: 'scattered', plate: 'round-white', sauce: 'dotted', height: 'medium',
  garnish: 'moderate', notes: '', overrides: {}, seed: 7,
}

const l = layout(dish, spec)
console.log(`${components.length} components -> ${l.elements.length} elements`)
for (const el of l.elements) {
  console.log(
    `  ${el.name.padEnd(20)} ${familyFor(el.name, el.role).padEnd(8)} at ${el.x.toFixed(2)},${el.y.toFixed(2)}` +
      (el.x < 0 || el.x > 1 || el.y < 0 || el.y > 1 ? '  OFF THE PLATE' : ''),
  )
}

const svg = renderSvg({ dish, spec, angle: 'three-quarter' })
mkdirSync('data/shape-sheet', { recursive: true })
writeFileSync('data/shape-sheet/probe.svg', svg)
console.log(`\n2D: ${svg.length} bytes, ${(svg.match(/<path/g) ?? []).length} paths -> data/shape-sheet/probe.svg`)

const model = buildPlatingModel(dish, spec)
const json = JSON.stringify(model.gltf)

// Checked as numbers rather than by grepping the JSON for "NaN". The whole
// buffer rides in that string as base64, and base64 of ordinary geometry
// contains the letters N, a, N next to each other about as often as you would
// expect it to -- so the text check cried wolf on a perfectly good model.
const faults = []
const finite = (what, values) => {
  for (const v of values) if (!Number.isFinite(v)) { faults.push(what); return }
}
for (const [i, n] of model.gltf.nodes.entries()) {
  finite(`node ${i} (${n.name ?? '?'})`, [...(n.translation ?? []), ...(n.scale ?? []), ...(n.rotation ?? [])])
  if ((n.scale ?? []).some((v) => v === 0)) faults.push(`node ${i} (${n.name ?? '?'}) is scaled flat`)
}
for (const [i, a] of model.gltf.accessors.entries()) finite(`accessor ${i}`, [...(a.min ?? []), ...(a.max ?? [])])
for (const [i, m] of model.gltf.materials.entries()) finite(`material ${i}`, m.pbrMetallicRoughness.baseColorFactor)

console.log(`3D: ${model.parts} nodes, ${model.materials} materials, ${json.length} bytes` + (faults.length ? `  BROKEN: ${faults.join(', ')}` : ''))
if (faults.length) process.exitCode = 1
