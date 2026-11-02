import type { Prim } from './types'

// Anything swept the whole way round has its first column of vertices repeated
// as its last, and each copy only ever sees the faces on its own side. Averaging
// the two normals is what stops a lit sphere showing a bright line down the
// seam; without it the join reads as a crease that nothing in the geometry has.
export function weldSeam(nrm: Float32Array, rings: number, seg: number) {
  for (let r = 0; r <= rings; r++) {
    const first = r * (seg + 1) * 3
    const last = (r * (seg + 1) + seg) * 3
    const mx = (nrm[first] + nrm[last]) / 2
    const my = (nrm[first + 1] + nrm[last + 1]) / 2
    const mz = (nrm[first + 2] + nrm[last + 2]) / 2
    // The mean of two unit vectors is not itself a unit vector.
    const len = Math.hypot(mx, my, mz) || 1
    for (const [k, v] of [[0, mx / len], [1, my / len], [2, mz / len]] as const) {
      nrm[first + k] = v
      nrm[last + k] = v
    }
  }
}

// Accumulates smooth vertex normals from the faces. Needed by any surface whose
// normals are not analytic -- a displaced blob, a tapered leaf, a domed pool.
export function smoothNormals(pos: number[], idx: number[]) {
  const nrm = new Float32Array(pos.length)
  for (let i = 0; i < idx.length; i += 3) {
    const [i0, i1, i2] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3]
    const ux = pos[i1] - pos[i0], uy = pos[i1 + 1] - pos[i0 + 1], uz = pos[i1 + 2] - pos[i0 + 2]
    const vx = pos[i2] - pos[i0], vy = pos[i2 + 1] - pos[i0 + 1], vz = pos[i2 + 2] - pos[i0 + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const o of [i0, i1, i2]) {
      nrm[o] += nx
      nrm[o + 1] += ny
      nrm[o + 2] += nz
    }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    let len = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2])
    if (len < 1e-9) {
      // A degenerate pole -- a leaf tip, the centre of a pool -- touches only
      // zero-area faces, so nothing accumulates. Point it outward from the
      // origin instead, or a zero normal renders as a black speck.
      const pl = Math.hypot(pos[i], pos[i + 1], pos[i + 2])
      if (pl < 1e-9) {
        nrm[i] = 0
        nrm[i + 1] = 1
        nrm[i + 2] = 0
        continue
      }
      nrm[i] = pos[i]
      nrm[i + 1] = pos[i + 1]
      nrm[i + 2] = pos[i + 2]
      len = pl
    }
    nrm[i] /= len
    nrm[i + 1] /= len
    nrm[i + 2] /= len
  }
  return nrm
}

// Every shape in the library wound the same way round: counter-clockwise seen
// from outside, which is what glTF calls a front face and what smoothNormals
// needs to point a normal out of a surface rather than into it. Get it wrong and
// the renderer culls the side facing the camera and lights the shape from the
// inside -- a leek turns into a dark trough, and `shade` browns the underside of
// a taco because that is the way its normals were pointing.
//
// Which way a builder comes out depends on which way its two parameters happen
// to run, and half of them were the wrong way round. So rather than get it right
// by hand in each one: measure it. A closed mesh wound outward encloses a
// positive volume, and the same mesh wound inward encloses a negative one.
export function solid(pos: number[], idx: number[]): Prim {
  let volume = 0
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3]
    volume +=
      pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
      pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
      pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])
  }
  if (volume < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  return { positions: new Float32Array(pos), normals: smoothNormals(pos, idx), indices: new Uint16Array(idx) }
}

// Scales a built vertex array so its Y extent is exactly -1..1. Placement scales
// every food shape by a half-height, so a mesh that only fills part of its own
// box -- a thin leaf floating inside a unit cube -- is charged for height it does
// not use, which is what left daylight between the layers of a burger.
export function fitY(pos: number[]) {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 1; i < pos.length; i += 3) {
    lo = Math.min(lo, pos[i])
    hi = Math.max(hi, pos[i])
  }
  const span = hi - lo
  if (span < 1e-9) return
  for (let i = 1; i < pos.length; i += 3) pos[i] = ((pos[i] - lo) / span) * 2 - 1
}

// Triangulates a (rows x cols) grid of vertices starting at `base`.
export function quadGrid(idx: number[], base: number, rows: number, cols: number, flip = false) {
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = base + r * cols + c
      const b = a + cols
      if (flip) idx.push(a, b, a + 1, b, b + 1, a + 1)
      else idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
}

// Four phase offsets from a seed, so each instance of a shape wobbles its own way.
export function phases(seed: number, mix: number, count = 4) {
  let h = (seed * mix) >>> 0
  const ph: number[] = []
  for (let i = 0; i < count; i++) {
    h = (h ^ (h << 13)) >>> 0
    h = (h ^ (h >>> 17)) >>> 0
    ph.push((h / 4294967296) * Math.PI * 2)
  }
  return ph
}

// --- Pasta ----------------------------------------------------------------

export function seeded(seed: number) {
  let a = (seed * 1831565813) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Scales X and Z together so the widest point sits exactly on the unit circle.
// Anything built by scattering pieces around has to be brought back inside its
// own footprint, or it covers more of the plate than the layout budgeted for it.
export function fitRadial(pos: number[]) {
  let max = 0
  for (let i = 0; i < pos.length; i += 3) max = Math.max(max, Math.hypot(pos[i], pos[i + 2]))
  if (max < 1e-9) return
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] /= max
    pos[i + 2] /= max
  }
}

// Rotation about Y then Z then X, as a function applied to a local point.
export function rotator(yaw: number, pitch: number, roll: number) {
  const [cy, sy] = [Math.cos(yaw), Math.sin(yaw)]
  const [cp, sp] = [Math.cos(pitch), Math.sin(pitch)]
  const [cr, sr] = [Math.cos(roll), Math.sin(roll)]
  return (x: number, y: number, z: number): [number, number, number] => {
    // roll about X
    let [a, b, c] = [x, y * cr - z * sr, y * sr + z * cr]
    // pitch about Z
    ;[a, b, c] = [a * cp - b * sp, a * sp + b * cp, c]
    // yaw about Y
    return [a * cy + c * sy, b, -a * sy + c * cy]
  }
}

export function sweepInto(
  pos: number[],
  idx: number[],
  path: Array<[number, number, number]>,
  radius: number | ((t: number) => number),
  { seg = 10, taper = true, flatten = 1 } = {},
) {
  const n = path.length
  if (n < 2) return
  const base = pos.length / 3
  for (let i = 0; i < n; i++) {
    const p = path[i]
    const prev = path[Math.max(0, i - 1)]
    const next = path[Math.min(n - 1, i + 1)]
    let tx = next[0] - prev[0]
    let ty = next[1] - prev[1]
    let tz = next[2] - prev[2]
    const tl = Math.hypot(tx, ty, tz) || 1
    tx /= tl
    ty /= tl
    tz /= tl
    // Any reference direction works as long as it is not parallel to the path.
    const steep = Math.abs(ty) > 0.9
    const ux = steep ? 1 : 0
    const uy = steep ? 0 : 1
    let nx = uy * tz - 0 * ty
    let ny = 0 * tx - ux * tz
    let nz = ux * ty - uy * tx
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl
    ny /= nl
    nz /= nl
    const bx = ty * nz - tz * ny
    const by = tz * nx - tx * nz
    const bz = tx * ny - ty * nx
    const t = i / (n - 1)
    // Tapered rather than capped: a strand of pasta and a run of sauce both
    // thin out at the ends, and a flat cap on either would read as cut pipe.
    const r =
      (typeof radius === 'number' ? radius : radius(t)) *
      (taper ? Math.pow(Math.max(0, 1 - Math.pow(2 * t - 1, 8)), 0.35) : 1)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const c = Math.cos(a)
      const si = Math.sin(a)
      // `flatten` squashes the section against the surface it is lying on: a run
      // of sauce spreads, it does not sit up like a piped rope.
      pos.push(
        p[0] + r * (nx * c + bx * si),
        p[1] + r * (ny * c + by * si) * flatten,
        p[2] + r * (nz * c + bz * si),
      )
    }
  }
  quadGrid(idx, base, n, seg + 1)
}

// --- Broken things --------------------------------------------------------

// One hard broken piece: a crumb, a chopped nut, a shard of praline. An
// octahedron with every corner pulled a different distance out, emitted as
// eight separate triangles so the faces stay flat -- smooth normals over six
// shared corners give a rounded pebble, and the whole point of a crumb is that
// it was broken rather than rolled.
export function chipInto(
  pos: number[],
  idx: number[],
  rand: () => number,
  at: (x: number, y: number, z: number) => [number, number, number],
) {
  const corner: Array<[number, number, number]> = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ].map(([x, y, z]) => {
    const k = 0.5 + rand() * 0.85
    return at(x * k, y * k, z * k)
  })
  const faces = [
    [0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0],
    [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3],
  ]
  for (const f of faces) {
    const base = pos.length / 3
    for (const c of f) pos.push(...corner[c])
    idx.push(base, base + 1, base + 2)
  }
}
