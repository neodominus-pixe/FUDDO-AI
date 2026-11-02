import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPlatingModel } from '@/lib/model3d'
import { clampToPlate, computePoses, modelKey, placementReach } from '@/lib/scene/poses'
import { alignSpots, arrayPositions, distributeSpots, fromCm, gapCm, mirrorSpots, toCm } from '@/lib/scene/arrange'
import { snapPoint } from '@/lib/scene/snap'
import { PlatingSpecSchema } from '@/lib/schemas'
import type { Dish, PlatingSpec } from '@/lib/types'

const dish: Dish = {
  id: 'd',
  name: 'Duck',
  createdAt: '2026-01-01T00:00:00.000Z',
  components: [
    { id: 'c1', name: 'Seared duck breast', role: 'hero', imagePath: null },
    { id: 'c2', name: 'Celeriac puree', role: 'support', imagePath: null },
    { id: 'c3', name: 'Charred baby leek', role: 'support', imagePath: null },
    { id: 'c4', name: 'Red wine jus', role: 'sauce', imagePath: null },
    { id: 'c5', name: 'Micro chervil', role: 'garnish', imagePath: null },
  ],
}

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

describe('live scene poses', () => {
  it('describe every element the model builder places, at the position it places it', () => {
    const s = spec()
    const poses = computePoses(dish, s)
    const model = buildPlatingModel(dish, s)
    const nodes = (model.gltf as { nodes: Array<{ translation?: number[]; extras?: { key?: string } }> }).nodes
    const keyed = nodes.filter((n) => n.extras?.key && n.extras.key !== 'sauce')
    assert.ok(keyed.length > 0)
    for (const n of keyed) {
      const p = poses.poses.get(n.extras!.key!)
      assert.ok(p, `no pose for ${n.extras!.key}`)
      assert.ok(Math.abs(p.x - n.translation![0]) < 1e-6)
      assert.ok(Math.abs(p.y - n.translation![1]) < 1e-6)
      assert.ok(Math.abs(p.z - n.translation![2]) < 1e-6)
    }
  })

  it('follow a drag: the same spec the drop writes gives the same pose the preview showed', () => {
    const base = computePoses(dish, spec())
    const key = [...base.poses.keys()][1]
    const moved = computePoses(dish, spec({ overrides: { [key]: { x: 0.62, y: 0.4 } } }))
    const p = moved.poses.get(key)!
    assert.ok(Math.abs(p.x - (0.62 - 0.5) / moved.radius) < 1e-9)
    assert.ok(Math.abs(p.z - (0.4 - 0.5) / moved.radius) < 1e-9)
  })

  it('stand a piece higher by exactly its lift, and no other piece moves', () => {
    const base = computePoses(dish, spec())
    const key = [...base.poses.keys()][1]
    const at = base.poses.get(key)!
    const lifted = computePoses(dish, spec({ overrides: { [key]: { x: 0.5 + at.x * base.radius, y: 0.5 + at.z * base.radius, e: 0.2 } } }))
    assert.ok(Math.abs(lifted.poses.get(key)!.y - (at.y + 0.2)) < 1e-9)
    for (const [k, p] of base.poses) if (k !== key) assert.equal(lifted.poses.get(k)!.y, p.y)
  })
})

describe('taking pieces off the plate', () => {
  it('takes a garnish piece off for real, and leaves the others where they were', () => {
    const full = computePoses(dish, spec())
    const garnish = [...full.poses.keys()].filter((k) => k.includes(':g'))
    assert.ok(garnish.length >= 2)
    const off = computePoses(dish, spec({ tweaks: { [garnish[0]]: { hidden: true } } }))
    assert.ok(!off.poses.has(garnish[0]), 'gone')
    for (const k of garnish.slice(1)) assert.deepEqual(off.poses.get(k), full.poses.get(k), 'the rest did not move')
  })
})

describe('when the model has to be rebuilt', () => {
  const key = (s: PlatingSpec) => modelKey(dish, s)
  const first = [...computePoses(dish, spec()).poses.keys()][1]

  it('stays the same for edits that only move, turn, resize or recolour a piece', () => {
    const base = key(spec())
    assert.equal(key(spec({ overrides: { [first]: { x: 0.6, y: 0.45 } } })), base)
    assert.equal(key(spec({ overrides: { [first]: { x: 0.6, y: 0.45, e: 0.1 } } })), base)
    assert.equal(key(spec({ tweaks: { [first]: { h: 1.5, s: 1.2, r: 40, c: '#336699' } } })), base)
    assert.equal(key(spec({ notes: 'wipe the rim' })), base)
  })

  it('changes for edits that change what is in the model', () => {
    const base = key(spec())
    for (const changed of [
      spec({ plate: 'black-slate' }),
      spec({ composition: 'linear' }),
      spec({ garnish: 'generous' }),
      spec({ sauce: 'dotted' }),
      spec({ seed: 99 }),
      spec({ copies: { c2: 2 } }),
      spec({ tweaks: { [first]: { hidden: true } } }),
      spec({ tweaks: { [first]: { v: 3 } } }),
    ]) {
      assert.notEqual(key(changed), base)
    }
  })

  it('treats the sauce moved, resized, turned or recoloured as edits, not rebuilds', () => {
    const base = key(spec())
    assert.equal(key(spec({ overrides: { sauce: { x: 0.55, y: 0.5 } } })), base)
    assert.equal(key(spec({ tweaks: { sauce: { c: '#552211', s: 1.4, r: 30 } } })), base)
  })

  it('rebuilds a drizzle when its curve changes, because it is one swept piece', () => {
    const drizzled = (over: Partial<PlatingSpec> = {}) => modelKey(dish, spec({ sauce: 'drizzled', ...over }))
    assert.equal(drizzled({ overrides: { sauce: { x: 0.505, y: 0.5 } } }), drizzled())
    assert.notEqual(drizzled({ tweaks: { sauce: { s: 1.5 } } }), drizzled())
  })

  it('changes when a component is added or renamed', () => {
    const more = { ...dish, components: [...dish.components, { id: 'c6', name: 'Walnut', role: 'garnish' as const, imagePath: null }] }
    assert.notEqual(modelKey(more, spec()), key(spec()))
  })
})

describe('plate limits', () => {
  it('keep a point on a round plate by distance, and on a slab by its edges', () => {
    const reach = placementReach('round-white', 'circle')
    const [x, z] = clampToPlate(5, 0, 'round-white', 'circle')
    assert.ok(Math.abs(Math.hypot(x, z) - reach) < 1e-9)
    assert.deepEqual(clampToPlate(0.1, -0.2, 'round-white', 'circle'), [0.1, -0.2])
    const [sx, sz] = clampToPlate(5, -5, 'black-slate', 'square')
    assert.equal(sx, placementReach('black-slate', 'square'))
    assert.equal(sz, -placementReach('black-slate', 'square'))
  })
})

describe('snapping', () => {
  it('does nothing when off', () => {
    assert.deepEqual(snapPoint(0.01, 0.02, { enabled: false }), { x: 0.01, z: 0.02, guides: [] })
  })

  it('catches the centre lines and reports the lines it drew', () => {
    const r = snapPoint(0.02, 0.4, { enabled: true })
    assert.equal(r.x, 0)
    assert.equal(r.z, 0.4)
    assert.deepEqual(r.guides, [{ kind: 'axis', axis: 'x', at: 0 }])
  })

  it('lines up with the row of another piece', () => {
    const r = snapPoint(0.5, 0.31, { enabled: true, others: [{ x: -0.3, z: 0.3 }] })
    assert.equal(r.z, 0.3)
  })

  it('catches a ring, keeping the angle', () => {
    const r = snapPoint(0.3, 0.3, { enabled: true, others: [], rings: [0.42] })
    assert.ok(Math.abs(Math.hypot(r.x, r.z) - 0.42) < 1e-9)
    assert.ok(Math.abs(r.x - r.z) < 1e-9)
  })

  it('leaves a point alone when nothing is near', () => {
    const r = snapPoint(0.5, 0.2, { enabled: true, others: [] })
    assert.deepEqual([r.x, r.z, r.guides.length], [0.5, 0.2, 0])
  })
})

describe('spec schema', () => {
  it('accepts a lift on an override and bounds it', () => {
    const ok = PlatingSpecSchema.safeParse(spec({ overrides: { k: { x: 0.5, y: 0.5, e: 0.3 } } }))
    assert.ok(ok.success)
    assert.ok(!PlatingSpecSchema.safeParse(spec({ overrides: { k: { x: 0.5, y: 0.5, e: 99 } } })).success)
  })
})

describe('arranging pieces', () => {
  const spots = [
    { key: 'a', x: -0.5, z: 0.1, r: 0.2 },
    { key: 'b', x: 0.1, z: -0.3, r: 0.1 },
    { key: 'c', x: 0.6, z: 0.4, r: 0.15 },
  ]
  const edge = (p: Record<string, { x: number; z: number }>, key: string, side: 'l' | 'r' | 't' | 'b') => {
    const s = spots.find((x) => x.key === key)!
    return side === 'l' ? p[key].x - s.r : side === 'r' ? p[key].x + s.r : side === 't' ? p[key].z - s.r : p[key].z + s.r
  }

  it('aligns by edge, not by centre, and changes only that axis', () => {
    const left = alignSpots(spots, 'left')
    for (const s of spots) assert.ok(Math.abs(edge(left, s.key, 'l') - -0.7) < 1e-9)
    for (const s of spots) assert.equal(left[s.key].z, s.z)
    const right = alignSpots(spots, 'right')
    for (const s of spots) assert.ok(Math.abs(edge(right, s.key, 'r') - 0.75) < 1e-9)
    const back = alignSpots(spots, 'back')
    for (const s of spots) assert.ok(Math.abs(edge(back, s.key, 't') - -0.4) < 1e-9)
    const mid = alignSpots(spots, 'centerX')
    assert.ok(new Set(Object.values(mid).map((p) => p.x.toFixed(9))).size === 1)
  })

  it('leaves a single piece alone', () => {
    assert.deepEqual(alignSpots([spots[0]], 'left'), { a: { x: -0.5, z: 0.1 } })
    assert.deepEqual(distributeSpots(spots.slice(0, 2), 'x'), { a: { x: -0.5, z: 0.1 }, b: { x: 0.1, z: -0.3 } })
  })

  it('distributes with equal gaps and keeps the outer two where they were', () => {
    const out = distributeSpots(spots, 'x')
    assert.ok(Math.abs(out.a.x - -0.5) < 1e-9)
    assert.ok(Math.abs(out.c.x - 0.6) < 1e-9)
    const gapAB = out.b.x - 0.1 - (out.a.x + 0.2)
    const gapBC = out.c.x - 0.15 - (out.b.x + 0.1)
    assert.ok(Math.abs(gapAB - gapBC) < 1e-9)
    for (const s of spots) assert.equal(out[s.key].z, s.z)
  })

  it('mirrors across a centre line and back again', () => {
    const once = mirrorSpots(spots, 'x')
    assert.equal(once.a.x, 0.5)
    assert.equal(once.a.z, 0.1)
    const twice = mirrorSpots(spots.map((s) => ({ ...s, x: once[s.key].x, z: once[s.key].z })), 'x')
    for (const s of spots) assert.ok(Math.abs(twice[s.key].x - s.x) < 1e-12)
    assert.equal(mirrorSpots(spots, 'z').a.z, -0.1)
  })

  it('lays repeats out in a line, round the plate, or in a fan, the first where the piece already is', () => {
    const from = { x: 0.3, z: 0 }
    const line = arrayPositions('line', 4, from, { spacing: 0.2, angleDeg: 90 })
    assert.equal(line.length, 4)
    assert.deepEqual(line[0], from)
    assert.ok(Math.abs(line[3].z - 0.6) < 1e-9 && Math.abs(line[3].x - 0.3) < 1e-9)

    const ring = arrayPositions('circle', 5, from)
    assert.ok(ring.every((p) => Math.abs(Math.hypot(p.x, p.z) - 0.3) < 1e-9))
    assert.ok(Math.abs(ring[0].x - 0.3) < 1e-9)

    const fan = arrayPositions('arc', 3, from, { angleDeg: 90 })
    assert.ok(fan.every((p) => Math.abs(Math.hypot(p.x, p.z) - 0.3) < 1e-9))
    assert.ok(Math.abs(fan[1].x - 0.3) < 1e-9 && Math.abs(fan[1].z) < 1e-9, 'the middle one stays put')
    assert.deepEqual(arrayPositions('line', 1, from), [from])
  })

  it('reads distances in centimetres on the real plate', () => {
    assert.equal(toCm(1, 'round-white'), 13.5)
    assert.equal(fromCm(13.5, 'round-white'), 1)
    assert.ok(Math.abs(gapCm({ key: 'a', x: 0, z: 0, r: 0.2 }, { key: 'b', x: 0.6, z: 0, r: 0.2 }, 'round-white') - toCm(0.2, 'round-white')) < 1e-9)
    assert.equal(gapCm({ key: 'a', x: 0, z: 0, r: 0.5 }, { key: 'b', x: 0.2, z: 0, r: 0.5 }, 'round-white'), 0, 'touching is a gap of zero, never negative')
  })
})
