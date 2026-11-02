import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_STROKES, brushTaper, pathLength, resample, ribbonOutline, simplify, smoothPath, type Pt } from '@/lib/engine/layout/brush'
import { layout } from '@/lib/layout'
import { buildPlatingModel } from '@/lib/model3d'
import { PlatingSpecSchema } from '@/lib/schemas'
import { computePoses, modelKey } from '@/lib/scene/poses'
import { strokeIndex, strokeKey, translateStroke, translateStrokes, withoutStroke } from '@/lib/scene/strokes'
import { promptFromSpec } from '@/lib/spec'
import type { Dish, PlatingSpec } from '@/lib/types'

const dish: Dish = {
  id: 'd',
  name: 'Duck',
  createdAt: '2026-01-01T00:00:00.000Z',
  components: [
    { id: 'c1', name: 'Seared duck breast', role: 'hero', imagePath: null },
    { id: 'c2', name: 'Celeriac puree', role: 'support', imagePath: null },
    { id: 'c3', name: 'Red wine jus', role: 'sauce', imagePath: null },
  ],
}
const noSauce: Dish = { ...dish, components: dish.components.filter((c) => c.role !== 'sauce') }

const spec = (over: Partial<PlatingSpec> = {}): PlatingSpec => ({
  id: 's',
  composition: 'centered',
  plate: 'round-white',
  sauce: 'pooled',
  height: 'medium',
  garnish: 'minimal',
  notes: '',
  overrides: {},
  seed: 7,
  ...over,
})

const swoosh: Pt[] = [
  [0.25, 0.6],
  [0.35, 0.52],
  [0.45, 0.5],
  [0.55, 0.52],
  [0.65, 0.6],
]

describe('brush helpers', () => {
  it('measure a line', () => {
    assert.equal(pathLength([[0, 0], [3, 0], [3, 4]]), 7)
    assert.equal(pathLength([[0.5, 0.5]]), 0)
  })

  it('simplify a drawn line to its shape, keeping the ends and the corners', () => {
    const wobbly: Pt[] = Array.from({ length: 41 }, (_, i) => [i / 40, 0.5 + (i % 2 ? 0.0004 : -0.0004)] as Pt)
    const flat = simplify(wobbly, 0.01)
    assert.deepEqual(flat, [wobbly[0], wobbly[40]])
    const corner = simplify([[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1]], 0.01)
    assert.deepEqual(corner, [[0, 0], [1, 0], [1, 1]])
    assert.deepEqual(simplify([[0, 0], [1, 1]], 0.1), [[0, 0], [1, 1]])
  })

  it('resample evenly, keeping both ends and never exceeding the maximum', () => {
    const line: Pt[] = [[0, 0], [1, 0]]
    const even = resample(line, 0.25)
    assert.equal(even.length, 5)
    assert.deepEqual(even[0], [0, 0])
    assert.deepEqual(even[4], [1, 0])
    for (let i = 1; i < even.length; i++) assert.ok(Math.abs(even[i][0] - even[i - 1][0] - 0.25) < 1e-9)
    assert.ok(resample(line, 0.0001, 10).length <= 10)
    assert.equal(resample([[0.2, 0.2]], 0.1).length, 1)
  })

  it('taper is fine at both ends and full in the middle', () => {
    assert.ok(brushTaper(0) < 0.3 && brushTaper(1) < 0.3)
    assert.ok(Math.abs(brushTaper(0.5) - 1) < 1e-9)
    assert.ok(brushTaper(0.5) > brushTaper(0.1))
  })

  it('draw a smooth path and a closed ribbon', () => {
    assert.match(smoothPath(swoosh), /^M [\d. ]+( C [\d., ]+){4}$/)
    assert.equal(smoothPath([[0, 0]]), '')
    const ribbon = ribbonOutline(swoosh, 0.02)
    assert.ok(ribbon.startsWith('M ') && ribbon.endsWith(' Z'))
    assert.equal(ribbon.split(' L ').length, swoosh.length * 2)
    assert.equal(ribbonOutline([[0, 0]], 0.1), '')
  })
})

describe('painted sauce in the plating', () => {
  it('adds a run of sauce to whatever style is chosen, and leaves the style alone', () => {
    const plain = layout(dish, spec())
    const painted = layout(dish, spec({ brush: [{ w: 1, pts: swoosh }] }))
    assert.equal(painted.sauce.marks.length, plain.sauce.marks.length, 'the pool is still there')
    const free = painted.sauce.strokes.filter((s) => s.free)
    assert.equal(free.length, 1)
    assert.ok(free[0].samples.length >= 8)
    assert.match(free[0].path, /^M /)
    assert.match(free[0].outline, / Z$/)
    for (const m of free[0].samples) assert.ok(m.x > 0 && m.x < 1 && m.y > 0 && m.y < 1)
  })

  it('keeps a stroke even when the dish has no sauce in its list', () => {
    assert.equal(layout(noSauce, spec()).sauce.strokes.length, 0, 'nothing is invented')
    const painted = layout(noSauce, spec({ brush: [{ w: 1, pts: swoosh }] }))
    assert.equal(painted.sauce.strokes.length, 1)
    assert.equal(painted.sauce.marks.length, 0, 'the style that would have been laid out is not used')
  })

  it('keeps a stroke on the plate however far off it was drawn', () => {
    const l = layout(dish, spec({ brush: [{ w: 1, pts: [[0.01, 0.01], [0.99, 0.99]] }] }))
    for (const m of l.sauce.strokes[0].samples) assert.ok(Math.hypot(m.x - 0.5, m.y - 0.5) <= l.plate.radius + 1e-9)
  })

  it('stands where it was drawn, whatever the rest of the sauce does', () => {
    const base = layout(dish, spec({ brush: [{ w: 1, pts: swoosh }] })).sauce
    const moved = layout(dish, spec({ brush: [{ w: 1, pts: swoosh }], overrides: { sauce: { x: 0.5, y: 0.7 } } })).sauce
    const free = (l: typeof base) => l.strokes.find((x) => x.free)!
    assert.deepEqual(free(moved).samples, free(base).samples, 'the stroke did not follow the pool')
    assert.notDeepEqual(moved.marks, base.marks, 'the pool did move')
    const grown = layout(dish, spec({ brush: [{ w: 1, pts: swoosh }], tweaks: { sauce: { s: 1.5, r: 40 } } })).sauce
    assert.deepEqual(free(grown).samples, free(base).samples, 'nor did it grow or turn with it')
    assert.equal(free(base).index, 0)
  })

  it('knows its place in the brush list, so it can be told apart from the others', () => {
    const l = layout(dish, spec({ sauce: 'drizzled', brush: [{ w: 1, pts: swoosh }, { w: 1, pts: [[0.3, 0.4], [0.5, 0.35], [0.7, 0.4]] }] }))
    assert.deepEqual(l.sauce.strokes.map((s) => [s.free, s.index]), [[false, -1], [true, 0], [true, 1]])
    assert.equal(l.sauce.samples.length, l.sauce.strokes[0].samples.length, "samples are the style's own sauce, not the painted strokes")
  })

  it('ignores strokes beyond the limit', () => {
    const many = Array.from({ length: MAX_STROKES + 4 }, () => ({ w: 1, pts: swoosh }))
    assert.equal(layout(dish, spec({ brush: many })).sauce.strokes.filter((s) => s.free).length, MAX_STROKES)
  })

  it('builds one swept piece per stroke in the 3D model, each with a key of its own, and is deterministic', () => {
    const s = spec({ brush: [{ w: 1, pts: swoosh }, { w: 2, pts: [[0.3, 0.4], [0.5, 0.35], [0.7, 0.4]] }] })
    const a = buildPlatingModel(dish, s)
    const keysOf = (m: typeof a) => (m.gltf as { nodes: Array<{ extras?: { key?: string } }> }).nodes.map((n) => n.extras?.key).filter(Boolean)
    const withStrokes = keysOf(a)
    const none = keysOf(buildPlatingModel(dish, spec()))
    assert.deepEqual(withStrokes.filter((k) => k?.startsWith('stroke:')), ['stroke:0', 'stroke:1'])
    assert.equal(withStrokes.filter((k) => k === 'sauce').length, none.filter((k) => k === 'sauce').length, 'the pool is unchanged')
    assert.equal(JSON.stringify(buildPlatingModel(dish, s).gltf), JSON.stringify(a.gltf))
  })

  it('shows up in the prompt a paid model would be sent', () => {
    const p = promptFromSpec(dish, spec({ brush: [{ w: 1, pts: swoosh }, { w: 1, pts: swoosh }] }), 'top-down')
    assert.match(p, /2 hand-painted swooshes of Red wine jus/)
    assert.match(promptFromSpec(dish, spec({ brush: [{ w: 1, pts: swoosh }] }), 'top-down'), /one hand-painted swoosh of Red wine jus/)
    assert.doesNotMatch(promptFromSpec(dish, spec(), 'top-down'), /hand-painted/)
    const alone = promptFromSpec(noSauce, spec({ brush: [{ w: 1, pts: swoosh }] }), 'top-down')
    assert.match(alone, /Sauce: one hand-painted swoosh of sauce swept across the plate\./)
  })
})

describe('painted sauce in the live scene', () => {
  it('is a rebuild to add or reshape a stroke, but a plain move to carry it', () => {
    const inner: Pt[] = [[0.43, 0.5], [0.47, 0.48], [0.5, 0.47], [0.53, 0.48], [0.57, 0.5]]
    const base = spec({ brush: [{ w: 1, pts: inner }] })
    const key = (s: PlatingSpec) => modelKey(dish, s)
    assert.notEqual(key(base), key(spec()), 'a new stroke is a new piece')
    assert.notEqual(key(base), key(spec({ brush: [{ w: 1.7, pts: inner }] })), 'a wider one is another shape')
    assert.notEqual(key(base), key(spec({ brush: [{ w: 1, pts: inner.map(([x, y]) => [x, y + 0.03] as Pt).reverse().slice(1) }] })), 'a different line is another shape')
    assert.equal(key(spec({ brush: [{ w: 1, pts: inner }], overrides: { sauce: { x: 0.52, y: 0.5 } } })), key(base), 'carrying the sauce is a move')
    assert.equal(key(spec({ brush: [{ w: 1, pts: inner }], tweaks: { sauce: { c: '#552211' } } })), key(base), 'recolouring is not a rebuild')
  })

  it('is a plain move to carry a stroke, until it runs into the edge of the plate', () => {
    const inner: Pt[] = [[0.43, 0.5], [0.47, 0.48], [0.5, 0.47], [0.53, 0.48], [0.57, 0.5]]
    const key = (brush: PlatingSpec['brush']) => modelKey(dish, spec({ brush }))
    const base = key([{ w: 1, pts: inner }])
    assert.equal(key(translateStroke([{ w: 1, pts: inner }], 0, 0.03, 0.02)), base, 'carried inside the plate')
    assert.notEqual(key(translateStroke([{ w: 1, pts: inner }], 0, 0.4, 0)), base, 'pushed against the rim it is squashed, so it is rebuilt')
  })

  it('gives each stroke its own pose and its own key, and moves only the one that was moved', () => {
    const second: Pt[] = [[0.4, 0.4], [0.5, 0.38], [0.6, 0.4]]
    const s = spec({ brush: [{ w: 1, pts: swoosh }, { w: 1, pts: second }] })
    const poses = computePoses(dish, s)
    assert.deepEqual(poses.brush.map((b) => b.key), ['stroke:0', 'stroke:1'])
    assert.equal(poses.strokes.length, 0, 'none of them belongs to the sauce')

    const moved = computePoses(dish, { ...s, brush: translateStroke(s.brush!, 1, 0.04, 0) })
    assert.ok(moved.brush[1].x > poses.brush[1].x, 'the second one moved')
    assert.equal(moved.brush[0].x, poses.brush[0].x, 'the first did not')
    assert.deepEqual(computePoses(dish, { ...s, overrides: { sauce: { x: 0.56, y: 0.5 } } }).brush, poses.brush, 'carrying the pool leaves them be')
  })
})

describe('moving strokes one at a time', () => {
  const brush = [
    { w: 1, pts: [[0.3, 0.5], [0.4, 0.45], [0.5, 0.5]] as Pt[] },
    { w: 1.8, pts: [[0.5, 0.6], [0.6, 0.62], [0.7, 0.6]] as Pt[] },
  ]

  it('name a stroke by its place, and read the name back', () => {
    assert.equal(strokeKey(3), 'stroke:3')
    assert.equal(strokeIndex('stroke:3'), 3)
    for (const other of ['sauce', 'c1:0', 'stroke:', 'stroke:x', 'xstroke:1', 'stroke:1:2', '']) assert.equal(strokeIndex(other), null, other)
  })

  it('carry every point of one stroke by the same amount and leave the rest alone', () => {
    const next = translateStroke(brush, 1, 0.05, -0.02)
    assert.deepEqual(next[0], brush[0])
    assert.deepEqual(next[1].pts, [[0.55, 0.58], [0.65, 0.6], [0.75, 0.58]])
    assert.equal(next[1].w, 1.8)
    assert.equal(brush[1].pts[0][0], 0.5, 'the original was not touched')
  })

  it('stop a stroke at the edge of the picture instead of bending it', () => {
    const far = translateStroke(brush, 0, 5, -5)
    const xs = far[0].pts.map((p) => p[0])
    const ys = far[0].pts.map((p) => p[1])
    assert.ok(Math.abs(Math.max(...xs) - 0.94) < 1e-9)
    assert.ok(Math.abs(Math.min(...ys) - 0.06) < 1e-9)
    assert.ok(Math.abs(far[0].pts[1][0] - far[0].pts[0][0] - 0.1) < 1e-9, 'the shape is intact')
  })

  it('ignore a stroke that is not there, and move several by their own amounts', () => {
    assert.equal(translateStroke(brush, 7, 0.1, 0.1), brush)
    const both = translateStrokes(brush, [{ index: 0, dx: 0.1, dy: 0 }, { index: 1, dx: 0, dy: -0.1 }])
    assert.deepEqual(both[0].pts[0], [0.4, 0.5])
    assert.deepEqual(both[1].pts[0], [0.5, 0.5])
  })

  it('take one stroke out, and drop the brush entirely when none are left', () => {
    const s = spec({ brush })
    assert.deepEqual(withoutStroke(s, 0).brush, [brush[1]])
    assert.equal(withoutStroke(withoutStroke(s, 0), 0).brush, undefined)
  })
})

describe('brush in the spec schema', () => {
  it('accepts well-formed strokes', () => {
    assert.ok(PlatingSpecSchema.safeParse(spec({ brush: [{ w: 1, pts: swoosh }] })).success)
    assert.ok(PlatingSpecSchema.safeParse(spec()).success, 'brush is optional')
  })

  it('refuses a stroke that is too wide, too short, too long, off the plate frame, or too many', () => {
    const bad = (brush: unknown) => !PlatingSpecSchema.safeParse({ ...spec(), brush }).success
    assert.ok(bad([{ w: 9, pts: swoosh }]))
    assert.ok(bad([{ w: 0.01, pts: swoosh }]))
    assert.ok(bad([{ w: 1, pts: [[0.5, 0.5]] }]))
    assert.ok(bad([{ w: 1, pts: Array.from({ length: 65 }, () => [0.5, 0.5]) }]))
    assert.ok(bad([{ w: 1, pts: [[0.5, 0.5], [1.5, 0.5]] }]))
    assert.ok(bad(Array.from({ length: 9 }, () => ({ w: 1, pts: swoosh }))))
    assert.ok(bad([{ w: 1, pts: [[0.5, 'x'], [0.5, 0.5]] }]))
  })
})
