import { phases, quadGrid, smoothNormals, solid } from './helpers'
import { CUT_PROFILE, DISC_PROFILE } from './profiles'
import type { Prim } from './types'

// Cooked protein with a form of its own.
//
// A steak, a chicken breast and a fillet of fish are all "a slab of cooked flesh", and rendered as the same rounded
// block they were the same thing. They are not: a steak is a thick block with a band of fat down one side, a breast is
// a teardrop, thick at the shoulder and tapering to a point, with a keel along its back, and a fillet is a long wedge
// thinning to the tail, with the chevron ridges of the muscle blocks across its top.
//
// All three are one construction: the same rounded cross-section as before, swept round an outline, with the outline,
// the thickness along the length and the relief of the top surface chosen by kind. The long axis is X, the tail of a
// breast or a fillet is at -X, and the base stays flat at y = -1 so the piece sits on the plate.
export type CutKind = 'steak' | 'breast' | 'fillet' | 'patty' | 'chunk'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export function cutSolid(
  seed: number,
  kind: CutKind,
  // The same options a crust shell needs as the body it covers: the upper part only (fromY), a hair larger (grow) and
  // lifted (lift), built from the same seed so the two match exactly.
  { fromY = -Infinity, grow = 1, lift = 0, seg = 76, strip }: { fromY?: number; grow?: number; lift?: number; seg?: number; strip?: { from: number; to: number; rMin: number; yMin?: number; yMax?: number } } = {},
): Prim {
  const ph = phases(seed, 2246822519, 8)

  // The outline: a rounded rectangle for a steak, normalised to unit mean radius so a "same size" steak is the same size.
  // Squared off by kind: a steak is a rounded rectangle, a fillet a little less so, a breast nearly an ellipse.
  const n = kind === 'steak' ? 3.4 : kind === 'fillet' ? 3.0 : kind === 'patty' ? 2.0 : kind === 'chunk' ? 2.8 : 2.4
  const profile = kind === 'patty' ? DISC_PROFILE : CUT_PROFILE
  const corner = (a: number) => {
    const c = Math.abs(Math.cos(a))
    const s = Math.abs(Math.sin(a))
    return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n)
  }
  let mean = 0
  for (let i = 0; i < 180; i++) mean += corner((i / 180) * Math.PI * 2)
  mean /= 180

  // The cross-section, refined so that relief on the top surface has vertices to live on.
  const rows: Array<[number, number]> = []
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    for (let k = 0; k < 3; k++) rows.push([r0 + (r1 - r0) * (k / 3), y0 + (y1 - y0) * (k / 3)])
  }
  rows.push(profile[profile.length - 1])
  // A strip is just a band of the surface (the fat down one side of a steak): some of the columns, and only the rows out
  // near the edge. It is drawn as a piece of its own, in its own colour.
  const kept = rows.filter(([r, y]) => y >= fromY && (!strip || (r >= strip.rMin && y >= (strip.yMin ?? -Infinity) && y <= (strip.yMax ?? Infinity))))
  const first = strip ? Math.ceil((strip.from / (Math.PI * 2)) * seg) : 0
  const last = strip ? Math.floor((strip.to / (Math.PI * 2)) * seg) : seg
  const columns = last - first + 1

  const pos: number[] = []
  const idx: number[] = []
  for (const [r, y] of kept) {
    for (let s = first; s <= last; s++) {
      const a = (s / seg) * Math.PI * 2
      const wobble = 1 + 0.045 * (Math.sin(3 * a + ph[0]) * 0.6 + Math.sin(5 * a + ph[1]) * 0.3 + Math.sin(8 * a + ph[2]) * 0.1)
      // A hand-formed patty has a ragged edge: it was pressed out, and the meat tore a little where it spread.
      const chunky = kind === 'chunk' ? 1 + 0.1 * Math.sin(2 * a + ph[3]) + 0.07 * Math.sin(4 * a + ph[4]) + 0.045 * Math.sin(7 * a + ph[5]) : 1
      const ragged = kind === 'patty' ? 1 + 0.06 * Math.sin(11 * a + ph[3]) + 0.04 * Math.sin(17 * a + ph[4]) + 0.025 * Math.sin(23 * a + ph[5]) : 1
      const rad = r * wobble * ragged * chunky * corner(a) / mean
      let x = rad * Math.cos(a)
      let z = rad * Math.sin(a)

      // How thick the piece is at this point along its length (1 is the full cross-section), and how wide.
      let thick = 1
      if (kind === 'breast') {
        // Pointed at the tail, blunt at the shoulder.
        z *= 0.42 + 0.58 * Math.pow(smooth(-1, 0.45, x), 0.7)
        // A breast is not straight: it bends round the carcass it came off.
        z += 0.16 * Math.sin((Math.PI * (x + 1)) / 2)
        thick = 0.62 + 0.38 * smooth(-1, 0.3, x)
      } else if (kind === 'chunk') {
        thick = 0.9 + 0.1 * Math.sin(2.4 * x + ph[3])
      } else if (kind === 'patty') {
        thick = 0.96 + 0.04 * Math.sin(3 * x + ph[3])
      } else if (kind === 'fillet') {
        // A long wedge: a full shoulder, a thin tail, and a belly that is thinner than the back.
        z *= 0.28 + 0.72 * smooth(-1, 0.55, x)
        // The shoulder end is a straight cut, not a point: the fillet was taken off the bone here.
        x = Math.min(1, x * 1.14)
        thick = 0.3 + 0.7 * smooth(-1, 0.5, x)
      } else {
        thick = 0.94 + 0.06 * Math.sin(2 * x + ph[3])
      }

      // Squashed towards the flat base rather than about the middle, so the underside stays on the plate.
      const base = y <= -0.99
      let yy = -1 + (y + 1) * thick
      const top = smooth(0.15, 0.85, y)

      // The relief of the top surface.
      let relief = 0
      if (kind === 'steak') {
        relief += 0.1 * Math.sin(2.1 * x + ph[4]) * Math.sin(1.7 * z + ph[5]) + 0.045 * Math.sin(6 * x + ph[6]) * Math.sin(5 * z + ph[7])
        // A band of fat rolled over the edge along one long side: thicker, and standing a little proud.
        const side = smooth(0.25, 0.7, Math.sin(a)) * smooth(0.82, 1.0, r)
        relief += 0.24 * side
        const bulge = 1 + 0.025 * side
        x *= bulge
        z *= bulge
      } else if (kind === 'chunk') {
        // A roast chunk: lumpy, with the blistered, uneven top of something that was shaken in hot fat.
        relief += 0.2 * Math.sin(3.1 * x + ph[4]) * Math.sin(2.7 * z + ph[5]) + 0.11 * Math.sin(7 * x + ph[6]) * Math.sin(6.3 * z + ph[7])
      } else if (kind === 'patty') {
        // Dimpled and cracked across the top, and a little proud at the rim where the meat was pushed out.
        relief += 0.13 * Math.sin(4.1 * x + ph[4]) * Math.sin(3.7 * z + ph[5]) + 0.07 * Math.sin(9 * x + ph[6]) * Math.sin(8 * z + ph[7])
        relief += 0.1 * smooth(0.8, 1.0, r)
      } else if (kind === 'breast') {
        // The keel along the back of the breast, and the soft lobes either side of it.
        relief += 0.3 * Math.exp(-Math.pow(z / 0.4, 2)) * smooth(-0.95, 0.3, x)
        relief += 0.07 * Math.sin(3.2 * x + ph[4]) * Math.sin(2.4 * z + ph[5])
      } else {
        // Chevrons: the muscle blocks of a fish, running out and back from the spine.
        const chevron = Math.abs(Math.sin(Math.PI * (3.4 * x + 1.6 * Math.abs(z) + 0.3 * Math.sin(1.7 * z + ph[4]))))
        relief += 0.2 * Math.pow(chevron, 0.7) * smooth(-0.8, -0.1, x)
        relief += 0.06 * Math.sin(2.6 * x + ph[5]) * Math.sin(2 * z + ph[6])
      }
      yy += relief * top * thick
      // Fine irregularity everywhere on top, so no surface is quite smooth.
      yy += 0.012 * Math.sin(11 * x + ph[1]) * Math.sin(9 * z + ph[2]) * top
      if (base) yy = -1

      pos.push(x * grow, yy + lift, z * grow)
    }
  }
  quadGrid(idx, 0, kept.length, columns)
  if (strip) {
    // An open band has no volume to tell it which way is out, so look at where its normals point instead.
    const n3 = smoothNormals(pos, idx)
    let outward = 0
    for (let i = 0; i < pos.length; i += 3) outward += n3[i] * pos[i] + n3[i + 2] * pos[i + 2] + n3[i + 1] * 0.2
    if (outward < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
    return { positions: new Float32Array(pos), normals: smoothNormals(pos, idx), indices: new Uint16Array(idx) }
  }
  return solid(pos, idx)
}
