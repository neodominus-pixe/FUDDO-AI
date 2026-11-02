import { fitRadial, fitY, phases, quadGrid, seeded, solid } from './helpers'
import type { Prim } from './types'

// --- Shells and folds -----------------------------------------------------
// Two forms built the same way: a curved sheet with a thickness that tapers to
// nothing at every edge, so the surface closes into a solid without needing a
// skirt stitched round the rim.

export function sheet(
  rows: number,
  cols: number,
  point: (u: number, v: number) => [number, number, number],
  thickness: (u: number, v: number) => number,
  normalAt: (u: number, v: number) => [number, number, number],
): Prim {
  const pos: number[] = []
  const idx: number[] = []
  for (const outer of [true, false]) {
    const base = pos.length / 3
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const u = r / rows
        const v = c / cols
        const [x, y, z] = point(u, v)
        const t = outer ? 0 : thickness(u, v)
        const [nx, ny, nz] = normalAt(u, v)
        pos.push(x - nx * t, y - ny * t, z - nz * t)
      }
    }
    quadGrid(idx, base, rows + 1, cols + 1, !outer)
  }
  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A bivalve shell: a fan hinged at one end, dished in the middle, with ribs
// running out from the hinge. Mussels, clams and oysters arrive in these and
// nothing else on a plate has this outline.
export function shell(seed: number, rows = 22, cols = 26): Prim {
  const ph = phases(seed, 374761393)
  const SPREAD = 1.16
  const RIBS = 7
  // Deep enough to be a cup. Shallower than this it reads as a bent sheet, which
  // is what a half shell looks like when you flatten it: a folded grey cloth.
  const depth = (u: number, v: number) =>
    1.05 * Math.pow(Math.sin(Math.PI * u), 0.62) * Math.pow(Math.cos((v * 2 - 1) * 1.2), 0.7)
  const rib = (u: number, v: number) => 0.09 * Math.sin(RIBS * (v * 2 - 1) * Math.PI * 0.5 + ph[0]) * u
  const point = (u: number, v: number): [number, number, number] => {
    const a = (v * 2 - 1) * SPREAD
    return [-1 + 2 * u * Math.cos(a), -depth(u, v) + rib(u, v), 2 * u * Math.sin(a) * 0.92]
  }
  return sheet(
    rows,
    cols,
    point,
    // Thinnest at the rim, as a shell is, and zero at every edge so the two
    // surfaces meet.
    (u, v) => 0.2 * Math.pow(Math.sin(Math.PI * u), 0.5) * Math.pow(Math.cos((v * 2 - 1) * 1.45), 0.5),
    () => [0, 1, 0],
  )
}

// A sheet folded into a U: a taco, a wrap, an omelette turned over on itself.
export function folded(seed: number, rows = 18, cols = 22): Prim {
  const ph = phases(seed, 2654435761)
  const point = (u: number, v: number): [number, number, number] => {
    const th = (v - 0.5) * Math.PI * 1.2
    // Pinched slightly at both ends, and never perfectly regular.
    const taper = 0.86 + 0.14 * Math.sin(Math.PI * u)
    const wob = 1 + 0.05 * Math.sin(3 * v * Math.PI + ph[0]) * Math.sin(2 * u * Math.PI + ph[1])
    return [(u * 2 - 1) * 0.98, -Math.cos(th) * taper * wob, Math.sin(th) * 0.8 * taper * wob]
  }
  return sheet(
    rows,
    cols,
    point,
    (u, v) => 0.13 * Math.pow(Math.sin(Math.PI * u), 0.4) * Math.pow(Math.sin(Math.PI * v), 0.4),
    (u, v) => {
      const th = (v - 0.5) * Math.PI * 1.2
      return [0, -Math.cos(th), Math.sin(th)]
    },
  )
}

// --- Wedges, hoops and skewers --------------------------------------------
// Three forms the library had no way to say, each of which a lot of the world's
// food is: a slice cut from something round, a hoop with a hole in it, and food
// threaded onto a stick. Plated as a lumpy sphere they were all the same dish.

// A wedge: a sector cut from something round, point inwards and crust outwards.
// A slice of cake, a slice of pizza, a cheek of melon, a wedge of lemon. Built
// as a top surface over a flat base, meeting at the edges the way the leaves
// and shells do, but with the meeting driven to the last few per cent of the
// way out so the sides stand up: a slice of cake has walls, it is not a lens.
export function wedge(seed: number, spread = 1.25, rows = 14, cols = 14): Prim {
  const ph = phases(seed, 1442695041)
  const pos: number[] = []
  const idx: number[] = []
  // 1 through the middle of the slice, 0 at the tip, the crust and both cut
  // faces. The eighth power is what keeps it at 1 until it is nearly there.
  const inside = (t: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t * 2 - 1), 8)), 0.2)
  for (const up of [true, false]) {
    const base = pos.length / 3
    for (let r = 0; r <= rows; r++) {
      const u = r / rows
      for (let c = 0; c <= cols; c++) {
        const v = c / cols
        const a = (v * 2 - 1) * (spread / 2)
        // Blunt at the point -- a slice is cut from a round thing, not sharpened
        // to nothing -- and slightly uneven along the crust.
        const rad = (0.1 + 0.9 * u) * (1 + 0.04 * Math.sin(4 * v * Math.PI + ph[0]) * u)
        const h = (0.76 + 0.24 * u) * inside(u) * inside(v)
        pos.push(-1 + 2 * rad * Math.cos(a), up ? -1 + 2 * h : -1, 2 * rad * Math.sin(a) * 0.96)
      }
    }
    quadGrid(idx, base, rows + 1, cols + 1, up)
  }
  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A brittle crisp standing in the dish: a tuile, a parmesan frico, a shard of
// honeycomb, a poppadom snapped over the top, a crisped chicken skin.
//
// Three things make it read, and a flat disc has none of them: it leans, so it
// has a silhouette; it is thin enough that the light comes through the edge; and
// it was snapped rather than cut, so the outline nicks in and out instead of
// tapering. Laid flat on the plate a crisp is a coaster -- standing up it is the
// one thing on a fine-dining plate that has any height at all.
export function shard(seed: number, rows = 18, cols = 16): Prim {
  const rand = seeded(seed)
  // Back from vertical. Far enough to lean on what it is stuck into; not so far
  // that it lies down.
  const TIP = 0.55
  const [ct, st] = [Math.cos(TIP), Math.sin(TIP)]
  // Narrow where it was pushed into the dish, widest in the middle, and broken
  // off at the top. A shard that is widest at its base is a fan, and a shard of
  // even width is a ribbon; neither of them is a crisp.
  const taper = (u: number) => Math.pow(Math.sin(Math.PI * (0.14 + 0.8 * u)), 0.5)

  // Each edge is a run of straight segments between corners, not a wave. The
  // first pass at this used a few sine harmonics, which is the obvious way to
  // make an outline irregular and completely the wrong one: a smooth undulation
  // reads as cloth, and the render came out as a sheet of crumpled foil. What
  // says "brittle" is a straight edge with a corner in it -- the shape a thing
  // makes when it snaps rather than bends -- so the outline is drawn by picking
  // corners and joining them up.
  const BREAKS = 5
  const edge = () => {
    const w = Array.from({ length: BREAKS + 1 }, () => 0.52 + 0.48 * rand())
    return (u: number) => {
      const t = Math.min(BREAKS - 1e-9, u * BREAKS)
      const i = Math.floor(t)
      return taper(u) * (w[i] + (w[i + 1] - w[i]) * (t - i))
    }
  }
  // Two independent edges, so the shard is not a symmetrical lens. Nothing that
  // was broken off something is symmetrical.
  const [left, right] = [edge(), edge()]

  // Curled across its width, the way anything thin does as it cools. Strongest
  // at the base, because that is the part that sat on the tray.
  const bow = (u: number, s: number) => (0.34 - 0.2 * u) * (s * s - 0.34)
  const point = (u: number, v: number): [number, number, number] => {
    const l = left(u)
    const r = right(u)
    const x = -l + v * (l + r)
    // Measured against the shard's own width so the curl follows the edges
    // wherever they happen to be, rather than pivoting about a centre line the
    // outline no longer has.
    const b = bow(u, (2 * x) / Math.max(1e-6, l + r))
    return [x, u * ct + b * st, -u * st + b * ct]
  }
  return sheet(
    rows,
    cols,
    point,
    // Barely there, and nothing at all at the edges, which is what lets the
    // light through them.
    (u, v) => 0.034 * Math.pow(Math.sin(Math.PI * u), 0.28) * Math.pow(Math.sin(Math.PI * v), 0.28),
    () => [0, ct, -st],
  )
}
