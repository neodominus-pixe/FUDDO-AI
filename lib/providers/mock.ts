import { elevations, layout, rng } from '../layout'
import { familyFor, type ShapeFamily } from '../shapes'
import type { PlacedElement } from '../layout'
import { SAUCE_HSL, hslCss, resolveHex, shadeHex } from '../palette'
import { PRICING } from '../pricing'
import type { Angle } from '../types'
import { SAUCE_KEY } from '../types'
import type { GenerateRequest, GenerateResult, ImageProvider } from './types'

// Lightens a hex colour, for the highlight pass on each blob. Named `lighten`
// rather than `lift` because renderSvg already has a `lift` for the camera.
function lighten(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (v: number) => Math.round(v + (255 - v) * amount)
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('')}`
}

// How much the plate flattens, and how much of an element's height becomes
// visible, as the camera drops from overhead to table level.
const SQUASH: Record<Angle, number> = { 'top-down': 1, 'three-quarter': 0.66, side: 0.24 }
const LIFT: Record<Angle, number> = { 'top-down': 0, 'three-quarter': 0.62, side: 1 }

// Irregular closed blob so elements read as food rather than as circles.
function blob(cx: number, cy: number, rx: number, ry: number, rand: () => number, points = 9) {
  const pts: string[] = []
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const k = 0.78 + rand() * 0.42
    pts.push(`${(cx + Math.cos(a) * rx * k).toFixed(1)},${(cy + Math.sin(a) * ry * k).toFixed(1)}`)
  }
  return `M ${pts[0]} ${pts.slice(1).map((p) => `L ${p}`).join(' ')} Z`
}

// --- Forms ----------------------------------------------------------------
// Flat drawings of the same shapes the 3D model builds as solids. A spread of
// ten images is what a consultant actually chooses from, so a nest of pasta, a
// seared duck breast and a heap of rice have to be three different pictures
// here too -- and both renderers resolve the form through familyFor(), or
// picking from the pictures and then opening the model shows two dishes.

const n1 = (v: number) => v.toFixed(1)

const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${n1(cx - rx)} ${n1(cy)} a ${n1(rx)} ${n1(ry)} 0 1 0 ${n1(rx * 2)} 0 a ${n1(rx)} ${n1(ry)} 0 1 0 ${n1(-rx * 2)} 0 Z`

// A rounded rectangle, as a path so it can sit in the same list as the others.
function rrect(cx: number, cy: number, rx: number, ry: number, round: number) {
  const r = Math.min(round, Math.min(rx, ry) * 0.98)
  const [l, t, rr, b] = [cx - rx, cy - ry, cx + rx, cy + ry]
  return (
    `M ${n1(l + r)} ${n1(t)} L ${n1(rr - r)} ${n1(t)} Q ${n1(rr)} ${n1(t)} ${n1(rr)} ${n1(t + r)}` +
    ` L ${n1(rr)} ${n1(b - r)} Q ${n1(rr)} ${n1(b)} ${n1(rr - r)} ${n1(b)}` +
    ` L ${n1(l + r)} ${n1(b)} Q ${n1(l)} ${n1(b)} ${n1(l)} ${n1(b - r)}` +
    ` L ${n1(l)} ${n1(t + r)} Q ${n1(l)} ${n1(t)} ${n1(l + r)} ${n1(t)} Z`
  )
}

// A lens with a point at each end: a herb leaf seen from above.
const lens = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${n1(cx - rx)} ${n1(cy)} Q ${n1(cx)} ${n1(cy - ry * 1.9)} ${n1(cx + rx)} ${n1(cy)}` +
  ` Q ${n1(cx)} ${n1(cy + ry * 1.9)} ${n1(cx - rx)} ${n1(cy)} Z`

// A teardrop: round at one end, drawn to a point at the other. A quenelle.
const drop = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${n1(cx + rx)} ${n1(cy)} Q ${n1(cx + rx * 0.2)} ${n1(cy - ry * 1.15)} ${n1(cx - rx * 0.55)} ${n1(cy - ry * 0.62)}` +
  ` Q ${n1(cx - rx * 1.15)} ${n1(cy)} ${n1(cx - rx * 0.55)} ${n1(cy + ry * 0.62)}` +
  ` Q ${n1(cx + rx * 0.2)} ${n1(cy + ry * 1.15)} ${n1(cx + rx)} ${n1(cy)} Z`

// Positions for a portion made of many separate pieces, packed in from the edge
// so no piece hangs outside the footprint the layout gave the element.
function pieces(cx: number, cy: number, rx: number, ry: number, rand: () => number, count: number, pr: number) {
  const out: Array<[number, number, number]> = []
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand())
    out.push([cx + Math.cos(a) * d * rx * (1 - pr), cy + Math.sin(a) * d * ry * (1 - pr), rand()])
  }
  return out
}

// A drink in its glass. From straight above that is a ring of glass round a disc of liquid; as the camera comes down
// the body of the glass shows, with the liquid in the lower part of it. `minor` is the depth of the rim's ellipse and
// `half` is how far the glass stands above and below its middle on screen.
function glassSvg(cx: number, cy: number, rx: number, minor: number, half: number, fill: string): string {
  const top = cy - half * 0.9
  const foot = cy + half
  const level = cy - half * 0.5
  const body = (y: number) => rx * (0.84 + 0.16 * ((foot - y) / Math.max(1e-6, foot - top)))
  const wall = (yTop: number, yBottom: number) =>
    `M ${n1(cx - body(yTop))} ${n1(yTop)} L ${n1(cx - body(yBottom))} ${n1(yBottom)} ` +
    `A ${n1(body(yBottom))} ${n1(minor * 0.84)} 0 0 0 ${n1(cx + body(yBottom))} ${n1(yBottom)} L ${n1(cx + body(yTop))} ${n1(yTop)} Z`
  const out: string[] = []
  if (half > 1) {
    out.push(`<path d="${wall(top, foot)}" fill="rgba(215,228,236,0.3)" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`)
    out.push(`<path d="${wall(level, foot)}" fill="${fill}" opacity="0.92"/>`)
  }
  out.push(`<path d="${ell(cx, top, rx, minor)}" fill="rgba(215,228,236,0.22)" stroke="rgba(255,255,255,0.75)" stroke-width="3"/>`)
  out.push(`<path d="${ell(cx, half > 1 ? level : top, rx * 0.9, minor * 0.9)}" fill="${half > 1 ? lighten(fill, 0.1) : fill}" stroke="rgba(0,0,0,0.1)" stroke-width="2"/>`)
  out.push(`<path d="${ell(cx - rx * 0.28, (half > 1 ? level : top) - minor * 0.28, rx * 0.3, minor * 0.16)}" fill="#fff" opacity="0.4"/>`)
  return out.join('')
}

// One element, drawn flat. Returns finished SVG rather than a path, because the
// forms made of many pieces need their own transforms.
function elementSvg(
  family: ShapeFamily,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  rand: () => number,
): string {
  const solid = (d: string) => `<path d="${d}" fill="${fill}" stroke="rgba(0,0,0,0.16)" stroke-width="2"/>`
  // The lit top of a single lump. Left off anything made of pieces, where the
  // gaps between the pieces already give the eye something to read.
  const sheen = (r: number) =>
    `<path d="${blob(cx, cy - ry * 0.16, rx * r, ry * r, rand)}" fill="${lighten(fill, 0.16)}" opacity="0.75"/>`
  const many = (list: Array<[number, number, number]>, draw: (x: number, y: number, t: number) => string) =>
    list.map(([x, y, t]) => draw(x, y, t)).join('')

  switch (family) {
    case 'leaf':
      return solid(lens(cx, cy, rx, ry))
    case 'quenelle':
      return solid(drop(cx, cy, rx, ry)) + sheen(0.5)
    case 'cut':
    case 'steak':
      return solid(rrect(cx, cy, rx, ry, Math.min(rx, ry) * 0.42)) + sheen(0.62)
    case 'chunk':
      return solid(rrect(cx, cy, rx * 0.9, ry * 0.8, Math.min(rx, ry) * 0.5)) + sheen(0.55)
    case 'prawn':
      // A curled body with its tail fan.
      return solid(lens(cx - rx * 0.1, cy, rx * 0.85, ry * 0.7)) + solid(ell(cx - rx * 0.92, cy + ry * 0.2, rx * 0.2, ry * 0.3)) + sheen(0.4)
    case 'lobster':
      return solid(lens(cx - rx * 0.2, cy, rx * 0.8, ry * 0.6)) + solid(ell(cx + rx * 0.75, cy - ry * 0.55, rx * 0.28, ry * 0.3)) + solid(ell(cx + rx * 0.75, cy + ry * 0.55, rx * 0.28, ry * 0.3)) + sheen(0.4)
    case 'crab':
      return solid(ell(cx, cy, rx * 0.62, ry * 0.9)) + solid(ell(cx + rx * 0.7, cy - ry * 0.7, rx * 0.3, ry * 0.2)) + solid(ell(cx + rx * 0.7, cy + ry * 0.7, rx * 0.3, ry * 0.2)) + sheen(0.45)
    case 'wholefish':
      return solid(lens(cx + rx * 0.1, cy, rx * 0.8, ry * 0.5)) + solid(ell(cx - rx * 0.88, cy, rx * 0.16, ry * 0.4)) + sheen(0.4)
    case 'bird':
      // A whole bird from above: an egg, and the two legs standing out behind it.
      return solid(ell(cx + rx * 0.08, cy, rx * 0.86, ry * 0.8)) + solid(ell(cx - rx * 0.72, cy - ry * 0.62, rx * 0.34, ry * 0.2)) + solid(ell(cx - rx * 0.72, cy + ry * 0.62, rx * 0.34, ry * 0.2)) + sheen(0.5)
    case 'breast':
      // A teardrop with its point to the tail.
      return solid(drop(cx, cy, rx, ry)) + sheen(0.55)
    case 'fillet':
      return solid(lens(cx, cy, rx, ry)) + sheen(0.55)
    case 'slice':
      return solid(rrect(cx, cy, rx, ry, Math.min(rx, ry) * 0.3)) + sheen(0.6)
    case 'coin':
      // A round slice: a rim, and the flesh inside it a shade lighter.
      return solid(ell(cx, cy, rx, ry)) + `<path d="${ell(cx, cy, rx * 0.8, ry * 0.8)}" fill="${lighten(fill, 0.1)}" opacity="0.8"/>` + sheen(0.5)
    case 'pizza':
      // The raised crust, and the lower deck inside it.
      return solid(ell(cx, cy, rx, ry)) + `<path d="${ell(cx, cy, rx * 0.82, ry * 0.82)}" fill="${lighten(fill, 0.14)}" stroke="rgba(0,0,0,0.12)" stroke-width="2"/>`
    case 'baton':
      return solid(rrect(cx, cy, rx, ry, Math.min(rx, ry) * 0.92)) + sheen(0.55)
    case 'disc':
      return solid(ell(cx, cy, rx, ry)) + sheen(0.62)
    case 'liquid':
      // No dark outline: a pool of soup has a surface, not an edge.
      return `<path d="${ell(cx, cy, rx, ry)}" fill="${fill}" stroke="rgba(0,0,0,0.07)" stroke-width="2"/>` +
        `<path d="${ell(cx - rx * 0.2, cy - ry * 0.24, rx * 0.42, ry * 0.34)}" fill="${lighten(fill, 0.2)}" opacity="0.5"/>`
    case 'pillow': {
      // A crimped edge: the seal around a raviolo, as a row of bumps.
      const bumps: string[] = []
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        bumps.push(ell(cx + Math.cos(a) * rx * 0.94, cy + Math.sin(a) * ry * 0.94, rx * 0.11, ry * 0.11))
      }
      return bumps.map(solid).join('') + solid(rrect(cx, cy, rx * 0.95, ry * 0.95, Math.min(rx, ry) * 0.45)) + sheen(0.5)
    }
    case 'nest': {
      // Coils drawn as arcs over the mound. Nothing else on a plate looks like
      // a spiral, so this is the whole of what makes a nest read as pasta.
      const coils: string[] = []
      for (let k = 1; k <= 4; k++) {
        const f = k / 4.6
        coils.push(
          `<path d="${ell(cx + rx * 0.06 * (k % 2 ? 1 : -1), cy, rx * f, ry * f)}" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="${Math.max(2, rx * 0.045)}"/>`,
        )
      }
      return solid(blob(cx, cy, rx, ry, rand, 15)) + coils.join('')
    }
    case 'tubes':
      return many(pieces(cx, cy, rx, ry, rand, 11, 0.3), (x, y, t) => {
        const a = t * 180
        return `<g transform="rotate(${n1(a)} ${n1(x)} ${n1(y)})">${solid(rrect(x, y, rx * 0.3, ry * 0.13, ry * 0.12))}</g>`
      })
    case 'fries':
      // Longer and thinner than the short-pasta heap, and every piece at its own
      // angle: a handful thrown down, not a stack of matches.
      return many(pieces(cx, cy, rx, ry, rand, 13, 0.36), (x, y, t) => {
        const d = rrect(x, y, rx * 0.36, ry * 0.08, ry * 0.08)
        return `<g transform="rotate(${n1(t * 180)} ${n1(x)} ${n1(y)})">${solid(d)}</g>`
      })
    case 'pile':
      return many(pieces(cx, cy, rx, ry, rand, 12, 0.34), (x, y, t) =>
        solid(ell(x, y, rx * (0.22 + t * 0.06), ry * (0.19 + t * 0.05))),
      )
    case 'grains': {
      // A scoop, with the grains on it -- not sixty grains spilled on the plate.
      // The model builds one domed mass and embosses the grains into it, and a
      // picture of loose grains beside a model of a scoop is two dishes.
      const grains = many(pieces(cx, cy, rx * 0.94, ry * 0.94, rand, 42, 0.1), (x, y, t) => {
        const d = ell(x, y, rx * 0.085, ry * 0.042)
        return `<g transform="rotate(${n1(t * 180)} ${n1(x)} ${n1(y)})"><path d="${d}" fill="${lighten(fill, 0.22)}" stroke="rgba(0,0,0,0.13)" stroke-width="1.5"/></g>`
      })
      return solid(blob(cx, cy, rx, ry, rand, 19)) + grains
    }
    case 'heap':
      // Round things piled up: more of them, and rounder, than the pieces of a pasta heap.
      return many(pieces(cx, cy, rx, ry, rand, 16, 0.3), (x, y, t) => solid(ell(x, y, rx * (0.13 + t * 0.03), ry * (0.13 + t * 0.03))))
    case 'seed':
      return many(pieces(cx, cy, rx, ry, rand, 7, 0.4), (x, y, t) =>
        solid(ell(x, y, rx * (0.26 + t * 0.1), ry * (0.22 + t * 0.08))),
      )
    case 'crumb':
      // More pieces and smaller ones than a scatter of seeds, to match the
      // twenty-odd the model builds: seven big lumps is a handful of pebbles,
      // and a spoonful of praline is neither seven of anything nor smooth.
      return many(pieces(cx, cy, rx, ry, rand, 20, 0.18), (x, y, t) =>
        `<g transform="rotate(${n1(t * 180)} ${n1(x)} ${n1(y)})">${solid(
          rrect(x, y, rx * (0.1 + t * 0.07), ry * (0.07 + t * 0.05), rx * 0.03),
        )}</g>`,
      )
    case 'sprig': {
      // A stem with leaflets off it, not a lump. The model has built sprigs
      // properly for a while; the picture was still drawing the default blob,
      // so every plate finished with chervil showed a green pebble here and a
      // sprig of herb there.
      const stem =
        `<path d="M ${n1(cx - rx * 0.95)} ${n1(cy + ry * 0.5)} Q ${n1(cx)} ${n1(cy + ry * 0.1)} ${n1(cx + rx * 0.9)} ${n1(cy - ry * 0.55)}" ` +
        `fill="none" stroke="${fill}" stroke-width="${Math.max(1.5, ry * 0.16)}" stroke-linecap="round"/>`
      const leaflets: string[] = []
      for (let i = 0; i < 5; i++) {
        const t = 0.25 + 0.75 * (i / 4)
        const x = cx - rx * 0.95 + rx * 1.85 * t
        const y = cy + ry * 0.5 - ry * 1.05 * t
        const side = i % 2 ? 1 : -1
        const a = side * 42 + (t - 0.5) * 20
        leaflets.push(
          `<g transform="rotate(${n1(a)} ${n1(x)} ${n1(y)})">${solid(lens(x, y, rx * 0.34, ry * 0.2))}</g>`,
        )
      }
      return stem + leaflets.join('')
    }
    case 'cap': {
      // A mushroom seen from the side of the plate: a cap that overhangs, and
      // the stalk showing beneath it. The overhang is the whole read -- drawn as
      // a plain dome it is a bread roll, which is what it used to be.
      const stalk = `<path d="${rrect(cx, cy + ry * 0.48, rx * 0.2, ry * 0.5, rx * 0.1)}" fill="${lighten(fill, 0.26)}" stroke="rgba(0,0,0,0.16)" stroke-width="2"/>`
      const gills = `<path d="${ell(cx, cy + ry * 0.06, rx * 0.9, ry * 0.2)}" fill="rgba(0,0,0,0.2)"/>`
      const dome =
        `M ${n1(cx - rx)} ${n1(cy + ry * 0.06)} Q ${n1(cx - rx * 0.92)} ${n1(cy - ry * 0.95)} ${n1(cx)} ${n1(cy - ry * 0.95)}` +
        ` Q ${n1(cx + rx * 0.92)} ${n1(cy - ry * 0.95)} ${n1(cx + rx)} ${n1(cy + ry * 0.06)}` +
        ` Q ${n1(cx)} ${n1(cy + ry * 0.34)} ${n1(cx - rx)} ${n1(cy + ry * 0.06)} Z`
      return stalk + gills + solid(dome) + sheen(0.44)
    }
    case 'shard': {
      // Leaning, snapped at the edges and thin enough to see the light through.
      // A crisp drawn flat and round is a coaster.
      const pts: string[] = []
      const steps = 9
      for (const side of [1, -1]) {
        for (let i = 0; i <= steps; i++) {
          const u = side > 0 ? i / steps : 1 - i / steps
          const half = rx * (0.95 - 0.46 * Math.pow(u, 1.3)) * (0.9 + rand() * 0.2)
          pts.push(`${n1(cx + side * half)},${n1(cy + ry - u * ry * 2)}`)
        }
      }
      const d = `M ${pts[0]} ${pts.slice(1).map((p) => `L ${p}`).join(' ')} Z`
      return (
        `<path d="${d}" fill="${fill}" stroke="rgba(0,0,0,0.2)" stroke-width="2" opacity="0.94"/>` +
        `<path d="${d}" fill="${lighten(fill, 0.3)}" opacity="0.28" transform="translate(${n1(rx * 0.1)} ${n1(-ry * 0.06)})"/>`
      )
    }
    case 'dust': {
      // No outline and no body: a veil with a torn edge and a few specks that
      // carried past it. Anything with a hard edge here reads as a coaster of
      // cocoa rather than as something thrown over the top.
      const veil = `<path d="${blob(cx, cy, rx, ry, rand, 23)}" fill="${fill}" opacity="0.62"/>`
      const specks = many(pieces(cx, cy, rx * 1.3, ry * 1.3, rand, 16, 0.02), (x, y, t) =>
        `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(Math.max(1, rx * (0.02 + t * 0.025)))}" fill="${fill}" opacity="0.7"/>`,
      )
      return veil + specks
    }
    case 'whole': {
      // Whole and uncarved: domed along the back, tapering to one end, with the
      // legs at the other. Nothing else on the plate has this outline, and
      // nothing else on the plate is this big.
      const body =
        `M ${n1(cx - rx)} ${n1(cy + ry * 0.1)} Q ${n1(cx - rx * 0.72)} ${n1(cy - ry * 0.8)} ${n1(cx - rx * 0.1)} ${n1(cy - ry * 0.95)}` +
        ` Q ${n1(cx + rx * 0.62)} ${n1(cy - ry * 0.98)} ${n1(cx + rx * 0.98)} ${n1(cy - ry * 0.1)}` +
        ` Q ${n1(cx + rx * 1.02)} ${n1(cy + ry * 0.72)} ${n1(cx + rx * 0.3)} ${n1(cy + ry * 0.92)}` +
        ` Q ${n1(cx - rx * 0.6)} ${n1(cy + ry * 0.95)} ${n1(cx - rx)} ${n1(cy + ry * 0.1)} Z`
      const legs = [0.42, 0.72]
        .map((t) => solid(ell(cx + rx * t, cy + ry * 0.66, rx * 0.26, ry * 0.3)))
        .join('')
      return solid(body) + legs + sheen(0.5)
    }
    case 'shell': {
      // A fan hinged at one end, with the ribs showing.
      const fan =
        `M ${n1(cx - rx)} ${n1(cy)} Q ${n1(cx - rx * 0.1)} ${n1(cy - ry * 1.25)} ${n1(cx + rx)} ${n1(cy - ry * 0.5)}` +
        ` Q ${n1(cx + rx * 1.05)} ${n1(cy)} ${n1(cx + rx)} ${n1(cy + ry * 0.5)}` +
        ` Q ${n1(cx - rx * 0.1)} ${n1(cy + ry * 1.25)} ${n1(cx - rx)} ${n1(cy)} Z`
      const ribs: string[] = []
      for (let i = -2; i <= 2; i++) {
        ribs.push(
          `<path d="M ${n1(cx - rx * 0.86)} ${n1(cy)} Q ${n1(cx)} ${n1(cy + ry * i * 0.3)} ${n1(cx + rx * 0.92)} ${n1(cy + ry * i * 0.42)}" fill="none" stroke="rgba(0,0,0,0.17)" stroke-width="2"/>`,
        )
      }
      return solid(fan) + ribs.join('')
    }
    case 'folded':
      // Seen from above a taco is a rounded oblong with its fold down the middle.
      return (
        solid(rrect(cx, cy, rx, ry, Math.min(rx, ry) * 0.5)) +
        `<path d="M ${n1(cx - rx * 0.8)} ${n1(cy)} L ${n1(cx + rx * 0.8)} ${n1(cy)}" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="3"/>`
      )
    case 'wedge': {
      // A sector: two straight cuts from the point, closed by the arc of
      // whatever it was cut out of. The only straight edges on the plate.
      const spread = 0.62
      const [x0, y0] = [cx - rx * 0.92, cy]
      const [x1, y1] = [cx + rx * 0.95, cy - ry * spread]
      const [x2, y2] = [cx + rx * 0.95, cy + ry * spread]
      const d =
        `M ${n1(x0)} ${n1(y0)} L ${n1(x1)} ${n1(y1)}` +
        ` Q ${n1(cx + rx * 1.24)} ${n1(cy)} ${n1(x2)} ${n1(y2)} Z`
      return solid(d) + sheen(0.44)
    }
    case 'pod': {
      // Seen from above: a long lens with the peas showing through it.
      const peas: string[] = []
      for (let i = 0; i < 4; i++)
        peas.push(ell(cx + (i / 3 - 0.5) * rx * 1.3, cy, Math.min(rx * 0.14, ry * 0.8), ry * 0.52))
      return (
        solid(lens(cx, cy, rx, ry)) +
        peas.map((d) => `<path d="${d}" fill="${lighten(fill, 0.18)}" opacity="0.7"/>`).join('')
      )
    }
    case 'stack': {
      // From above a sandwich is a rounded triangle, and the filling shows as a
      // rim of something else all the way round the cut edge -- which from
      // directly overhead is the only part of the layers you can see at all.
      const tri = (r: number) =>
        `M ${n1(cx - rx * r)} ${n1(cy + ry * 0.74 * r)}` +
        ` Q ${n1(cx - rx * 1.06 * r)} ${n1(cy + ry * 0.92 * r)} ${n1(cx - rx * 0.78 * r)} ${n1(cy - ry * 0.5 * r)}` +
        ` Q ${n1(cx - rx * 0.62 * r)} ${n1(cy - ry * 1.02 * r)} ${n1(cx + rx * 0.26 * r)} ${n1(cy - ry * 0.66 * r)}` +
        ` Q ${n1(cx + rx * 1.04 * r)} ${n1(cy - ry * 0.26 * r)} ${n1(cx + rx * 0.72 * r)} ${n1(cy + ry * 0.58 * r)}` +
        ` Q ${n1(cx + rx * 0.5 * r)} ${n1(cy + ry * 0.94 * r)} ${n1(cx - rx * r)} ${n1(cy + ry * 0.74 * r)} Z`
      return (
        `<path d="${tri(1.04)}" fill="${shadeHex(fill, 0.74)}" stroke="rgba(0,0,0,0.16)" stroke-width="2"/>` +
        solid(tri(0.9)) +
        sheen(0.4)
      )
    }
    case 'ring': {
      // Drawn as one path with the hole punched out of it, so the plate shows
      // through: the hole is the whole reason a ring is not a patty.
      const d = `${ell(cx, cy, rx, ry)} ${ell(cx, cy, rx * 0.42, ry * 0.42)}`
      return `<path d="${d}" fill-rule="evenodd" fill="${fill}" stroke="rgba(0,0,0,0.16)" stroke-width="2"/>`
    }
    case 'skewer': {
      // The stick runs the length of the element and pokes out at both ends;
      // the chunks sit along it.
      const stick =
        `<path d="M ${n1(cx - rx * 1.06)} ${n1(cy)} L ${n1(cx + rx * 1.06)} ${n1(cy)}" ` +
        `fill="none" stroke="rgba(90,68,44,0.9)" stroke-width="${Math.max(2, ry * 0.22)}" stroke-linecap="round"/>`
      const chunks: string[] = []
      for (let i = 0; i < 4; i++) {
        const x = cx + (i / 3 - 0.5) * rx * 1.44
        chunks.push(solid(rrect(x, cy, rx * 0.2, ry * 0.92, Math.min(rx * 0.2, ry) * 0.42)))
      }
      return stick + chunks.join('')
    }
    case 'ruffle':
      // More points and a wider jitter than a lump: a loose pile of leaves.
      return solid(blob(cx, cy, rx, ry, rand, 17)) + sheen(0.5)
    case 'ball':
    case 'dome':
    case 'bunBase':
    case 'patty':
      // Round things stay round. A jittered polygon made a bun look chewed.
      return solid(ell(cx, cy, rx, ry)) + sheen(0.58)
    default:
      return solid(blob(cx, cy, rx, ry, rand)) + sheen(0.6)
  }
}

export function renderSvg(req: GenerateRequest): string {
  const { dish, spec, angle } = req
  const l = layout(dish, spec)
  const elev = elevations(l, spec)
  const rand = rng(spec.seed ^ 0x9e3779b9)

  const S = 1000
  const R = l.plate.radius * S
  const cy = S / 2
  const squash = SQUASH[angle]
  const lift = LIFT[angle]

  // Frame coordinates plus a height in plate-radius units, projected to screen.
  const px = (x: number) => x * S
  const py = (y: number, h = 0) => cy + (y * S - cy) * squash - h * R * lift

  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`)
  out.push(
    `<ellipse cx="${S / 2}" cy="${cy + R * 0.1 * squash}" rx="${R * 1.06}" ry="${R * 1.02 * squash}" fill="rgba(0,0,0,0.09)"/>`,
  )

  if (l.plate.shape === 'circle') {
    out.push(
      `<ellipse cx="${S / 2}" cy="${cy}" rx="${R}" ry="${R * squash}" fill="${l.plate.face}" stroke="${l.plate.rim}" stroke-width="${l.plate.rimWidth * S}"/>`,
    )
  } else {
    const side = R * 1.78
    const h = side * squash
    const rx = l.plate.shape === 'board' ? 26 : 12
    out.push(
      `<rect x="${S / 2 - side / 2}" y="${cy - h / 2}" width="${side}" height="${h}" rx="${rx}" fill="${l.plate.face}" stroke="${l.plate.rim}" stroke-width="${l.plate.rimWidth * S}"/>`,
    )
  }

  // Sauce sits flat on the plate, so one group transform flattens marks and the
  // drizzle stroke together without projecting each point by hand.
  // Ketchup is not the same colour as hollandaise. Take the sauce's colour from
  // the component the chef actually named.
  const sauceName = dish.components.find((c) => c.role === 'sauce')?.name ?? ''
  const sauceColor = sauceName
    ? resolveHex(sauceName, 'sauce', spec.tweaks?.[SAUCE_KEY]?.c)
    : hslCss(SAUCE_HSL)
  out.push(`<g transform="translate(0 ${cy}) scale(1 ${squash}) translate(0 ${-cy})">`)
  // Marks the layout ladled onto something are held back and drawn after it,
  // or the sauce ends up underneath the food it was spooned over.
  const ladled = l.sauce.marks.filter((m) => m.over)
  for (const m of l.sauce.marks.filter((m) => !m.over)) {
    out.push(
      `<ellipse cx="${m.x * S}" cy="${m.y * S}" rx="${m.rx * S}" ry="${m.ry * S}" fill="${sauceColor}" opacity="0.85" transform="rotate(${m.rot} ${m.x * S} ${m.y * S})"/>`,
    )
  }
  if (l.sauce.path) {
    const scaled = l.sauce.path.replace(/([\d.]+) ([\d.]+)/g, (_, a, b) => `${(+a * S).toFixed(1)} ${(+b * S).toFixed(1)}`)
    out.push(
      `<path d="${scaled}" fill="none" stroke="${sauceColor}" stroke-width="${R * 0.075}" stroke-linecap="round" opacity="0.88"/>`,
    )
  }
  // Sauce painted with the brush: a filled, tapered ribbon, the same shape the 3D model sweeps.
  for (const stroke of l.sauce.strokes.filter((s) => s.free && s.outline)) {
    const scaled = stroke.outline.replace(/([\d.]+) ([\d.]+)/g, (_, a, b) => `${(+a * S).toFixed(1)} ${(+b * S).toFixed(1)}`)
    out.push(`<path d="${scaled}" fill="${sauceColor}" stroke="${sauceColor}" stroke-width="${(R * 0.01).toFixed(1)}" stroke-linejoin="round" opacity="0.88"/>`)
  }
  out.push(`</g>`)

  // Painter's algorithm: furthest back first, and for equal depth the lower
  // element first so garnish sits on top of what it is resting on. A liquid goes
  // down before any of it, since everything else in the dish is served in it.
  const form = (el: PlacedElement) => familyFor(el.name, el.role, spec.tweaks?.[el.key]?.v)
  const ordered = [...l.elements].sort(
    (a, b) =>
      Number(form(a) !== 'liquid') - Number(form(b) !== 'liquid') ||
      a.y - b.y ||
      (elev.get(a.key)?.y ?? 0) - (elev.get(b.key)?.y ?? 0),
  )

  for (const el of ordered) {
    const e = elev.get(el.key)
    if (!e) continue
    const family = form(el)
    const cxp = px(el.x)
    const cyp = py(el.y, e.y)
    const rx = e.rx * R
    // A pool is as wide as it is long; everything else shows its height as the
    // camera comes down off the top-down view.
    const ry = (family === 'liquid' ? e.rz * squash : e.ry * lift + e.rz * squash) * R

    const base = resolveHex(el.name, el.role, spec.tweaks?.[el.key]?.c)
    if (family === 'glass') {
      // Upright, so not turned with the rest of the plate: a glass has no front to turn.
      out.push(glassSvg(cxp, cyp, rx, e.rz * squash * R, e.ry * lift * R, base))
      continue
    }
    const spin = el.rotation + (spec.tweaks?.[el.key]?.r ?? 0)
    out.push(`<g transform="rotate(${spin.toFixed(1)} ${cxp} ${cyp})">`)
    out.push(elementSvg(family, cxp, cyp, rx, ry, base, rand))
    out.push(`</g>`)

    for (const m of ladled.filter((s) => s.over === el.key)) {
      out.push(
        `<ellipse cx="${(m.x * S).toFixed(1)}" cy="${py(m.y, e.y + e.ry * 0.72).toFixed(1)}" rx="${(m.rx * S).toFixed(1)}" ry="${(m.ry * S * squash).toFixed(1)}" fill="${sauceColor}" opacity="0.92" transform="rotate(${m.rot} ${(m.x * S).toFixed(1)} ${py(m.y, e.y + e.ry * 0.72).toFixed(1)})"/>`,
      )
    }
  }

  out.push(`</svg>`)
  return out.join('')
}

// Draws the layout locally. No network call, no cost -- but it exercises the
// exact same layout engine that will drive the conditioning image for a paid model.
export const mockProvider: ImageProvider = {
  id: 'mock',
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const started = Date.now()
    const svg = renderSvg(req)
    return {
      svg,
      image: null,
      costUsd: PRICING.mock.usdPerImage,
      latencyMs: Date.now() - started,
    }
  },
}
