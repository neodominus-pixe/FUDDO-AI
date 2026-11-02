import { fitY, phases, quadGrid, solid, sweepInto, weldSeam } from './helpers'
import type { Prim } from './types'

// A quenelle: the three-sided oval a puree is shaped into between two spoons,
// pointed at both ends with a ridge along the crest and flat underneath. It is
// the single most recognisable thing on a fine-dining plate, and a lumpy sphere
// says "mashed potato" instead.
export function quenelle(seed: number, along = 26, across = 24): Prim {
  const ph = phases(seed, 2891336453, 2)
  const pos: number[] = []
  const idx: number[] = []

  const halfWidth = (u: number) => Math.pow(Math.sin(Math.PI * u), 0.55) * (1 + 0.05 * Math.sin(5 * u + ph[0]))
  const crest = (u: number) => Math.pow(Math.sin(Math.PI * u), 0.7)

  for (const top of [true, false]) {
    const base = pos.length / 3
    for (let r = 0; r <= along; r++) {
      const u = r / along
      const w = halfWidth(u)
      for (let s = 0; s <= across; s++) {
        const v = (s / across) * 2 - 1
        // The ridge sits slightly off centre, the way a spoon leaves it.
        const arc = Math.pow(Math.max(0, 1 - v * v), 0.6) * (1 + 0.14 * v)
        const y = top ? -1 + 2 * crest(u) * arc : -1
        pos.push(u * 2 - 1, y, v * w)
      }
    }
    quadGrid(idx, base, along + 1, across + 1, !top)
  }
  fitY(pos)
  return solid(pos, idx)
}

// A baton: a leek, an asparagus spear, a baby carrot. Lies along its length with
// rounded ends and a slight natural bend, none of which a sphere can do.
export function baton(seed: number, along = 30, seg = 20): Prim {
  const ph = phases(seed, 3266489917)
  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= along; r++) {
    const u = r / along
    const x = u * 2 - 1
    // Full thickness along most of the length, closing to a point at each end.
    const rad = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x), 6)), 0.3) * (1 + 0.05 * Math.sin(7 * u + ph[0]))
    const bend = 0.16 * Math.sin(Math.PI * u + ph[1] * 0.1)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const r2 = rad * (1 + 0.05 * Math.sin(3 * a + ph[2] + u * 4))
      pos.push(x, r2 * Math.sin(a), bend + r2 * Math.cos(a))
    }
  }
  quadGrid(idx, 0, along + 1, seg + 1)
  fitY(pos)
  return solid(pos, idx)
}

// --- Swept tubes ----------------------------------------------------------
// A strand of pasta and a line of drizzled sauce are the same thing: a circular
// section carried along a path. Both used to be approximated by a row of
// separate blobs, which reads as a string of beads rather than as one stroke.

// A pod: long, flat, curved, with the peas showing as bumps down the length of
// it. A baton is round through, which is why every pod on the plate -- edamame,
// mange tout, broad beans -- was coming out as either a bean-coloured sausage
// or a heap of loose spheres. What says "pod" is that it is wide and thin at the
// same time, and lumpy in one direction only.
export function pod(seed: number, along = 36, seg = 22): Prim {
  const ph = phases(seed, 40503)
  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= along; r++) {
    const u = r / along
    const x = u * 2 - 1
    // Drawn out to a point at both ends -- a pod has a stalk and a tip, and
    // neither is blunt the way a cut baton is.
    const taper = Math.pow(Math.max(0, 1 - x * x), 0.4)
    // Four peas along the inside, the swelling of each one carried by the whole
    // wall of the pod.
    const peas = 1 + 0.26 * Math.pow(Math.max(0, Math.sin((u * 4 + 0.3) * Math.PI)), 2.6)
    const wide = 0.62 * taper * peas
    const thin = 0.3 * taper * peas
    const bend = 0.2 * Math.sin(Math.PI * u + ph[0] * 0.2)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      pos.push(x, thin * Math.sin(a), bend + wide * Math.cos(a))
    }
  }
  quadGrid(idx, 0, along + 1, seg + 1)
  fitY(pos)
  return solid(pos, idx)
}

// A whole thing, served whole: a roast bird, a joint of pork, a sea bream on the
// bone, a suckling pig on a board.
//
// The one form here that is not a portion of anything. Everything else on a
// plate has been cut, scooped or shaped by a kitchen; this arrives as the animal
// and is carved at the table, and a sharing dish is most of what a board or a
// Sunday menu is. What says so is the outline: it tapers to one end, it is domed
// along the back and flat underneath where it sat in the tray, and it carries
// its legs at the wide end.
export function roast(seed: number, rings = 34, seg = 30): Prim {
  const ph = phases(seed, 3266489917)
  const bump = (t: number) => Math.max(0, 1 - t * t)
  // Fat two thirds of the way along and closing at both ends, so the silhouette
  // has a head end and a tail end rather than being a lozenge -- and with a
  // breast standing proud of the line, which is what a bird has and a joint of
  // pork tied into a cylinder does not.
  const girth = (u: number) =>
    Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u * 2 - 1), 2.6)), 0.4) * (0.5 + 0.44 * u) +
    0.16 * bump((u - 0.5) / 0.32)
  // Two thighs, low and out to either side of the wide end. Sitting them on the
  // waist of the body rather than on its back is what makes them read as legs
  // tucked under rather than as two lumps on a loaf -- and they have to be
  // emphatic, because the placement squashes this form hard across its width
  // and a subtle bulge disappears entirely into the body.
  const leg = (u: number, a: number) =>
    0.62 * bump((u - 0.78) / 0.26) * Math.pow(Math.abs(Math.sin(a)), 2.2) * Math.max(0, 0.34 - 0.62 * Math.cos(a))

  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= rings; r++) {
    const u = r / rings
    const g = girth(u)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      // Trussed and uneven. A roast that comes out of an oven smooth came out of
      // a mould.
      const wob =
        1 + 0.055 * Math.sin(3 * a + ph[0] + u * 5) + 0.035 * Math.sin(7 * u + ph[1]) +
        0.03 * Math.sin(11 * u + 2 * a + ph[2])
      // A ridge along the spine: the breastbone of a bird, the dorsal line of a
      // fish. It is the one line that runs the length of every whole thing that
      // ever reaches a plate, and without it the form is a bread roll.
      const ridge = 0.1 * Math.pow(Math.max(0, Math.cos(a)), 6) * Math.sin(Math.PI * u)
      const rad = Math.max(0, g + leg(u, a) + ridge) * wob
      const up = Math.cos(a)
      // Domed over the back, pressed flat underneath. A roast is not a sausage:
      // it has a side that faced the oven and a side that sat in the fat.
      pos.push(u * 2 - 1, rad * up * (up > 0 ? 1 : 0.48), rad * Math.sin(a) * 0.94)
    }
  }
  quadGrid(idx, 0, rings + 1, seg + 1)

  // Two lobes off the wide end, swept rather than bulged: a bulge on the body
  // gets squashed away with the body when the placement presses this form flat
  // across its width, and the whole point of them is to break the silhouette.
  // On a bird they are the legs; on a fish the same two lobes read as the tail.
  for (const side of [1, -1]) {
    const path: Array<[number, number, number]> = []
    for (let i = 0; i <= 9; i++) {
      const t = i / 9
      // Starting inside the body, so the tapered end of the sweep is buried and
      // the lobe grows out of the roast rather than being parked against it.
      path.push([0.26 + 0.82 * t, -0.16 - 0.1 * t, side * (0.2 + 0.42 * t)])
    }
    sweepInto(pos, idx, path, (t) => 0.34 * (1 - 0.48 * t), { seg: 10 })
  }

  fitY(pos)
  const prim = solid(pos, idx)
  // The body's grid is laid down first, so its seam is still the first
  // (rings + 1) x (seg + 1) block however much is appended after it.
  weldSeam(prim.normals, rings, seg)
  return prim
}

// A whole roast bird: chicken, duck, turkey, poussin.
//
// The generic roast is a tapered loaf with two lobes. A bird is recognised by three things it has and a loaf does not: a
// plump breast standing up at one end, two drumsticks, each a fat thigh narrowing to a thin shank and ending in a small
// knob of bone, lying along the sides and pointing back towards the tail, and a pair of wings folded against the flanks.
// The breast end is +X, the tail end -X, and the base is flat so it sits in the pan.
export function bird(seed: number, rings = 38, seg = 32): Prim {
  const ph = phases(seed, 3266489917)
  const bump = (t: number) => Math.max(0, 1 - t * t)

  // The body: an egg with its fat end at the breast, domed over the back and pressed flat underneath.
  const girth = (u: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u * 2 - 1), 2.3)), 0.46) * (0.5 + 0.34 * u) + 0.12 * bump((u - 0.7) / 0.3)
  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= rings; r++) {
    const u = r / rings
    const g = girth(u)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const wob = 1 + 0.04 * Math.sin(3 * a + ph[0] + u * 4) + 0.03 * Math.sin(8 * u + ph[1])
      // The breastbone: a soft keel down the top, between the two breasts.
      const keel = 0.07 * Math.pow(Math.max(0, Math.cos(a)), 8) * bump((u - 0.68) / 0.42)
      const rad = Math.max(0, g + keel) * wob
      const up = Math.cos(a)
      pos.push(u * 2 - 1, rad * up * (up > 0 ? 1 : 0.5), rad * Math.sin(a) * 0.96)
    }
  }
  quadGrid(idx, 0, rings + 1, seg + 1)

  // A drumstick: thigh, shank, then the knob of bone. Swept from inside the body so it grows out of it, and drawn in
  // local space where the whole shape is squashed flat across its width when it is placed, so it is made emphatic.
  for (const side of [1, -1]) {
    const path: Array<[number, number, number]> = [
      [0.02, 0.0, side * 0.26],
      [-0.2, -0.02, side * 0.6],
      [-0.5, 0.04, side * 0.84],
      [-0.78, 0.26, side * 0.78],
      [-1.02, 0.52, side * 0.62],
    ]
    const sampled: Array<[number, number, number]> = []
    for (let i = 0; i < 24; i++) {
      const t = i / 23
      const k = t * (path.length - 1)
      const j = Math.min(path.length - 2, Math.floor(k))
      const f = k - j
      sampled.push([0, 1, 2].map((c) => path[j][c] + (path[j + 1][c] - path[j][c]) * f) as [number, number, number])
    }
    // Fat thigh, narrow shank, a small knob at the very end.
    const radius = (t: number) => 0.36 * (1 - 0.6 * Math.min(1, t * 1.5)) + 0.07 * Math.exp(-Math.pow((t - 0.96) / 0.06, 2))
    sweepInto(pos, idx, sampled, radius, { seg: 12, taper: false })
  }

  // The wings, folded against the flanks: flat and short, tipped back.
  for (const side of [1, -1]) {
    const sampled: Array<[number, number, number]> = []
    for (let i = 0; i < 12; i++) {
      const t = i / 11
      sampled.push([0.62 - 0.55 * t, 0.12 - 0.05 * t, side * (0.62 + 0.24 * t)])
    }
    sweepInto(pos, idx, sampled, (t) => 0.17 * (1 - 0.6 * t), { seg: 10, flatten: 0.8 })
  }

  fitY(pos)
  const prim = solid(pos, idx)
  weldSeam(prim.normals, rings, seg)
  return prim
}
