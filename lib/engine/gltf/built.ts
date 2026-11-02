import { fitRadial, fitY, phases, quadGrid, rotator, seeded, solid, sweepInto } from './helpers'
import { STACK_FILLING, STACK_THICK } from './profiles'
import type { Prim } from './types'

// A ring: an onion ring, a round of calamari, a bagel. The hole is the whole
// read, and it is the one thing in the library you can see the plate through.
export function ring(seed: number, seg = 44, side = 14): Prim {
  const ph = phases(seed, 2654435763)
  const pos: number[] = []
  const idx: number[] = []
  const R = 0.72
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2
    // Never a machined circle: a ring of batter goes into the fryer round and
    // comes out oval.
    const wob = 1 + 0.05 * Math.sin(3 * u + ph[0]) + 0.03 * Math.sin(5 * u + ph[1])
    const thick = 0.28 * (1 + 0.14 * Math.sin(2 * u + ph[2]))
    for (let j = 0; j <= side; j++) {
      const v = (j / side) * Math.PI * 2
      const rad = (R + thick * Math.cos(v)) * wob
      pos.push(rad * Math.cos(u), thick * Math.sin(v), rad * Math.sin(u))
    }
  }
  quadGrid(idx, 0, seg + 1, side + 1, true)
  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// One piece of short pasta lying along its own X axis: a tube cut on the slant
// for penne, or a rounded barrel for gnocchi.
export function pieceInto(
  pos: number[],
  idx: number[],
  at: (x: number, y: number, z: number) => [number, number, number],
  {
    hollow,
    length,
    radius,
    seg = 12,
    rows = 7,
    ridged = false,
    blunt = false,
    square = false,
  }: { hollow: boolean; length: number; radius: number; seg?: number; rows?: number; ridged?: boolean; blunt?: boolean; square?: boolean },
) {
  const half = length / 2
  if (!hollow) {
    const base = pos.length / 3
    for (let i = 0; i < rows; i++) {
      const u = i / (rows - 1)
      const x = (u * 2 - 1) * half
      // Pressed against the tines of a fork, which is how gnocchi is shaped and
      // the only thing that tells it apart from a small dumpling.
      const ridge = ridged ? 1 + 0.085 * Math.cos(i * Math.PI) : 1
      // A chip is cut, so it keeps its thickness until it stops. A gnocchi is
      // rolled, so it tapers the whole way. The same barrel does both.
      const [fall, round] = blunt ? [9, 0.26] : [3.2, 0.42]
      const rr = radius * ridge * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u * 2 - 1), fall)), round)
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2
        // A chip is cut square: a rounded square section, not a round one.
        const q = square ? 1 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 5) + Math.pow(Math.abs(Math.sin(a)), 5), 1 / 5) / 1.07 : 1
        pos.push(...at(x, rr * q * Math.sin(a), rr * q * Math.cos(a)))
      }
    }
    quadGrid(idx, base, rows, seg + 1)
    return
  }

  const inner = radius * 0.62
  // Cut on the diagonal at both ends, the way penne is.
  const endX = (sign: number, a: number) => sign * half + 0.42 * radius * Math.cos(a)
  const ring = (r: number, sign: number) => {
    const base = pos.length / 3
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      pos.push(...at(endX(sign, a), r * Math.sin(a), r * Math.cos(a)))
    }
    return base
  }
  const outerA = ring(radius, -1)
  const outerB = ring(radius, 1)
  const innerA = ring(inner, -1)
  const innerB = ring(inner, 1)
  for (let s = 0; s < seg; s++) {
    // Outer wall, inner wall reversed so it faces into the hole, and an annulus
    // closing each end.
    idx.push(outerA + s, outerA + s + 1, outerB + s, outerB + s, outerA + s + 1, outerB + s + 1)
    idx.push(innerA + s, innerB + s, innerA + s + 1, innerA + s + 1, innerB + s, innerB + s + 1)
    idx.push(outerA + s, innerA + s, outerA + s + 1, outerA + s + 1, innerA + s, innerA + s + 1)
    idx.push(outerB + s, outerB + s + 1, innerB + s, innerB + s, outerB + s + 1, innerB + s + 1)
  }
}

// Darken a band of a shape after it has been shaded. Only the stack needs this
// so far, and only because its layers are the point of it.
export function stripe(prim: Prim, bands: Array<[number, number]>, mul: number): Prim {
  const { positions: pos } = prim
  const colors = prim.colors ? new Uint8Array(prim.colors) : undefined
  if (!colors) return prim
  for (let i = 0, v = 0; i < pos.length; i += 3, v += 4) {
    const y = pos[i + 1]
    if (!bands.some(([a, b]) => y >= a - 1e-6 && y <= b + 1e-6)) continue
    for (let c = 0; c < 3; c++) colors[v + c] = Math.round(colors[v + c] * mul)
  }
  return { ...prim, colors }
}

export function stack(seed: number, seg = 54): Prim {
  const ph = phases(seed, 1013904223, 8)
  const pos: number[] = []
  const idx: number[] = []
  // The outline: a right triangle walked as a closed loop, then smoothed a few
  // times to round its corners off. A sandwich is cut on the diagonal, and
  // nothing else in the library has that silhouette.
  const corners: Array<[number, number]> = [[-1, -0.82], [1, -0.82], [-0.3, 0.96]]
  let loop: Array<[number, number]> = []
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * 3
    const k = Math.floor(t)
    const f = t - k
    const [ax, az] = corners[k]
    const [bx, bz] = corners[(k + 1) % 3]
    loop.push([ax + (bx - ax) * f, az + (bz - az) * f])
  }
  for (let pass = 0; pass < 7; pass++)
    loop = loop.map(([x, z], i) => {
      const [px, pz] = loop[(i + seg - 1) % seg]
      const [nx, nz] = loop[(i + 1) % seg]
      return [(px + 2 * x + nx) / 4, (pz + 2 * z + nz) / 4]
    })

  const total = STACK_THICK.reduce((a, b) => a + b, 0)
  let y = 0
  for (let L = 0; L < STACK_THICK.length; L++) {
    const filling = STACK_FILLING[L]
    const y0 = y
    const y1 = y + STACK_THICK[L]
    y = y1
    // No sandwich is built true. Each layer sits a little out of line with the
    // one under it, which is most of what stops this reading as a machined box.
    const dx = 0.05 * Math.sin(ph[L % 6] + L)
    const dz = 0.05 * Math.cos(ph[(L + 2) % 6] + L * 1.7)
    const at = (i: number, level: number) => {
      const [lx, lz] = loop[i % seg]
      // Bread bulges at its middle where it was pressed; a filling is ragged all
      // the way round, because a leaf of lettuce does not follow the crust.
      const a = (i / seg) * Math.PI * 2
      const ragged = filling ? 1 + 0.055 * Math.sin(5 * a + ph[0]) + 0.03 * Math.sin(9 * a + ph[1]) : 1
      const bulge = 1 + (filling ? 0 : 0.035) * Math.sin(Math.PI * level)
      const r = (filling ? 1.045 : 1) * ragged * bulge
      return [lx * r + dx, ((y0 + (y1 - y0) * level) / total) * 2 - 1, lz * r + dz] as [number, number, number]
    }
    // The wall, in three rows so the bulge has a middle to happen at.
    const wall = pos.length / 3
    for (const level of [0, 0.5, 1]) for (let i = 0; i <= seg; i++) pos.push(...at(i, level))
    quadGrid(idx, wall, 3, seg + 1)
    // A cap at each end, fanned from the middle. Kept as its own vertices so the
    // edge between a crust and its cut face stays sharp.
    for (const level of [0, 1]) {
      const base = pos.length / 3
      const [mx, , mz] = at(0, level)
      pos.push(mx * 0 + dx, ((y0 + (y1 - y0) * level) / total) * 2 - 1, mz * 0 + dz)
      for (let i = 0; i <= seg; i++) pos.push(...at(i, level))
      for (let i = 0; i < seg; i++)
        if (level === 1) idx.push(base, base + 1 + i, base + 2 + i)
        else idx.push(base, base + 2 + i, base + 1 + i)
    }
  }
  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A skewer: chunks threaded onto a stick that pokes out at both ends. The stick
// is the point -- it is what tells a consultant this is a kebab and not four
// pieces of chicken that happen to be in a row.
export function skewer(seed: number, count = 4): Prim {
  const rand = seeded(seed)
  const pos: number[] = []
  const idx: number[] = []
  const radius = 0.3
  // Tapered at both ends by the sweep, which is what a skewer is.
  sweepInto(pos, idx, [[-1, 0, 0], [0, 0, 0], [1, 0, 0]], radius * 0.2, { seg: 8 })
  for (let i = 0; i < count; i++) {
    const cx = -0.66 + (i / (count - 1)) * 1.32
    // Turned and tipped a little each, the way nobody threads them straight.
    const place = rotator((rand() - 0.5) * 1.0, (rand() - 0.5) * 0.45, rand() * Math.PI * 2)
    pieceInto(
      pos,
      idx,
      (x, y, z) => {
        const [px, py, pz] = place(x, y, z)
        return [px + cx, py, pz]
      },
      { hollow: false, length: radius * 1.5, radius, seg: 14, rows: 9 },
    )
  }
  // Y and Z brought up together rather than each to its own box: fitY alone
  // would leave the pieces full height and a third as deep, which is a row of
  // wafers on a stick.
  let hi = 1e-9
  for (let i = 1; i < pos.length; i += 3) hi = Math.max(hi, Math.abs(pos[i]))
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 1] /= hi
    pos[i + 2] /= hi
  }
  return solid(pos, idx)
}

// A pool of sauce: an irregular outline with a domed meniscus, closed by a flat
// underside. A cylinder gives sauce a machined edge and a visible vertical wall.
// Linear bytes from colours chosen as they should look, the same conversion `shade` makes.
const enc = (v: number) => Math.round(Math.pow(Math.min(1, Math.max(0, v)), 2.2) * 255)

// Sauce spread on a pizza: one thin film, spooned out in circles to just short of the crust. Fine enough that the
// edge is a curve at the size a pizza fills the screen -- a pool's few dozen segments read as a cut-out polygon there.
// The edge is scalloped where the back of the spoon stopped, not lobed like a pool that ran, and it is darker,
// where the film is thinnest and cooked down in the oven.
export function pizzaSauce(seed: number, seg = 128, rings = 20): Prim {
  const ph = phases(seed, 2246822519, 6)
  const edgeAt = (t: number) =>
    1 + 0.03 * Math.sin(3 * t + ph[0]) + 0.022 * Math.sin(7 * t + ph[1]) + 0.014 * Math.sin(13 * t + ph[2]) + 0.008 * Math.sin(29 * t + ph[3])
  const pos: number[] = []
  const idx: number[] = []
  const tone: number[] = []
  for (const top of [true, false]) {
    for (let r = 0; r <= rings; r++) {
      const t = r / rings
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2
        const rad = edgeAt(a) * t
        // Level across the deck, with the meniscus only in the last tenth.
        pos.push(rad * Math.cos(a), top ? -0.5 + (1 - Math.pow(t, 8)) : -0.5, rad * Math.sin(a))
        const swirl = Math.sin(rad * 15 + a * 2 + ph[4]) * Math.sin(a * 3 + ph[5])
        tone.push(1 - 0.2 * Math.pow(t, 6) + 0.05 * swirl)
      }
    }
  }
  const half = (rings + 1) * (seg + 1)
  quadGrid(idx, 0, rings + 1, seg + 1)
  quadGrid(idx, half, rings + 1, seg + 1, true)
  const prim = solid(pos, idx)
  const colors = new Uint8Array(tone.length * 4)
  // Cooked down: browner as well as darker, so the edge reads as concentrated tomato and not as shadow.
  tone.forEach((f, i) => colors.set([enc(f), enc(f * (0.9 + 0.1 * f)), enc(f * (0.86 + 0.14 * f)), 255], i * 4))
  return { ...prim, colors }
}

// Mozzarella after the oven: no longer a round slice but a pool, run out in lobes over the sauce, thin at the edge
// where it ran and still thick where the slice was. The top is bubbled, and the tops of the bubbles have browned.
export function melt(seed: number, seg = 96, rings = 14): Prim {
  const ph = phases(seed, 3266489917, 8)
  const rand = seeded(seed)
  const raw = (t: number) =>
    1 + 0.16 * Math.sin(2 * t + ph[0]) + 0.1 * Math.sin(3 * t + ph[1]) + 0.07 * Math.sin(5 * t + ph[2]) + 0.035 * Math.sin(9 * t + ph[3])
  // Normalised to a mean radius of 1, so the pool covers what the layout gave it rather than whatever its lobes add.
  let mean = 0
  for (let s = 0; s < 180; s++) mean += raw((s / 180) * Math.PI * 2)
  mean /= 180
  const edgeAt = (t: number) => raw(t) / mean
  // A few bubbles of different sizes, and only the biggest brown properly: an even scatter reads as polka dots.
  const bubbles = Array.from({ length: 4 }, () => {
    const a = rand() * Math.PI * 2
    const d = rand() * 0.6
    const size = rand()
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, r: 0.14 + size * 0.22, h: 0.2 + size * 0.4, tan: 0.6 + 0.4 * size }
  })
  const pos: number[] = []
  const idx: number[] = []
  const brown: number[] = []
  for (const top of [true, false]) {
    for (let r = 0; r <= rings; r++) {
      const t = r / rings
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2
        const rad = edgeAt(a) * t
        const x = rad * Math.cos(a)
        const z = rad * Math.sin(a)
        let y = -1
        let b = 0
        if (top) {
          // Thick in the middle, running out to a thin lip.
          y = -1 + 0.25 + 1.2 * Math.pow(1 - Math.pow(t, 2.4), 0.8)
          for (const p of bubbles) {
            const g = Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r))
            y += p.h * g * (1 - t)
            b = Math.max(b, g * p.tan)
          }
          // The browning is patchy across a bubble, not a neat disc.
          b *= 0.75 + 0.25 * Math.sin(11 * x + ph[6]) * Math.sin(9 * z + ph[7])
          y += 0.06 * Math.sin(7 * x + ph[4]) * Math.sin(6 * z + ph[5])
        }
        pos.push(x, y, z)
        brown.push(top ? Math.pow(b, 1.6) : 0)
      }
    }
  }
  const half = (rings + 1) * (seg + 1)
  quadGrid(idx, 0, rings + 1, seg + 1)
  quadGrid(idx, half, rings + 1, seg + 1, true)
  // The lip: the outer ring of the top down to the outer ring of the bottom.
  for (let s = 0; s < seg; s++) {
    const a = rings * (seg + 1) + s
    const b = half + rings * (seg + 1) + s
    // Wound as the top is: the lip carries on from the top's outer ring the way the top runs out from the centre.
    idx.push(a, a + 1, b, b, a + 1, b + 1)
  }
  fitY(pos)
  const prim = solid(pos, idx)
  const colors = new Uint8Array(brown.length * 4)
  brown.forEach((k, i) => {
    // Cream, browning to gold on the bubbles; never past gold, since a margherita's cheese is not burnt.
    const c = [1 - 0.18 * k, 0.98 - 0.36 * k, 0.94 - 0.56 * k]
    colors.set([enc(c[0]), enc(c[1]), enc(c[2]), 255], i * 4)
  })
  return { ...prim, colors }
}

export function saucePool(seed: number, seg = 40, rings = 5): Prim {
  let h = (seed * 374761393) >>> 0
  const ph: number[] = []
  for (let i = 0; i < 4; i++) {
    h = (h ^ (h << 13)) >>> 0
    h = (h ^ (h >>> 17)) >>> 0
    ph.push((h / 4294967296) * Math.PI * 2)
  }
  // A liquid edge: lobed where it ran into the grain of the plate, not round. Soft, since a sauce mark is only a few
  // millimetres across on screen and a hard wobble at that size reads as crumpled foil. Two of the three variants also
  // have a run: a tongue where the sauce found a way to creep out and a shallow slope in the plate.
  const tongue = [0.3, 0, 0.18][(Math.abs(seed) + 2) % 3]
  const edgeAt = (t: number) => {
    const off = Math.atan2(Math.sin(t - ph[2]), Math.cos(t - ph[2]))
    return 1 + 0.07 * Math.sin(3 * t + ph[0]) + 0.05 * Math.sin(5 * t + ph[1]) + 0.03 * Math.sin(8 * t + ph[3]) + tongue * Math.exp(-Math.pow(off / 0.34, 2))
  }

  const pos: number[] = []
  const idx: number[] = []
  // Top: domed from centre (+0.5) down to the rim (-0.5).
  for (let r = 0; r <= rings; r++) {
    const t = r / rings
    // Flatter across the middle than a dome, falling away at the edge: a liquid pooling, with a thin meniscus.
    const y = -0.5 + (1 - t * t * t)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const rad = edgeAt(a) * t
      pos.push(rad * Math.cos(a), y, rad * Math.sin(a))
    }
  }
  const bottomStart = pos.length / 3
  // Bottom: flat, lying on the plate.
  for (let r = 0; r <= rings; r++) {
    const t = r / rings
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const rad = edgeAt(a) * t
      pos.push(rad * Math.cos(a), -0.5, rad * Math.sin(a))
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s
      const b = a + seg + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
      const c = bottomStart + a
      const d = bottomStart + b
      idx.push(c, d, c + 1, d, d + 1, c + 1)
    }
  }
  return solid(pos, idx)
}
