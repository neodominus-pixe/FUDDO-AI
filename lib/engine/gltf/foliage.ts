import { fitRadial, fitY, phases, quadGrid, rotator, seeded, solid, sweepInto } from './helpers'
import type { Prim } from './types'

// A herb leaf: a lens tapered to points at both ends with a slight lengthwise
// curl. Garnish rendered as a shrunken blob just reads as angular grit.
export function leaf(seed = 1, seg = 16, rings = 18): Prim {
  const ph = phases(seed, 2654435761, 2)
  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= rings; r++) {
    const u = r / rings
    // Widest just past the middle, tapering to a point at tip and stem.
    const halfWidth = Math.pow(Math.sin(Math.PI * u), 0.7) * (0.9 + 0.12 * Math.sin(4 * u + ph[0]))
    const thickness = halfWidth * 0.22
    // Herbs are not flat: a lengthwise arc plus a little twist across the blade.
    const curl = Math.sin(Math.PI * u) * 0.5 + Math.sin(2.6 * u + ph[1]) * 0.12
    for (let s = 0; s <= seg; s++) {
      const v = (s / seg) * Math.PI * 2
      pos.push(u * 2 - 1, curl + thickness * Math.sin(v), halfWidth * Math.cos(v))
    }
  }
  quadGrid(idx, 0, rings + 1, seg + 1)
  fitY(pos)
  return solid(pos, idx)
}

// A herb sprig: a stem with leaflets coming off it, rather than one lens lying
// on the plate. Chervil, dill and parsley are not single leaves, and at garnish
// size a single lens reads as a speck of green confetti -- which is what most of
// the fine-dining plates in this library were being finished with.
export function sprig(seed: number, leaflets = 5): Prim {
  const ph = phases(seed, 1274126177, 4)
  const rand = seeded(seed)
  const pos: number[] = []
  const idx: number[] = []

  // The stem runs corner to corner of its own box, rising as it goes. Built to
  // fill the box rather than normalised into it afterwards: a sprig modelled
  // flat and then stretched to full height turns every leaflet into a vertical
  // blade, and the whole thing reads as a tiny green comb.
  const along = (t: number): [number, number, number] => [
    -1 + 1.85 * t,
    -1 + 1.72 * Math.pow(t, 0.75),
    0.3 * Math.sin(2.4 * t + ph[0]),
  ]

  const stem: Array<[number, number, number]> = []
  for (let i = 0; i <= 14; i++) stem.push(along(i / 14))
  sweepInto(pos, idx, stem, 0.06, { seg: 6 })

  // Leaflets fan out to either side, mostly in the plane of the plate, because
  // height is the one axis that gets squashed when the sprig is placed.
  const rings = 9
  const seg = 8
  for (let k = 0; k < leaflets; k++) {
    const t = 0.32 + 0.68 * (k / Math.max(1, leaflets - 1))
    const at = along(t)
    const len = 0.6 + 0.28 * rand()
    const place = rotator((k % 2 ? 1 : -1) * (0.7 + 0.5 * rand()), 0.12 + 0.3 * rand(), rand() * 0.8)
    const base = pos.length / 3
    for (let r = 0; r <= rings; r++) {
      const u = r / rings
      const half = Math.pow(Math.sin(Math.PI * u), 0.65) * len * 0.4
      const thick = half * 0.2
      const curl = Math.sin(Math.PI * u) * len * 0.12
      for (let sI = 0; sI <= seg; sI++) {
        const v = (sI / seg) * Math.PI * 2
        const [lx, ly, lz] = place(u * len, curl + thick * Math.sin(v), half * Math.cos(v))
        pos.push(lx + at[0], ly + at[1], lz + at[2])
      }
    }
    quadGrid(idx, base, rings + 1, seg + 1)
  }

  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A ruffled sheet: the salad leaf inside a burger, which is not a herb sprig and
// not a disc. A wavy rim that lifts and dips is the whole read -- it is what
// tells you there is lettuce in there when all you can see is the edge.
export function ruffle(seed: number, seg = 64, rings = 9): Prim {
  const ph = phases(seed, 1597334677)
  const waves = 7
  const edge = (a: number) => 1 + 0.07 * Math.sin(3 * a + ph[0]) + 0.045 * Math.sin(5 * a + ph[1])
  const lift = (a: number, t: number) =>
    (0.55 * Math.sin(waves * a + ph[2]) + 0.18 * Math.sin(2 * waves * a + ph[3])) * t * t
  // Thick in the middle, thinning to nothing at the rim so the sheet closes.
  const half = (t: number) => 0.42 * Math.pow(Math.max(0, 1 - t * t), 0.4)

  const pos: number[] = []
  const idx: number[] = []
  for (const side of [1, -1]) {
    const base = pos.length / 3
    for (let r = 0; r <= rings; r++) {
      const t = r / rings
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2
        const rad = t * edge(a)
        pos.push(rad * Math.cos(a), lift(a, t) + side * half(t), rad * Math.sin(a))
      }
    }
    quadGrid(idx, base, rings + 1, seg + 1, side < 0)
  }
  fitY(pos)
  return solid(pos, idx)
}
