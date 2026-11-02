import { fitY, phases, quadGrid, smoothNormals, solid, sweepInto, weldSeam } from './helpers'
import type { Prim } from './types'

export function unitSphere(seg = 20, rings = 14): Prim {
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI
    for (let s = 0; s <= seg; s++) {
      const theta = (s / seg) * Math.PI * 2
      const x = Math.sin(phi) * Math.cos(theta)
      const y = Math.cos(phi)
      const z = Math.sin(phi) * Math.sin(theta)
      pos.push(x, y, z)
      nrm.push(x, y, z)
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s
      const b = a + seg + 1
      // Wound counter-clockwise seen from outside, so the front face is the one
      // a viewer actually looks at.
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) }
}

export function unitCylinder(seg = 48): Prim {
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  const h = 0.5

  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2
    const x = Math.cos(a)
    const z = Math.sin(a)
    pos.push(x, h, z, x, -h, z)
    nrm.push(x, 0, z, x, 0, z)
  }
  for (let s = 0; s < seg; s++) {
    const a = s * 2
    idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1)
  }

  for (const sign of [1, -1]) {
    const start = pos.length / 3
    pos.push(0, h * sign, 0)
    nrm.push(0, sign, 0)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      pos.push(Math.cos(a), h * sign, Math.sin(a))
      nrm.push(0, sign, 0)
    }
    for (let s = 0; s < seg; s++) {
      // (centre, ring[s], ring[s+1]) yields a downward face normal, so the top cap
      // needs the reversed order and the bottom cap the forward one.
      if (sign > 0) idx.push(start, start + 2 + s, start + 1 + s)
      else idx.push(start, start + 1 + s, start + 2 + s)
    }
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) }
}

export function unitBox(): Prim {
  const faces: Array<[number[], number[]]> = [
    [[1, 0, 0], [0.5, 0, 0]],
    [[-1, 0, 0], [-0.5, 0, 0]],
    [[0, 1, 0], [0, 0.5, 0]],
    [[0, -1, 0], [0, -0.5, 0]],
    [[0, 0, 1], [0, 0, 0.5]],
    [[0, 0, -1], [0, 0, -0.5]],
  ]
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  for (const [n, c] of faces) {
    const u = Math.abs(n[1]) === 1 ? [1, 0, 0] : [0, 1, 0]
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]
    const base = pos.length / 3
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      pos.push(c[0] + (u[0] * su + v[0] * sv) * 0.5, c[1] + (u[1] * su + v[1] * sv) * 0.5, c[2] + (u[2] * su + v[2] * sv) * 0.5)
      nrm.push(n[0], n[1], n[2])
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) }
}

// Revolves a 2D outline around the Y axis. A plate is a profile -- a well, a
// rim, a foot -- and a flat cylinder cannot express any of that.
//
// The outline runs centre-top -> out across the face -> over the rim -> back
// along the underside -> centre-bottom, given as [radius, height] pairs.
export function lathe(profile: Array<[number, number]>, seg = 72): Prim {
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  const rings = profile.length

  for (let i = 0; i < rings; i++) {
    // Normal from the profile tangent: perpendicular in the (r, y) plane, then
    // swept around. (-dy, dr) faces up on the plate face and out at the rim.
    const prev = profile[Math.max(0, i - 1)]
    const next = profile[Math.min(rings - 1, i + 1)]
    const dr = next[0] - prev[0]
    const dy = next[1] - prev[1]
    const len = Math.hypot(dr, dy) || 1
    const nr = -dy / len
    const ny = dr / len

    const [r, y] = profile[i]
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const c = Math.cos(a)
      const sn = Math.sin(a)
      pos.push(r * c, y, r * sn)
      // A point exactly on the axis has no radial direction; use the axial part.
      if (r < 1e-6) nrm.push(0, ny >= 0 ? 1 : -1, 0)
      else nrm.push(nr * c, ny, nr * sn)
    }
  }

  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * (seg + 1) + s
      const b = a + seg + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) }
}

export function sweep(
  path: Array<[number, number, number]>,
  radius: number | ((t: number) => number),
  opts: { seg?: number; taper?: boolean; flatten?: number } = {},
): Prim {
  const pos: number[] = []
  const idx: number[] = []
  sweepInto(pos, idx, path, radius, opts)
  return solid(pos, idx)
}

// A seeded, lumpy sphere. Food is not an ellipsoid, and a plate of perfect
// ellipsoids is the single thing that most makes a render look computer-made.
// Deterministic in `seed`, so a spec still renders identically every time.
export function blobSphere(seed: number, seg = 28, rings = 20): Prim {
  // Six phase offsets from the seed, giving each variant its own lumps.
  const ph: number[] = []
  let h = (seed * 2654435761) >>> 0
  for (let i = 0; i < 6; i++) {
    h = (h ^ (h << 13)) >>> 0
    h = (h ^ (h >>> 17)) >>> 0
    h = (h ^ (h << 5)) >>> 0
    ph.push((h / 4294967296) * Math.PI * 2)
  }

  // Every term is scaled by sin(phi) so displacement vanishes at both poles --
  // otherwise the caps pinch into a cone.
  const radiusAt = (theta: number, phi: number) =>
    1 +
    Math.sin(phi) *
      (0.11 * Math.sin(3 * theta + ph[0]) * Math.sin(2 * phi + ph[1]) +
        0.07 * Math.sin(5 * theta + ph[2]) * Math.sin(3 * phi + ph[3]) +
        0.05 * Math.sin(2 * theta + ph[4]) * Math.sin(4 * phi + ph[5]))

  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI
    for (let s = 0; s <= seg; s++) {
      const theta = (s / seg) * Math.PI * 2
      const rad = radiusAt(theta, phi)
      pos.push(
        rad * Math.sin(phi) * Math.cos(theta),
        rad * Math.cos(phi),
        rad * Math.sin(phi) * Math.sin(theta),
      )
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s
      const b = a + seg + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }

  // A displaced surface no longer has the sphere's normals.
  const nrm = smoothNormals(pos, idx)
  weldSeam(nrm, rings, seg)

  return { positions: new Float32Array(pos), normals: nrm, indices: new Uint16Array(idx) }
}

// One round thing: a meatball, a new potato, a boiled egg, a pearl of
// mozzarella, a falafel, a plum.
//
// Deliberately not the lumpy sphere. `blobSphere` moves its surface by up to a
// fifth of its own radius, which is right for something the table did not
// recognise -- a soft mound that commits to nothing -- and wrong for something
// it did: at a meatball's size those lumps read as a walnut, and on an egg they
// read as damage. What keeps a ball from looking machined is a gentle, long
// wavelength deviation, and the flat it settles onto where it rests.
export function ball(seed: number, seg = 32, rings = 24): Prim {
  const ph = phases(seed, 2654435761, 6)
  const radiusAt = (theta: number, phi: number) =>
    1 +
    Math.sin(phi) *
      (0.038 * Math.sin(2 * theta + ph[0]) * Math.sin(2 * phi + ph[1]) +
        0.022 * Math.sin(3 * theta + ph[2]) * Math.sin(3 * phi + ph[3])) +
    0.02 * Math.sin(3 * phi + ph[4])

  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI
    for (let s = 0; s <= seg; s++) {
      const theta = (s / seg) * Math.PI * 2
      const rad = radiusAt(theta, phi)
      const y = rad * Math.cos(phi)
      // Settled, not balanced: anything soft enough to eat gives a little where
      // it meets the plate, and that flat is the difference between a ball
      // resting on a surface and a ball hanging in the air above one.
      const sit = y < -0.66 ? 1 - 0.3 * Math.pow((-y - 0.66) / 0.34, 1.5) : 1
      pos.push(rad * Math.sin(phi) * Math.cos(theta), y * sit, rad * Math.sin(phi) * Math.sin(theta))
    }
  }
  quadGrid(idx, 0, rings + 1, seg + 1)
  fitY(pos)
  const prim = solid(pos, idx)
  weldSeam(prim.normals, rings, seg)
  return prim
}

// A solid of revolution with three extras a plain lathe cannot express: a
// per-angle radius wobble so nothing looks machined, a superellipse cross-section
// so a slice of cheese can be a rounded square while a bun stays round, and a
// droop that hangs the corners of that slice over what it is lying on.
//
// The outline spans y from -1 (base) to +1 (crown), matching the unit sphere the
// rest of the pipeline scales, so shapes are interchangeable.
//
// `fromY` and `grow` together take a copy of just the upper shell of the same
// shape, a hair larger: that is how a seared crust or a baked crown is laid over
// the top of the piece it belongs to without z-fighting the surface underneath.
export function shapedSolid(
  seed: number,
  profile: Array<[number, number]>,
  { noise = 0.06, squareness = 0, seg = 44, droop = 0, crimp = 0, fromY = -Infinity, grow = 1, lift = 0 } = {},
): Prim {
  const ph = phases(seed, 2246822519)
  const wobble = (a: number) =>
    1 + noise * (Math.sin(3 * a + ph[0]) * 0.6 + Math.sin(5 * a + ph[1]) * 0.3 + Math.sin(7 * a + ph[2]) * 0.1)

  // Superellipse: n = 2 is a circle, higher n squares the corners off.
  const n = 2 + squareness * 6
  const corner = (a: number) => {
    const c = Math.abs(Math.cos(a))
    const s = Math.abs(Math.sin(a))
    return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n)
  }
  // Normalised to unit mean radius. A raw superellipse reaches 1.41x further at
  // its corners than at its edges, so a "same size" square slice used to hang a
  // long way past the round patty it was sitting on.
  const samples = 180
  let mean = 0
  for (let i = 0; i < samples; i++) mean += corner((i / samples) * Math.PI * 2)
  mean /= samples
  const shapeAt = (a: number) => corner(a) / mean

  const rows = profile.filter(([, y]) => y >= fromY)
  const pos: number[] = []
  const idx: number[] = []
  for (const [r, y] of rows) {
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const sh = shapeAt(a)
      // A crimp is a fine flute that only bites where the shape is widest, so a
      // ravioli gets its pressed edge and its puffed middle stays smooth.
      const flute = crimp ? 1 + crimp * Math.sin(16 * a + ph[3]) * r : 1
      const rad = r * wobble(a) * sh * grow * flute
      // Droop is proportional to how far the corner reaches and to how far out
      // the row is, so the centre of the slice stays put and the corners sag.
      pos.push(rad * Math.cos(a), y + lift - droop * (sh - 1) * r, rad * Math.sin(a))
    }
  }
  quadGrid(idx, 0, rows.length, seg + 1)
  return solid(pos, idx)
}
