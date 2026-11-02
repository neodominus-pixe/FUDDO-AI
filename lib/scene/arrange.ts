import type { PlateStyle } from '../types'

// Arranging several pieces at once, in scene units (plate rim at 1, +x to the right, +z towards the viewer when
// looking down). Pure functions from positions to positions, so every tool is testable and the editor only has to
// write the answers into the spec.

export type Spot = {
  key: string
  x: number
  z: number
  /** Half the width the piece takes up on the plate. Alignment is by edges, not centres. */
  r: number
}

export type Placed = Record<string, { x: number; z: number }>

export type AlignEdge = 'left' | 'right' | 'back' | 'front' | 'centerX' | 'centerZ'

const centres = (spots: Spot[]): Placed => Object.fromEntries(spots.map((s) => [s.key, { x: s.x, z: s.z }]))

/** Lines pieces up on one edge (or on the middle of the group). Needs at least two. */
export function alignSpots(spots: Spot[], edge: AlignEdge): Placed {
  if (spots.length < 2) return centres(spots)
  const out = centres(spots)
  const lo = (f: (s: Spot) => number) => Math.min(...spots.map(f))
  const hi = (f: (s: Spot) => number) => Math.max(...spots.map(f))
  switch (edge) {
    case 'left': {
      const edgeX = lo((s) => s.x - s.r)
      for (const s of spots) out[s.key].x = edgeX + s.r
      break
    }
    case 'right': {
      const edgeX = hi((s) => s.x + s.r)
      for (const s of spots) out[s.key].x = edgeX - s.r
      break
    }
    case 'centerX': {
      const mid = (lo((s) => s.x - s.r) + hi((s) => s.x + s.r)) / 2
      for (const s of spots) out[s.key].x = mid
      break
    }
    case 'back': {
      const edgeZ = lo((s) => s.z - s.r)
      for (const s of spots) out[s.key].z = edgeZ + s.r
      break
    }
    case 'front': {
      const edgeZ = hi((s) => s.z + s.r)
      for (const s of spots) out[s.key].z = edgeZ - s.r
      break
    }
    case 'centerZ': {
      const mid = (lo((s) => s.z - s.r) + hi((s) => s.z + s.r)) / 2
      for (const s of spots) out[s.key].z = mid
      break
    }
  }
  return out
}

/** Spaces pieces so the gaps between them are equal, keeping the two outermost where they are. Needs three. */
export function distributeSpots(spots: Spot[], axis: 'x' | 'z'): Placed {
  if (spots.length < 3) return centres(spots)
  const at = (s: Spot) => s[axis]
  const sorted = [...spots].sort((a, b) => at(a) - at(b))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const start = at(first) - first.r
  const end = at(last) + last.r
  const taken = sorted.reduce((sum, s) => sum + 2 * s.r, 0)
  const gap = (end - start - taken) / (sorted.length - 1)
  const out = centres(spots)
  let cursor = start
  for (const s of sorted) {
    out[s.key][axis] = cursor + s.r
    cursor += 2 * s.r + gap
  }
  return out
}

/** Flips the pieces across the plate's centre line: left for right (`x`) or front for back (`z`). */
export function mirrorSpots(spots: Spot[], axis: 'x' | 'z'): Placed {
  const out = centres(spots)
  for (const s of spots) out[s.key][axis] = -s[axis]
  return out
}

export type ArrayPattern = 'line' | 'arc' | 'circle'

/**
 * Where `count` repeats of a piece stand, the first being where it already is.
 * `line` runs from the piece in a direction, `circle` goes round the plate's centre at the piece's own distance
 * from it, and `arc` is a fan of the same over part of a circle, centred on the piece.
 */
export function arrayPositions(
  pattern: ArrayPattern,
  count: number,
  from: { x: number; z: number },
  options: { spacing?: number; angleDeg?: number } = {},
): Array<{ x: number; z: number }> {
  const n = Math.max(1, Math.floor(count))
  if (n === 1) return [{ x: from.x, z: from.z }]
  const spacing = options.spacing ?? 0.34
  if (pattern === 'line') {
    const a = ((options.angleDeg ?? 0) * Math.PI) / 180
    return Array.from({ length: n }, (_, i) => ({ x: from.x + Math.cos(a) * spacing * i, z: from.z + Math.sin(a) * spacing * i }))
  }
  const radius = Math.max(0.12, Math.hypot(from.x, from.z))
  const base = Math.atan2(from.z, from.x)
  const span = pattern === 'circle' ? Math.PI * 2 : (Math.min(170, Math.max(20, options.angleDeg ?? 120)) * Math.PI) / 180
  return Array.from({ length: n }, (_, i) => {
    const t = pattern === 'circle' ? (i / n) * span : (i / (n - 1) - 0.5) * span
    const angle = pattern === 'circle' ? base + t : base + t
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
  })
}

// How wide each vessel is, in centimetres, so a distance on screen can be read as a distance on a real plate.
export const PLATE_CM: Record<PlateStyle, number> = {
  'round-white': 27,
  'coupe-grey': 25,
  'deep-bowl': 22,
  'shallow-bowl': 24,
  'black-slate': 30,
  'square-white': 26,
  'wooden-board': 36,
}

export const toCm = (units: number, plate: PlateStyle) => (units * PLATE_CM[plate]) / 2
export const fromCm = (cm: number, plate: PlateStyle) => (cm * 2) / PLATE_CM[plate]

/** Edge to edge, not centre to centre: the gap you would see between two pieces on the plate. */
export function gapCm(a: Spot, b: Spot, plate: PlateStyle): number {
  return toCm(Math.max(0, Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r), plate)
}
