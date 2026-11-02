import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { describePlacement, describeTweaks } from '@/lib/describe'
import { PLATE_GEOMETRY, PLATE_PROFILE, elevations, layout, liquidFill, plateSurfaceY, rng } from '@/lib/layout'
import { buildPlatingModel } from '@/lib/model3d'
import { resolveHex } from '@/lib/palette'
import { costPerBatch, priceForImage, qualityForPurpose } from '@/lib/pricing'
import { DIRECTIONS, buildSpread, promptFromSpec } from '@/lib/spec'
import { suggestComponents, toComponents } from '@/lib/suggest'
import type { Component, Dish, PlatingSpec } from '@/lib/types'

const dish = (name: string, components: Array<[string, Component['role']]>): Dish => ({
  id: 'd',
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  components: components.map(([n, role], i) => ({ id: `c${i + 1}`, name: n, role, imagePath: null })),
})

const DISHES: Dish[] = [
  dish('Duck', [['Seared duck breast', 'hero'], ['Celeriac puree', 'support'], ['Charred baby leek', 'support'], ['Red wine jus', 'sauce'], ['Micro chervil', 'garnish']]),
  dish('Burger', [['Brioche bun', 'support'], ['Beef patty', 'hero'], ['Cheddar', 'support'], ['Tomato', 'support'], ['Lettuce', 'garnish']]),
  dish('Pasta', [['Tagliatelle', 'hero'], ['Ragu', 'sauce'], ['Parmesan', 'garnish']]),
  dish('Minimal', [['Salmon fillet', 'hero']]),
]

const spec = (over: Partial<PlatingSpec> = {}): PlatingSpec => ({
  id: 'spec-1',
  composition: 'centered',
  plate: 'round-white',
  sauce: 'pooled',
  height: 'medium',
  garnish: 'moderate',
  notes: '',
  overrides: {},
  seed: 1234,
  ...over,
})

describe('layout engine', () => {
  it('gives the same layout for the same spec, every time', () => {
    for (const d of DISHES) for (const { spec: s } of buildSpread(12, 99)) assert.deepEqual(layout(d, s), layout(d, s))
  })

  it('has a deterministic random generator that varies with the seed', () => {
    const a = rng(7)
    const b = rng(7)
    assert.deepEqual([a(), a(), a()], [b(), b(), b()])
    assert.notEqual(rng(7)(), rng(8)())
    const r = rng(1)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      assert.ok(v >= 0 && v < 1)
    }
  })

  it('keeps every element on the plate, for every direction, dish and seed', () => {
    for (const d of DISHES) {
      for (const seed of [1, 42, 9999, 123456]) {
        for (const { spec: s } of buildSpread(12, seed)) {
          const l = layout(d, s)
          // Positions are frame units with the plate centred at (0.5, 0.5).
          for (const e of l.elements) {
            assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `${d.name}/${s.composition}: finite position`)
            const reach = Math.hypot(e.x - 0.5, e.y - 0.5) / l.plate.radius
            assert.ok(reach <= 1, `${d.name}/${s.composition}/${s.plate}: ${e.name} sits at ${(reach * 100).toFixed(0)}% of the plate radius`)
          }
        }
      }
    }
  })

  it('places every component of the dish', () => {
    const d = DISHES[0]
    const l = layout(d, spec())
    for (const c of d.components.filter((x) => x.role !== 'sauce' && x.role !== 'garnish')) {
      assert.ok(l.elements.some((e) => e.componentId === c.id), `${c.name} is on the plate`)
    }
  })

  it('applies a drag override on top of the preset without moving anything else', () => {
    const d = DISHES[0]
    const base = layout(d, spec())
    const hero = base.elements.find((e) => e.role === 'hero')!
    const moved = layout(d, spec({ overrides: { [hero.key]: { x: 0.31, y: -0.2 } } }))
    const after = moved.elements.find((e) => e.key === hero.key)!
    assert.ok(Math.abs(after.x - 0.31) < 0.05 || after.x !== hero.x, 'the hero moved')
    for (const e of base.elements.filter((x) => x.key !== hero.key && x.role !== 'garnish')) {
      const same = moved.elements.find((x) => x.key === e.key)
      assert.ok(same, `${e.key} still exists`)
    }
  })

  it('duplicates a component when copies are set', () => {
    const d = DISHES[2]
    const one = layout(d, spec())
    const three = layout(d, spec({ copies: { c1: 2 } }))
    assert.ok(three.elements.filter((e) => e.componentId === 'c1').length > one.elements.filter((e) => e.componentId === 'c1').length)
  })

  it('has geometry for every plate style', () => {
    for (const style of ['round-white', 'black-slate', 'square-white', 'deep-bowl', 'shallow-bowl', 'wooden-board', 'coupe-grey'] as const) {
      assert.ok(PLATE_GEOMETRY[style].radius > 0)
    }
  })

  it('has a shallow bowl that is between the coupe and the deep bowl, holds a liquid, and is built into the model', () => {
    const rim = (style: 'coupe-grey' | 'shallow-bowl' | 'deep-bowl') => plateSurfaceY(style, 1) - plateSurfaceY(style, 0)
    assert.ok(rim('shallow-bowl') > rim('coupe-grey') + 0.05, 'deeper than a coupe')
    assert.ok(rim('shallow-bowl') < rim('deep-bowl') * 0.7, 'a good deal shallower than the deep bowl')
    assert.ok(liquidFill('shallow-bowl').depth === liquidFill('deep-bowl').depth, 'it holds a liquid, as the deep bowl does')
    // The outline closes on the axis and the face runs outward, as plateSurfaceY and the lathe both assume.
    const p = PLATE_PROFILE['shallow-bowl']
    assert.equal(p[0][0], 0)
    assert.equal(p[p.length - 1][0], 0)
    const names = (spec: PlatingSpec) => (buildPlatingModel(DISHES[2], spec).gltf.nodes as Array<{ name?: string }>).map((n) => n.name)
    assert.ok(names(spec({ plate: 'shallow-bowl' })).includes('plate'))
    // A different plate is a different model, and the same plate always builds the same one.
    const hashOf = (s: PlatingSpec) => createHash('sha1').update(JSON.stringify(buildPlatingModel(DISHES[2], s).gltf)).digest('hex')
    assert.notEqual(hashOf(spec({ plate: 'shallow-bowl' })), hashOf(spec({ plate: 'deep-bowl' })))
    assert.equal(hashOf(spec({ plate: 'shallow-bowl' })), hashOf(spec({ plate: 'shallow-bowl' })))
  })

  it('computes finite, plate-relative elevations', () => {
    const d = DISHES[0]
    const s = spec({ height: 'tall' })
    const l = layout(d, s)
    for (const [, e] of elevations(l, s)) {
      assert.ok(Number.isFinite(e.y) && Number.isFinite(e.rx) && Number.isFinite(e.rz))
    }
  })
})

describe('plating directions', () => {
  it('offers twelve distinct, named directions', () => {
    assert.equal(DIRECTIONS.length, 12)
    assert.equal(new Set(DIRECTIONS.map((d) => d.name)).size, 12)
    const signatures = DIRECTIONS.map((d) => JSON.stringify(d.spec))
    assert.equal(new Set(signatures).size, 12, 'no two directions share the same recipe')
  })

  it('builds a spread with unique ids and distinct seeds', () => {
    const spread = buildSpread(12, 5000)
    assert.equal(spread.length, 12)
    assert.equal(new Set(spread.map((s) => s.spec.id)).size, 12)
    assert.equal(new Set(spread.map((s) => s.spec.seed)).size, 12)
    assert.equal(buildSpread(24, 1).length, 24)
  })

  it('writes a prompt that names every component and states each choice', () => {
    const d = DISHES[0]
    const p = promptFromSpec(d, spec(), 'three-quarter')
    for (const c of d.components) assert.ok(p.toLowerCase().includes(c.name.toLowerCase()), `prompt mentions ${c.name}`)
    assert.match(p, /round|white/i)
    assert.match(p, /35-degree|three-quarter/i)
    assert.doesNotMatch(p, /Chef adjustments/, 'no adjustments were made')
    assert.match(promptFromSpec(d, spec({ notes: 'lose one leek' }), 'top-down'), /lose one leek/)
    assert.match(promptFromSpec(d, spec(), 'top-down'), /overhead/i)
  })

  it('reports chef adjustments in the prompt only when there are some', () => {
    const d = DISHES[0]
    const tweaked = spec({ tweaks: { 'c1:0': { s: 1.4, hidden: false, c: '#aa2200' } } })
    assert.ok(describeTweaks(d, tweaked).length > 0)
    assert.equal(describeTweaks(d, spec()).length, 0)
    assert.ok(describePlacement(d, spec()).items.length >= d.components.length - 2)
  })
})

describe('colour safety', () => {
  it('only ever accepts a six-digit hex override', () => {
    assert.equal(resolveHex('Duck', 'hero', '#AABBCC'), '#AABBCC')
    for (const bad of ['red', '#abc', '#gggggg', 'url(javascript:alert(1))', '"><script>', '#12345', '#1234567']) {
      const out = resolveHex('Duck', 'hero', bad)
      assert.match(out, /^#[0-9a-f]{6}$/i)
      assert.notEqual(out, bad)
    }
  })
})

describe('component suggestions', () => {
  it('reads a dish name into hero, sides, sauce and garnish', () => {
    const s = suggestComponents('Duck breast, celeriac, red wine')
    const components = toComponents(s)
    assert.ok(components.length >= 3)
    assert.ok(components.some((c) => c.role === 'hero'))
    assert.ok(components.every((c) => c.id && c.name && c.imagePath === null))
  })

  it('understands a one-word dish', () => {
    const roles = toComponents(suggestComponents('burger')).map((c) => c.role)
    assert.ok(roles.includes('hero'))
    assert.ok(toComponents(suggestComponents('burger')).some((c) => /bun/i.test(c.name)))
  })

  it('does not crash on nonsense, emptiness or very long input', () => {
    for (const input of ['', '   ', '???', 'x'.repeat(5000), '🍣🍣🍣']) {
      assert.doesNotThrow(() => toComponents(suggestComponents(input)))
    }
  })
})

describe('pricing', () => {
  it('prices a batch by the quality each stage really runs at', () => {
    const spread = costPerBatch(12, 'spread')
    assert.ok(spread.length >= 3)
    for (const line of spread) assert.equal(line.batchCost, +(line.usdPerImage * 12).toFixed(4))
    assert.ok(priceForImage('gpt-image', 'high') > priceForImage('gpt-image', 'low'))
    assert.equal(priceForImage('mock'), 0)
    assert.equal(qualityForPurpose('final'), 'high')
    assert.equal(qualityForPurpose('spread'), 'low')
  })
})

// The parts of a glTF document these tests read.
type Gltf = {
  asset: { version: string }
  scenes: unknown[]
  nodes: Array<{ mesh?: number }>
  meshes: Array<{ primitives: Array<{ material: number }> }>
  materials: unknown[]
  buffers: Array<{ uri: string; byteLength: number }>
  bufferViews: Array<{ byteOffset: number; byteLength: number }>
  accessors: Array<{ count: number; type: string; componentType: number; bufferView: number; byteOffset?: number; min?: number[]; max?: number[] }>
}

describe('3D model (glTF)', () => {
  const d = DISHES[0]

  it('produces a valid, self-consistent glTF 2.0 document', () => {
    const { gltf, parts, plateRadius } = buildPlatingModel(d, spec()) as unknown as { gltf: Gltf; parts: number; plateRadius: number }
    assert.equal(gltf.asset.version, '2.0')
    assert.ok(parts >= 5 && plateRadius > 0)
    assert.ok(gltf.scenes.length === 1 && gltf.nodes.length >= parts)

    const buffer = gltf.buffers[0]
    const bytes = Buffer.from(buffer.uri.split(',')[1], 'base64')
    assert.equal(bytes.length, buffer.byteLength, 'declared buffer length matches the data')

    for (const view of gltf.bufferViews) assert.ok(view.byteOffset + view.byteLength <= buffer.byteLength, 'buffer views stay inside the buffer')
    for (const acc of gltf.accessors) {
      assert.ok(acc.count > 0)
      assert.ok(gltf.bufferViews[acc.bufferView], 'accessor points at a real view')
      if (acc.type === 'VEC3' && acc.min && acc.max) {
        for (let i = 0; i < 3; i++) assert.ok(Number.isFinite(acc.min[i]) && Number.isFinite(acc.max[i]) && acc.min[i] <= acc.max[i])
      }
    }
    for (const node of gltf.nodes) if (node.mesh !== undefined) assert.ok(gltf.meshes[node.mesh], 'node points at a real mesh')
    for (const mesh of gltf.meshes) for (const p of mesh.primitives) assert.ok(gltf.materials[p.material], 'primitive points at a real material')
  })

  it('reads every float in the buffer as finite (no NaN geometry)', () => {
    const { gltf } = buildPlatingModel(d, spec({ height: 'tall', composition: 'stacked-tall' })) as unknown as { gltf: Gltf }
    const bytes = Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64')
    for (const acc of gltf.accessors) {
      if (acc.componentType !== 5126) continue // FLOAT
      const view = gltf.bufferViews[acc.bufferView]
      const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type as 'SCALAR']
      for (let i = 0; i < acc.count * width; i++) {
        const v = bytes.readFloatLE(view.byteOffset + (acc.byteOffset ?? 0) + i * 4)
        assert.ok(Number.isFinite(v), `float ${i} of accessor is finite`)
      }
    }
  })

  it('builds a model for every direction and dish without throwing', () => {
    for (const dd of DISHES) for (const { spec: s } of buildSpread(12, 7)) assert.doesNotThrow(() => buildPlatingModel(dd, s), `${dd.name}/${s.composition}`)
  })

  it('is deterministic', () => {
    const a = JSON.stringify(buildPlatingModel(d, spec()).gltf)
    const b = JSON.stringify(buildPlatingModel(d, spec()).gltf)
    assert.equal(a, b)
    assert.notEqual(a, JSON.stringify(buildPlatingModel(d, spec({ seed: 999 })).gltf))
  })

  // A fingerprint of the whole 3D output for a fixed dish and spec. If this changes, the geometry changed:
  // deliberate improvements update the hash, accidental ones (a refactor) fail here.
  it('matches the recorded fingerprint', () => {
    const hash = (dd: Dish, s: PlatingSpec) => createHash('sha256').update(JSON.stringify(buildPlatingModel(dd, s).gltf)).digest('hex').slice(0, 16)
    const actual = {
      duck: hash(DISHES[0], spec()),
      burger: hash(DISHES[1], spec({ composition: 'stacked-tall', height: 'tall', plate: 'black-slate' })),
      pasta: hash(DISHES[2], spec({ composition: 'off-center', plate: 'deep-bowl', sauce: 'drizzled' })),
    }
    assert.deepEqual(actual, GOLDEN)
  })
})

// Recorded from the engine as delivered in FUDDO.zip, before any refactor; re-recorded when every piece's node began
// carrying its form in extras (the geometry is unchanged).
const GOLDEN: Record<string, string> = { duck: '23a946c997439b61', burger: 'fc03d2caa2745357', pasta: 'e38bf17d3cf67106' }
