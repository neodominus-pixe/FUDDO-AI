import { layout, elevations, ladled, plateSurfaceY, plateWellRadius } from '../engine/layout'
import type { Layout } from '../engine/layout'
import { resolveHex } from '../palette'
import { strokeKey } from './strokes'
import type { Dish, PlateStyle, PlatingSpec } from '../types'

// The live scene is driven by the same pure functions that build the model on the server. Given a dish and a
// spec, this says where every element stands in scene units: plate rim at +/-1 on X and Z, Y up from the table.
// The viewer applies these poses to nodes that already exist, so an edit that only moves, resizes, turns or
// recolours something never has to rebuild the model.

export type Pose = {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  /** Rotation about the vertical axis, degrees. */
  yaw: number
  /** How far it leans from upright, [about X, about Z] in degrees. */
  tilt: [number, number]
}

export type ElementMeta = { name: string; role: string }

export type PlateShape = 'circle' | 'square' | 'board'

export type ScenePoses = {
  radius: number
  shape: PlateShape
  plate: PlateStyle
  poses: Map<string, Pose>
  meta: Map<string, ElementMeta>
  /** Where the sauce stands as a whole, in scene units. Null when the dish has none. */
  sauce: { x: number; z: number } | null
  /** One pose per spoonful or dot of sauce, in the order the model builder places them. */
  sauceMarks: Pose[]
  /** Middle of a drizzle, which is one swept piece rather than many marks. Empty when there is none. */
  strokes: Array<{ x: number; z: number }>
  /** Painted strokes, each its own piece: its key, its place in `spec.brush`, and where its middle is in scene units. */
  brush: Array<{ key: string; index: number; x: number; z: number }>
  /** Identifies the shape of every run of sauce (a drizzle, painted strokes), ignoring where each stands. Marks are not part of it: they are posed. */
  strokeShape: string
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

export function posesFrom(l: Layout, spec: PlatingSpec): ScenePoses {
  const R = l.plate.radius
  const toScene = (v: number) => (v - 0.5) / R
  const elev = elevations(l, spec)
  const poses = new Map<string, Pose>()
  const meta = new Map<string, ElementMeta>()
  for (const el of l.elements) {
    const e = elev.get(el.key)
    if (!e) continue
    poses.set(el.key, {
      x: toScene(el.x),
      y: e.y,
      z: toScene(el.y),
      sx: e.rx,
      sy: e.ry,
      sz: e.rz,
      yaw: el.rotation + (spec.tweaks?.[el.key]?.r ?? 0),
      tilt: e.tilt ?? [0, 0],
    })
    meta.set(el.key, { name: el.name, role: el.role })
  }

  const placed = [...l.sauce.marks, ...l.sauce.samples]
  const mean = (list: Array<{ x: number; y: number }>) =>
    list.length ? { x: toScene(list.reduce((a, m) => a + m.x, 0) / list.length), z: toScene(list.reduce((a, m) => a + m.y, 0) / list.length) } : null
  const sauce = mean(placed)

  // A spoonful that was ladled over something sits on it; every other mark lies on the plate.
  const sauceMarks: Pose[] = l.sauce.marks.map((m) => {
    const x = toScene(m.x)
    const z = toScene(m.y)
    const seat = m.over ? elev.get(m.over) : undefined
    const on = m.over ? ladled(l, spec, elev, m.over) : undefined
    const y = seat && on ? on.y : plateSurfaceY(spec.plate, Math.min(1, Math.hypot(x, z))) + 0.006
    return { x, y, z, sx: m.rx / R, sy: seat ? (on?.thickness ?? 0.06) : 0.02, sz: m.ry / R, yaw: 0, tilt: [0, 0] }
  })
  // Each run is one swept piece in the model, posed by its middle. Its shape (and width) is what decides whether the
  // model has to be rebuilt; where it stands is just a move.
  const runs = l.sauce.strokes.filter((s) => s.samples.length > 1)
  const middles = runs.map((s) => mean(s.samples) ?? { x: 0, z: 0 })
  const strokeShape = JSON.stringify(
    runs.map((s, i) => [s.free ? s.index : -1, r3(s.width), s.samples.map((m) => [r3(toScene(m.x) - middles[i].x), r3(toScene(m.y) - middles[i].z)])]),
  )
  // The sauce's own runs (a drizzle) go with the sauce; each painted stroke is posed by itself.
  const strokes = runs.flatMap((s, i) => (s.free ? [] : [middles[i]]))
  const brush = runs.flatMap((s, i) => (s.free ? [{ key: strokeKey(s.index), index: s.index, ...middles[i] }] : []))
  return { radius: R, shape: l.plate.shape, plate: spec.plate, poses, meta, sauce, sauceMarks, strokes, brush, strokeShape }
}

export function computePoses(dish: Dish, spec: PlatingSpec): ScenePoses {
  return posesFrom(layout(dish, spec), spec)
}

/**
 * Everything that decides WHAT is in the model, as opposed to where it stands or what colour it is. While this
 * stays the same the loaded model is still the right model and edits are applied to it in place; when it changes
 * the model has to be built again.
 */
export function modelKey(dish: Dish, spec: PlatingSpec, scene: ScenePoses = computePoses(dish, spec)): string {
  const tweaks = Object.entries(spec.tweaks ?? {})
    .map(([key, t]) => {
      // Shape variant and hidden change the geometry. Everything else is a pose or a colour.
      const own = [t.v, t.hidden]
      return own.some((v) => v !== undefined) ? [key, ...own] : null
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return JSON.stringify([
    dish.components.filter((c) => c.name.trim()).map((c) => [c.id, c.name.trim(), c.role]),
    spec.composition,
    spec.plate,
    spec.sauce,
    spec.height,
    spec.garnish,
    spec.seed,
    Object.entries(spec.copies ?? {})
      .filter(([, n]) => n)
      .sort(([a], [b]) => a.localeCompare(b)),
    tweaks,
    [...scene.poses.keys()],
    scene.sauceMarks.length,
    scene.strokeShape,
  ])
}

/** The colour an element renders in, as the model builder would pick it. */
export function elementHex(meta: ElementMeta, spec: PlatingSpec, key: string): string {
  return resolveHex(meta.name, meta.role, spec.tweaks?.[key]?.c)
}

/** How far out food may be put by hand, in scene units, for a plate. */
export function placementReach(plate: PlateStyle, shape: PlateShape): number {
  if (shape === 'circle') return Math.max(plateWellRadius(plate), 0.7) * 0.97
  return shape === 'board' ? 0.8 : 0.78
}

/** Keeps a point on the plate. Circles by distance from the middle, slabs and boards by their edges. */
export function clampToPlate(x: number, z: number, plate: PlateStyle, shape: PlateShape): [number, number] {
  const reach = placementReach(plate, shape)
  if (shape === 'circle') {
    const d = Math.hypot(x, z)
    return d > reach ? [(x / d) * reach, (z / d) * reach] : [x, z]
  }
  return [Math.min(reach, Math.max(-reach, x)), Math.min(reach, Math.max(-reach, z))]
}

/** Scene units to the frame coordinates the spec stores, and back. */
export const toFrame = (v: number, radius: number) => 0.5 + v * radius
export const fromFrame = (v: number, radius: number) => (v - 0.5) / radius
