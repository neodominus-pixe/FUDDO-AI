import { pieceInto } from './built'
import { chipInto, fitRadial, fitY, phases, quadGrid, rotator, seeded, solid, sweepInto } from './helpers'
import type { Prim } from './types'

// A nest of long pasta: a domed coil of strands wound in from the rim, with a
// few loose strands lying over the top. Modelled as one grooved surface rather
// than as separate strands -- real strands leave gaps you can see the plate
// through, and enough of them to close those gaps costs more than the plate.
export function nest(seed: number, rings = 30, seg = 68): Prim {
  const ph = phases(seed, 1103515245)
  const COILS = 6
  const core = (t: number) => Math.pow(Math.max(0, 1 - t * t), 0.5)
  // Grooves die out at the centre, where every angle meets, and at the rim,
  // where the surface has to come down to meet the plate.
  const fade = (t: number) => Math.min(1, t / 0.1) * Math.pow(Math.max(0, 1 - t * t), 0.18)
  // Rounded where the strands sit and pinched where they meet, rather than a
  // plain sine: an even ripple reads as a piped rosette, not as wound pasta.
  const coil = (v: number) => Math.sign(Math.sin(v)) * Math.pow(Math.abs(Math.sin(v)), 0.65)
  // The coil is pulled off centre, because pasta is wound by a fork and not on
  // a lathe. Perfectly concentric rings are what made this read as a cake.
  const groove = (t: number, a: number) =>
    0.23 * coil(COILS * 2 * Math.PI * t + a + 0.55 * Math.sin(2 * a + ph[3]) + ph[0]) +
    0.055 * Math.sin(11 * 2 * Math.PI * t + 2 * a + ph[1])
  const heightAt = (t: number, a: number) => -1 + 2 * (0.78 * core(t) + groove(t, a) * fade(t))
  // The coil pushes the outline out as well as up. Displacing only upwards left
  // the outer slope smooth, because on a low wide mound a vertical ripple is
  // barely visible -- it is the scalloped edge that says "strands" from the side.
  const radiusAt = (t: number, a: number) =>
    t * (1 + 0.04 * Math.sin(3 * a + ph[2]) + 0.07 * coil(COILS * 2 * Math.PI * t + a + ph[0]) * fade(t))

  const pos: number[] = []
  const idx: number[] = []
  for (const top of [true, false]) {
    // The underside is flat, so it needs no rows between the centre and the rim.
    // Tessellating it like the top doubled the size of the heaviest mesh in the
    // library to describe a disc nobody can see.
    const rows = top ? rings : 1
    const base = pos.length / 3
    for (let r = 0; r <= rows; r++) {
      const t = r / rows
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2
        const rad = radiusAt(t, a)
        pos.push(rad * Math.cos(a), top ? heightAt(t, a) : -1, rad * Math.sin(a))
      }
    }
    quadGrid(idx, base, rows + 1, seg + 1, !top)
  }

  // Two strands trailing over the mound, which is what stops a coil reading as
  // a cinnamon bun. They dip towards the centre and run back out to the rim.
  const rand = seeded(seed)
  for (let k = 0; k < 3; k++) {
    const a0 = rand() * Math.PI * 2
    const dir = k % 2 ? 1 : -1
    // Drawn once per strand, not once per point: sampling the arc's own shape
    // inside the loop turns a smooth strand into a zigzag.
    const span = Math.PI * (1.3 + 0.7 * rand())
    const dip = 0.3 + 0.24 * rand()
    const path: Array<[number, number, number]> = []
    for (let i = 0; i <= 22; i++) {
      const u = i / 22
      const a = a0 + dir * u * span
      // Kept inboard of the rim so the tapered ends die away on top of the mound
      // rather than on its silhouette, where they showed as splinters.
      const t = 0.78 - dip * Math.sin(Math.PI * u)
      path.push([radiusAt(t, a) * Math.cos(a), heightAt(t, a) + 0.07, radiusAt(t, a) * Math.sin(a)])
    }
    // Stretched upright in local space because the whole nest is squashed flat
    // when it is placed. Left round here, a strand lands as a flat shard.
    sweepInto(pos, idx, path, 0.085, { seg: 8, flatten: 2.6 })
  }

  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A serving of short pasta: a mound of separate pieces. One element on the
// plate is a portion, not a single penne, and a portion is the shape that has
// to read -- a smooth lump the size of a fist reads as mashed potato.
export function pile(
  seed: number,
  opts: {
    hollow?: boolean
    count?: number
    radius?: number
    length?: number
    seg?: number
    rows?: number
    ridged?: boolean
    blunt?: boolean
    core?: number
    square?: boolean
    lengthJitter?: number
  } = {},
): Prim {
  // Fewer sides and fewer rows on small pieces: a grain of rice does not need
  // the silhouette budget of a gnocchi, and a portion of rice is sixty of them.
  const { hollow = false, count = 12, seg = 12, rows = 7, ridged = false, blunt = false, core = 0, square = false, lengthJitter = 0 } = opts
  const radius = opts.radius ?? (hollow ? 0.2 : 0.24)
  const length = opts.length ?? (hollow ? 0.82 : 0.62)
  const rand = seeded(seed)
  const pos: number[] = []
  const idx: number[] = []

  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    // Spread over the dome, not over the plate. Scattering by area -- the
    // square root -- puts most of the pieces out at the rim, and the top of the
    // heap is what a camera above the plate actually sees: a portion of rice
    // came out as a ring of grains with a hole in the middle of it.
    const d = Math.pow(rand(), 0.9) * 0.86
    // Heaped on a dome rather than stacked in flat layers. Pieces sit near the
    // surface of that dome, because the ones buried inside it cost vertices and
    // are never seen -- and because a heap built flat gets stretched to fill its
    // own box afterwards, which turns small pieces into spikes.
    const lift = 0.66 * Math.pow(Math.max(0, 1 - (d / 0.88) ** 2), 0.7)
    const place = rotator(rand() * Math.PI * 2, (rand() - 0.5) * 1.1, rand() * Math.PI * 2)
    const cx = Math.cos(a) * d
    const cz = Math.sin(a) * d
    const cy = -1 + radius + lift * (0.72 + 0.28 * rand())
    pieceInto(
      pos,
      idx,
      (x, y, z) => {
        const [px, py, pz] = place(x, y, z)
        return [px + cx, py + cy, pz + cz]
      },
      { hollow, length: length * (1 + lengthJitter * (rand() - 0.5)), radius: radius * (1 + lengthJitter * 0.3 * (rand() - 0.5)), seg, rows, ridged, blunt, square },
    )
  }

  // A mound under the pieces, sized to sit just inside them. A heap of separate
  // pieces has gaps, and what shows through a gap has to be more of the heap --
  // through a portion of chips you could see the plate, which is what made it
  // read as a handful thrown down rather than as a serving.
  if (core > 0) {
    const base = pos.length / 3
    const ph = phases(seed, 3266489917)
    const [mseg, mrows] = [30, 10]
    for (let r = 0; r <= mrows; r++) {
      const t = r / mrows
      for (let s2 = 0; s2 <= mseg; s2++) {
        const a = (s2 / mseg) * Math.PI * 2
        const wob = 1 + 0.07 * Math.sin(3 * a + ph[0]) + 0.04 * Math.sin(5 * a + ph[1])
        pos.push(
          t * core * wob * Math.cos(a),
          -1 + radius * 0.4 + Math.pow(Math.max(0, 1 - t * t), 1.4) * core * 0.62,
          t * core * wob * Math.sin(a),
        )
      }
    }
    quadGrid(idx, base, mrows + 1, mseg + 1)
    const flat = pos.length / 3
    for (let r = 0; r <= 2; r++) {
      const t = r / 2
      for (let s2 = 0; s2 <= mseg; s2++) {
        const a = (s2 / mseg) * Math.PI * 2
        pos.push(t * core * Math.cos(a), -1 + radius * 0.4, t * core * Math.sin(a))
      }
    }
    quadGrid(idx, flat, 3, mseg + 1)
  }

  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A scoop of grains: rice, couscous, quinoa, lentils, risotto.
//
// Built the way the nest is, and for the same reason. A portion of rice is five
// hundred grains; modelling five hundred of anything costs more than the rest
// of the plate put together, and modelling ninety instead does not read as rice
// -- it reads as gravel, with the plate showing through the gaps. So: one domed
// mass, with the grains embossed into its surface.
//
// The grains come from a cell pattern over the surface -- one grain per cell,
// nudged off centre and turned by its own hash, so no two sit the same way and
// none of it repeats visibly.
export function scoop(seed: number, { cells = 5.2, depth = 0.19, rows = 52, seg = 84 } = {}): Prim {
  const ph = phases(seed, 1274126177)
  // Hash of a cell, as two offsets and an angle.
  const cell = (i: number, j: number) => {
    let h = (Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ (seed * 2246822519)) >>> 0
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
    return [
      ((h & 255) / 255 - 0.5) * 0.7,
      (((h >> 8) & 255) / 255 - 0.5) * 0.7,
      (((h >> 16) & 255) / 255) * Math.PI,
      0.7 + (((h >> 24) & 255) / 255) * 0.5,
    ]
  }
  // How far a point stands proud of the smooth dome: the highest grain covering
  // it. A grain is an ellipse three times as long as it is wide, which is what
  // tells rice from couscous without modelling either.
  const emboss = (s: number, t: number) => {
    const [ci, cj] = [Math.floor(s), Math.floor(t)]
    let best = 0
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const [ox, oy, ang, size] = cell(i, j)
        const dx = s - (i + 0.5 + ox)
        const dy = t - (j + 0.5 + oy)
        const [c, sn] = [Math.cos(ang), Math.sin(ang)]
        const u = (dx * c + dy * sn) / (0.66 * size)
        const v = (-dx * sn + dy * c) / (0.26 * size)
        const d2 = u * u + v * v
        if (d2 < 1) best = Math.max(best, Math.sqrt(1 - d2))
      }
    }
    return best
  }

  const pos: number[] = []
  const idx: number[] = []
  // Top: a dome from the crown down to where it meets the plate, wobbled a
  // little so the scoop is not a hemisphere.
  for (let r = 0; r <= rows; r++) {
    const u = r / rows
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const wob = 1 + 0.06 * Math.sin(3 * a + ph[0]) + 0.035 * Math.sin(5 * a + ph[1])
      const rad = u * wob
      // Flattened rather than hemispherical, and thinning to an edge where it
      // meets the plate: a hemisphere stands on a vertical wall, which reads as
      // a puck of rice turned out of a mould.
      const y = Math.pow(Math.max(0, 1 - u * u), 1.5)
      // The cells are laid out across the plate rather than around the dome:
      // in (angle, height) they converge at the crown and line up into rings,
      // and a scoop of rice banded like a fingerprint is not a scoop of rice.
      const [px, pz] = [rad * Math.cos(a), rad * Math.sin(a)]
      const lift = depth * emboss(px * cells, pz * cells)
      pos.push(px * (1 + lift * 0.35), y + lift * 0.85, pz * (1 + lift * 0.35))
    }
  }
  quadGrid(idx, 0, rows + 1, seg + 1)
  // Base: flat, closing the dome onto the plate.
  const base = pos.length / 3
  for (let r = 0; r <= 3; r++) {
    const t = r / 3
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const wob = 1 + 0.06 * Math.sin(3 * a + ph[0]) + 0.035 * Math.sin(5 * a + ph[1])
      pos.push(t * wob * Math.cos(a), 0, t * wob * Math.sin(a))
    }
  }
  quadGrid(idx, base, 4, seg + 1)
  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A scatter of small hard pieces: breadcrumbs over a gratin, chopped hazelnuts,
// dukkah, granola, a spoonful of praline broken over an ice cream.
//
// The picture has always drawn these as pieces, because that is what they are --
// what makes a crumb a crumb is that you can see the individual bits of it. The
// model drew one lumpy sphere instead, so a spoonful of panko came out as a
// beige boulder the size of the duck next to it. No mound underneath: crumbs are
// scattered, and the plate showing between them is the point rather than a gap.
export function rubble(seed: number, { count = 22, size = 0.2, spread = 0.88, heap = 0.34 } = {}): Prim {
  const rand = seeded(seed)
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    // Spread by the square root of the draw would push most of the pieces to the
    // rim; a scatter is denser in the middle, where the spoon let go.
    const d = Math.pow(rand(), 0.62) * spread
    const s = size * (0.55 + 0.9 * rand())
    const place = rotator(rand() * Math.PI * 2, (rand() - 0.5) * 0.9, rand() * Math.PI * 2)
    const cx = Math.cos(a) * d
    const cz = Math.sin(a) * d
    // A pinch lands thickest where it was aimed, so the middle stands a little
    // proud -- but only a little, or it reads as a heap and not as a scatter.
    const cy = -1 + s + heap * Math.max(0, 1 - (d / spread) ** 2) * (0.4 + 0.6 * rand())
    chipInto(pos, idx, rand, (x, y, z) => {
      const [px, py, pz] = place(x * s, y * s * 0.72, z * s)
      return [px + cx, py + cy, pz + cz]
    })
  }
  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A dusting: cocoa over a tiramisu, icing sugar, ash, matcha, a pinch of paprika
// thrown across the plate.
//
// Not a heap of anything. A dusting has no form of its own -- it takes the shape
// of whatever it landed on -- so the only thing there is to render is its edge,
// and that edge is torn rather than round, with specks thrown out past it. Sent
// through the crumb mesh it came out as a pile of gravel the size of a scallop.
export function dust(seed: number, seg = 76, rings = 5): Prim {
  const ph = phases(seed, 2891336453, 6)
  const rand = seeded(seed)
  // Ragged by a third of its own radius. A round dusting is a stencil.
  const edge = (a: number) =>
    0.76 + 0.17 * Math.sin(3 * a + ph[0]) + 0.09 * Math.sin(7 * a + ph[1]) + 0.05 * Math.sin(13 * a + ph[2])

  const pos: number[] = []
  const idx: number[] = []
  for (const top of [true, false]) {
    // Flat underneath -- it is lying on something -- so the base needs no rows.
    const rows = top ? rings : 1
    const base = pos.length / 3
    for (let r = 0; r <= rows; r++) {
      const t = r / rows
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2
        const rad = t * edge(a)
        // Thickest where the sieve was held and thinning to nothing at the edge,
        // so it fades out rather than stopping at a wall.
        pos.push(rad * Math.cos(a), top ? Math.pow(Math.max(0, 1 - t * t), 0.55) : 0, rad * Math.sin(a))
      }
    }
    quadGrid(idx, base, rows + 1, seg + 1, !top)
  }

  // The specks that carried past the edge. Without them a dusting has an
  // outline, and a dusting with an outline is a coaster of cocoa.
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2
    const d = edge(a) * (1.02 + 0.28 * rand())
    const s = 0.035 + 0.03 * rand()
    const place = rotator(rand() * Math.PI * 2, (rand() - 0.5) * 0.5, rand() * Math.PI * 2)
    chipInto(pos, idx, rand, (x, y, z) => {
      const [px, py, pz] = place(x * s, y * s * 0.5, z * s)
      return [px + Math.cos(a) * d, py + s * 0.5, pz + Math.sin(a) * d]
    })
  }

  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}

// A heap of loose grains, each one a real piece: rice, couscous, quinoa, beans. The scoop above embosses grain-shaped
// bumps into one smooth dome, which reads as rice only from a distance; this lays every grain down on the dome as its
// own small ellipsoid, turned its own way and tilted to follow the slope it sits on, over a darker core so that the gaps
// between grains show shadow and not the plate. Grains are built on one budget: the index buffer is 16 bits, so the whole
// heap has to stay under 65,536 vertices.
export function grainHeap(
  seed: number,
  { count = 520, length = 0.13, width = 0.046, rings = 6, seg = 7, bend = 0 } = {},
): Prim {
  const rand = seeded(seed)
  const ph = phases(seed, 1274126177)
  const pos: number[] = []
  const idx: number[] = []

  // The dome: the same outline as the scoop, so a heap of rice fills the footprint a scoop of it did.
  const dome = (u: number) => Math.pow(Math.max(0, 1 - u * u), 1.5)
  const wobble = (a: number) => 1 + 0.06 * Math.sin(3 * a + ph[0]) + 0.035 * Math.sin(5 * a + ph[1])

  // The core, a little under the surface the grains lie on.
  const coreRows = 16
  const coreSeg = 40
  for (let r = 0; r <= coreRows; r++) {
    const u = (r / coreRows) * 0.97
    for (let s = 0; s <= coreSeg; s++) {
      const a = (s / coreSeg) * Math.PI * 2
      pos.push(u * wobble(a) * Math.cos(a) * 0.96, dome(u) * 0.9, u * wobble(a) * Math.sin(a) * 0.96)
    }
  }
  quadGrid(idx, 0, coreRows + 1, coreSeg + 1)
  const base = pos.length / 3
  for (let s = 0; s <= coreSeg; s++) {
    const a = (s / coreSeg) * Math.PI * 2
    pos.push(0.97 * wobble(a) * Math.cos(a) * 0.96, 0, 0.97 * wobble(a) * Math.sin(a) * 0.96)
  }
  pos.push(0, 0, 0)
  const centre = pos.length / 3 - 1
  for (let s = 0; s < coreSeg; s++) idx.push(centre, base + s + 1, base + s)

  // One grain: an ellipsoid long in X, optionally bent along its length like a curved bean.
  const grainRows = rings + 1
  const grainCols = seg + 1
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    const u = Math.sqrt(rand()) * 0.95
    const slope = -3 * u * Math.sqrt(Math.max(0, 1 - u * u))
    const yaw = rand() * Math.PI * 2
    // The grain's axis in the plane, and how far along the radial direction it points: pointing outward on a dome it
    // tips down, across the slope it lies level.
    const along = Math.cos(yaw) * Math.cos(a) - Math.sin(yaw) * Math.sin(a)
    const pitch = Math.atan(slope) * along + (rand() - 0.5) * 0.5
    const place = rotator(yaw, pitch, rand() * Math.PI * 2)
    const L = length * (0.85 + 0.35 * rand())
    const W = width * (0.88 + 0.3 * rand())
    const buried = rand() * rand() * 0.07
    const cx = u * wobble(a) * Math.cos(a)
    const cz = u * wobble(a) * Math.sin(a)
    const cy = dome(u) * 0.97 + W * 0.7 - buried
    const first = pos.length / 3
    for (let r = 0; r < grainRows; r++) {
      const v = -Math.PI / 2 + (Math.PI * r) / (grainRows - 1)
      for (let s = 0; s < grainCols; s++) {
        const t = (s / seg) * Math.PI * 2
        const x = L * Math.sin(v)
        const [gx, gy, gz] = place(x, W * Math.cos(v) * Math.cos(t) + bend * L * (1 - (x / L) * (x / L)) * 0.5, W * Math.cos(v) * Math.sin(t))
        pos.push(cx + gx, cy + gy, cz + gz)
      }
    }
    quadGrid(idx, first, grainRows, grainCols)
  }
  if (pos.length / 3 >= 65535) throw new Error(`A heap of ${count} grains is ${pos.length / 3} vertices; the limit is 65,535`)
  fitY(pos)
  fitRadial(pos)
  return solid(pos, idx)
}
