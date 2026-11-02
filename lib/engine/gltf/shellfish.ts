import { fitY, phases, quadGrid, solid, sweepInto } from './helpers'
import type { Prim } from './types'

// Things from the sea that had no form of their own: a prawn was an asparagus spear, a crab a quenelle, a whole fish a
// roast. Each is a few swept tubes and one body, fitted to the unit box like every other shape, and laid on its side
// (flat to the plate) with its long axis along X and its head at +X.

type P3 = [number, number, number]

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Brings the whole thing into the unit box, each axis on its own, as the placement expects. */
function fitBox(pos: number[]) {
  for (const k of [0, 2]) {
    let lo = Infinity
    let hi = -Infinity
    for (let i = k; i < pos.length; i += 3) {
      lo = Math.min(lo, pos[i])
      hi = Math.max(hi, pos[i])
    }
    const half = Math.max(1e-6, (hi - lo) / 2)
    const mid = (hi + lo) / 2
    for (let i = k; i < pos.length; i += 3) pos[i] = (pos[i] - mid) / half
  }
  fitY(pos)
}

function path(n: number, at: (t: number) => P3): P3[] {
  return Array.from({ length: n }, (_, i) => at(i / (n - 1)))
}

// A prawn: a curved body of overlapping segments, a head with two long feelers, and a fan of tail plates.
export function prawn(seed: number): Prim {
  const ph = phases(seed, 2654435761)
  const pos: number[] = []
  const idx: number[] = []
  // The body curls: head at +X, tail tucked back round to the side.
  const curl = (t: number): P3 => [0.85 - 1.55 * t, 0, 0.42 * Math.sin(Math.PI * Math.pow(t, 0.9)) - 0.06]
  const radius = (t: number) => {
    const segments = 1 + 0.13 * Math.cos(2 * Math.PI * 7 * (t - 0.18)) * smooth(0.16, 0.3, t) * (1 - smooth(0.88, 1, t))
    const taper = 1 - 0.55 * smooth(0.12, 1, t)
    return 0.19 * taper * segments * (1 + 0.04 * Math.sin(5 * t + ph[0]))
  }
  sweepInto(pos, idx, path(34, curl), radius, { seg: 12, flatten: 0.8 })
  // Two feelers, longer than the body, trailing forward and out.
  for (const side of [1, -1]) {
    const feeler = path(10, (t): P3 => [0.8 + 0.9 * t, 0, side * (0.06 + 0.5 * t * t)])
    sweepInto(pos, idx, feeler, 0.012, { seg: 5 })
  }
  // The tail fan: three flat plates spread from the last segment.
  const tail = curl(1)
  for (const spread of [-0.5, 0, 0.5]) {
    const plate = path(7, (t): P3 => [tail[0] - 0.22 * t * Math.cos(spread), 0, tail[2] + 0.22 * t * Math.sin(spread) + 0.04])
    sweepInto(pos, idx, plate, (t) => 0.07 * (1 - 0.3 * t), { seg: 8, flatten: 0.3 })
  }
  fitBox(pos)
  return solid(pos, idx)
}

// A lobster: a heavy segmented tail ending in a fan, and (for the whole animal) two big claws off the head.
export function lobster(seed: number, claws = true): Prim {
  const ph = phases(seed, 3266489917)
  const pos: number[] = []
  const idx: number[] = []
  const body = (t: number): P3 => [0.7 - 1.5 * t, 0, 0.16 * Math.sin(Math.PI * t + ph[0] * 0.1) - 0.02]
  const radius = (t: number) => {
    const segments = 1 + 0.16 * Math.cos(2 * Math.PI * 6 * (t - 0.12)) * smooth(0.1, 0.25, t) * (1 - smooth(0.9, 1, t))
    return 0.3 * (1 - 0.35 * smooth(0.1, 1, t)) * segments
  }
  sweepInto(pos, idx, path(30, body), radius, { seg: 14, flatten: 0.7 })
  const tail = body(1)
  for (const spread of [-0.8, -0.4, 0, 0.4, 0.8]) {
    const plate = path(7, (t): P3 => [tail[0] - 0.3 * t * Math.cos(spread), 0, tail[2] + 0.3 * t * Math.sin(spread)])
    sweepInto(pos, idx, plate, (t) => 0.09 * (1 - 0.3 * t), { seg: 8, flatten: 0.3 })
  }
  if (claws) {
    for (const side of [1, -1]) {
      // Arm, then a heavy pincer: two long lobes with a gap between them.
      const arm = path(10, (t): P3 => [0.7 + 0.6 * t, 0, side * (0.2 + 0.45 * t)])
      sweepInto(pos, idx, arm, (t) => 0.1 * (1 - 0.1 * t), { seg: 10, taper: false })
      const tip = arm[arm.length - 1]
      for (const k of [-1, 1]) {
        const finger = path(8, (t): P3 => [tip[0] + 0.5 * t, 0, tip[2] + side * (0.08 * t + k * 0.1 * (0.4 + t))])
        sweepInto(pos, idx, finger, (t) => 0.13 * Math.sin(Math.PI * (0.15 + 0.7 * t)) + 0.02, { seg: 10, flatten: 0.7 })
      }
    }
  }
  fitBox(pos)
  return solid(pos, idx)
}

// A crab: a broad shell, a pair of claws and four legs a side.
export function crab(seed: number): Prim {
  const ph = phases(seed, 1103515245)
  const pos: number[] = []
  const idx: number[] = []
  // The carapace: a flattened dome, wider than it is long, scalloped at its rim.
  const rows = 14
  const seg = 40
  for (let r = 0; r <= rows; r++) {
    const v = (r / rows) * (Math.PI / 2)
    for (let s = 0; s <= seg; s++) {
      const u = (s / seg) * Math.PI * 2
      const scallop = 1 + 0.05 * Math.sin(9 * u + ph[0]) * Math.sin(v)
      pos.push(0.5 * Math.cos(u) * Math.sin(v) * scallop, 0.3 * Math.cos(v), 0.78 * Math.sin(u) * Math.sin(v) * scallop)
    }
  }
  quadGrid(idx, 0, rows + 1, seg + 1)
  // The flat underside, so the dome is closed.
  const base = pos.length / 3
  for (let s = 0; s <= seg; s++) {
    const u = (s / seg) * Math.PI * 2
    pos.push(0.5 * Math.cos(u), 0, 0.78 * Math.sin(u))
  }
  pos.push(0, 0, 0)
  const centre = pos.length / 3 - 1
  for (let s = 0; s < seg; s++) idx.push(centre, base + s + 1, base + s)

  for (const side of [1, -1]) {
    // Four legs, each bending out and down to a point.
    for (let k = 0; k < 4; k++) {
      const yaw = (-0.5 + k * 0.4) * 0.9 + 0.15
      const leg = path(8, (t): P3 => [0.38 * Math.cos(yaw) - 0.9 * t * Math.sin(yaw) * 0.6, -0.1 * t, side * (0.6 + 0.65 * t)])
      sweepInto(pos, idx, leg, (t) => 0.05 * (1 - 0.6 * t), { seg: 6 })
    }
    // A claw: arm and two fingers.
    const arm = path(8, (t): P3 => [0.35 + 0.65 * t, 0.02, side * (0.55 + 0.3 * t)])
    sweepInto(pos, idx, arm, (t) => 0.1 * (1 - 0.1 * t), { seg: 8, taper: false })
    const tip = arm[arm.length - 1]
    for (const k of [-1, 1]) {
      const finger = path(7, (t): P3 => [tip[0] + 0.4 * t, 0.02, tip[2] + side * 0.05 * t + k * 0.09 * (0.3 + t)])
      sweepInto(pos, idx, finger, (t) => 0.12 * Math.sin(Math.PI * (0.15 + 0.7 * t)) + 0.02, { seg: 8, flatten: 0.7 })
    }
  }
  fitBox(pos)
  return solid(pos, idx)
}

// A whole fish, lying on its side: a deep, laterally flat body that thins to the tail, a forked tail and two fins.
export function wholeFish(seed: number): Prim {
  const ph = phases(seed, 2891336453)
  const pos: number[] = []
  const idx: number[] = []
  const rings = 34
  const seg = 22
  // u runs from the tail (0) to the nose (1).
  const depth = (u: number) => 0.4 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.62) * (1 + 0.04 * Math.sin(7 * u + ph[0]))
  for (let r = 0; r <= rings; r++) {
    const u = r / rings
    const x = -1 + 2 * u
    const d = depth(u)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      // Lying on its side: thin in y, full across z. A touch deeper on the belly side.
      pos.push(x * 0.78, d * 0.6 * Math.sin(a), d * Math.cos(a) * (Math.cos(a) < 0 ? 1.08 : 1))
    }
  }
  quadGrid(idx, 0, rings + 1, seg + 1)
  // The tail: two lobes, forked.
  for (const side of [1, -1]) {
    const lobe = path(7, (t): P3 => [-0.78 - 0.4 * t, 0, side * (0.06 + 0.3 * t)])
    sweepInto(pos, idx, lobe, (t) => 0.1 * (1 - 0.25 * t), { seg: 8, flatten: 0.2 })
  }
  // The dorsal and the belly fins, standing out from the body as it lies.
  for (const side of [1, -1]) {
    const fin = path(8, (t): P3 => [0.3 - 0.7 * t, 0, side * (0.3 + 0.18 * Math.sin(Math.PI * t))])
    sweepInto(pos, idx, fin, (t) => 0.06 * Math.sin(Math.PI * (0.1 + 0.8 * t)), { seg: 7, flatten: 0.2 })
  }
  fitBox(pos)
  return solid(pos, idx)
}
