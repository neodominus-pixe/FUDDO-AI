import type { PlateStyle, PlatingSpec, SauceStyle } from '../../types'
import { SAUCED_ON_TOP, familyFor } from '../../shapes'

import { isBase } from './anchors'
import { plateWellRadius } from './plates'
import { footprint } from './separation'
import { MAX_STROKES, resample, ribbonOutline, smoothPath, type Pt } from './brush'
import type { PlacedElement, SauceLayout, SauceMark, SauceStroke } from './types'

// Where the food actually ended up. Sauce is placed in relation to this rather
// than at a fixed spot on the plate -- otherwise a prompt that promises "pooled
// underneath the food" renders a pool sitting well clear of it.
export function foodSpan(elements: PlacedElement[], radius: number) {
  const solids = elements.filter((e) => e.role !== 'garnish')
  if (solids.length === 0) return { cx: 0.5, cy: 0.5, extent: radius * 0.35 }
  const cx = solids.reduce((a, e) => a + e.x, 0) / solids.length
  const cy = solids.reduce((a, e) => a + e.y, 0) / solids.length
  const extent = Math.max(
    radius * 0.22,
    ...solids.map((e) => Math.hypot(e.x - cx, e.y - cy) + footprint(e, radius)),
  )
  return { cx, cy, extent }
}

export function sauceLayout(
  style: SauceStyle,
  radius: number,
  plateStyle: PlateStyle,
  elements: PlacedElement[],
  rand: () => number,
  spec: PlatingSpec,
): SauceLayout {
  const marks: SauceMark[] = []
  let samples: SauceMark[] = []
  // The drizzle's bezier, kept as points rather than as a path string until the
  // chef's own adjustments have been applied to it.
  let curve: Array<[number, number]> | null = null
  const { cx, cy, extent } = foodSpan(elements, radius)
  // Pasta, rice and anything else served in a heap takes its sauce on top -- and
  // so does anything with a base, because the sauce on a pizza goes on the
  // pizza. A pool of tomato under the crust is not a margherita.
  const sauceable = elements.filter(
    (e) => SAUCED_ON_TOP.has(familyFor(e.name, e.role)) || isBase(e.name, e.role),
  )
  const ladle = (m: SauceMark): SauceMark => {
    const hit = sauceable.find((e) => Math.hypot(m.x - e.x, m.y - e.y) < 0.3 * e.scale * radius * 2.6)
    if (!hit) return m
    // On a base it is spread to the edges -- that is what saucing a pizza is.
    // On a heap it is a spoonful in the middle, not a coat of paint.
    // The edge is where the deck meets the crust: about 0.78 of the way out on the pizza (public/models/pizza.glb).
    // Any wider and the run the pool takes on one side comes out through the crust wall.
    if (isBase(hit.name, hit.role)) {
      const across = footprint(hit, radius) * 0.76
      return { ...m, over: hit.key, x: hit.x, y: hit.y, rx: across, ry: across * 0.92 }
    }
    return { ...m, over: hit.key, rx: m.rx * 0.56, ry: m.ry * 0.56 }
  }
  // Sauce lives inside the well, which on a bowl is much tighter than the rim.
  const wellR = radius * plateWellRadius(plateStyle)

  const onPlate = (x: number, y: number, pad: number): [number, number] => {
    const dx = x - 0.5
    const dy = y - 0.5
    const d = Math.hypot(dx, dy)
    const max = Math.max(0, wellR - pad)
    if (d <= max || d < 1e-6) return [x, y]
    return [0.5 + (dx / d) * max, 0.5 + (dy / d) * max]
  }

  switch (style) {
    case 'pooled': {
      // Place the centre first, then size the pool to the well that is left.
      // Padding the centre by half the radius let the far edge climb the rim.
      const [x, y] = onPlate(cx, cy + radius * 0.03, wellR * 0.25)
      const room = wellR - Math.hypot(x - 0.5, y - 0.5)
      // Capped against the well as well as against the food. Sized from the food
      // alone, a pool under a dish laid out in a line ran the length of the
      // board and read as a flood rather than as a sauce.
      const rx = Math.max(radius * 0.1, Math.min(extent * 1.1, room, radius * 0.55))
      marks.push({ x, y, rx, ry: rx * 0.68, rot: 0 })
      // A few spots thrown off the edge, as a sauce spoons out and settles: small, close, and never in the same place twice.
      for (let i = 0; i < 3; i++) {
        const a = rand() * Math.PI * 2
        const dist = 1.12 + rand() * 0.35
        const size = radius * (0.012 + rand() * 0.014)
        const [dx, dy] = onPlate(x + Math.cos(a) * rx * dist, y + Math.sin(a) * rx * 0.68 * dist, size * 1.5)
        marks.push({ x: dx, y: dy, rx: size, ry: size * 0.9, rot: 0 })
      }
      break
    }
    case 'dotted': {
      const n = 9
      const ring = Math.min(extent + radius * 0.18, wellR * 0.9)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.15
        const size = radius * (0.035 + rand() * 0.03)
        const [x, y] = onPlate(cx + Math.cos(a) * ring, cy + Math.sin(a) * ring * 0.86, size * 1.6)
        marks.push({ x, y, rx: size, ry: size, rot: 0 })
      }
      break
    }
    case 'drizzled': {
      const span = Math.min(extent * 1.5, wellR * 0.86)
      const [p0, p1, p2, p3] = (
        [
          [cx - span, cy + extent * 0.3],
          [cx - span * 0.3, cy - extent * 0.8],
          [cx + span * 0.35, cy + extent * 0.9],
          [cx + span, cy - extent * 0.25],
        ] as Array<[number, number]>
      ).map(([x, y]) => onPlate(x, y, radius * 0.1))
      const steps = 16
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const m = 1 - t
        const x = m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0]
        const y = m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]
        samples.push({ x, y, rx: radius * 0.05, ry: radius * 0.05, rot: 0 })
      }
      curve = [p0, p1, p2, p3]
      break
    }
    case 'smeared': {
      // A swipe that leads into the food rather than sitting apart from it.
      const [x, y] = onPlate(cx - extent * 0.4, cy + radius * 0.05, wellR * 0.25)
      const room = wellR - Math.hypot(x - 0.5, y - 0.5)
      const rx = Math.max(radius * 0.1, Math.min(extent * 1.05, room))
      marks.push({ x, y, rx, ry: rx * 0.3, rot: -14 })
      break
    }
    case 'aside': {
      // Deliberately clear of the food: set opposite the food's centre of mass,
      // so it can never end up hidden underneath a component.
      const size = radius * 0.16
      let dx = cx - 0.5
      let dy = cy - 0.5
      const d = Math.hypot(dx, dy)
      if (d < 1e-3) {
        // Food is centred, so there is no "away" -- fall back to the near right.
        dx = -0.55
        dy = -0.83
      } else {
        dx /= d
        dy /= d
      }
      const away = Math.min(wellR * 0.88, Math.max(radius * 0.5, extent + size * 1.9))
      const [x, y] = onPlate(cx - dx * away, cy - dy * away, size * 1.5)
      marks.push({ x, y, rx: size, ry: size * 0.62, rot: -28 })
      break
    }
    case 'none':
      break
  }
  // --- What the chef did to it ----------------------------------------------
  // Everything above is where the plating engine would put the sauce. This is
  // where the chef moved it: one offset, one scale and one turn, applied to the
  // sauce as a single piece rather than mark by mark -- nine dots are a pattern,
  // not nine decisions. Applied here rather than in a renderer, so the picture,
  // the model and the prompt all move together.
  // The sauce the style laid out: its marks, and its drizzle if it is one. This is what the chef's move, size and turn
  // apply to as a single piece. Painted strokes are not part of it: each is its own object, moved on its own.
  const placed = [...marks, ...samples]
  const anchor = placed.length
    ? {
        x: placed.reduce((a, m) => a + m.x, 0) / placed.length,
        y: placed.reduce((a, m) => a + m.y, 0) / placed.length,
      }
    : { x: 0.5, y: 0.5 }

  const t = spec.tweaks?.sauce ?? {}
  const to = spec.overrides?.sauce
  const grow = t.s ?? 1
  const turn = ((t.r ?? 0) * Math.PI) / 180
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)]
  const shiftX = to ? to.x - anchor.x : 0
  const shiftY = to ? to.y - anchor.y : 0

  // Laid out by the engine, a mark is kept clear of the rim by its own radius so
  // sauce never climbs the side. Moved by hand, that padding fights the chef --
  // drag a wide pool to the edge and it springs back to the middle -- so once
  // they have taken hold of it, only the centre is kept on the plate.
  const move = (x: number, y: number, pad: number): [number, number] => {
    const dx = (x - anchor.x) * grow
    const dy = (y - anchor.y) * grow
    return onPlate(
      anchor.x + shiftX + dx * cos - dy * sin,
      anchor.y + shiftY + dx * sin + dy * cos,
      to ? 0 : pad,
    )
  }
  const moveMark = (m: SauceMark): SauceMark => {
    const [x, y] = move(m.x, m.y, Math.max(m.rx, m.ry) * grow)
    return { ...m, x, y, rx: m.rx * grow, ry: m.ry * grow, rot: m.rot + (t.r ?? 0) }
  }

  const moved = marks.map(moveMark)
  samples = samples.map(moveMark)
  const strokes: SauceStroke[] = []
  if (samples.length > 1) strokes.push({ samples, width: 1, free: false, index: -1, path: '', outline: '' })

  // Sauce painted with the brush is in addition to the style, so a swoosh can be added to a pool or to no sauce at all.
  // Each stroke stands where it was drawn (kept on the plate), whatever the rest of the sauce does, so it can be picked
  // up and moved by itself. `index` is its place in spec.brush, which is what identifies it.
  ;(spec.brush ?? []).slice(0, MAX_STROKES).forEach((b, index) => {
    const line = resample(
      b.pts.map(([x, y]) => onPlate(x, y, 0) as Pt),
      radius * 0.045,
    )
    if (line.length < 2) return
    const size = radius * 0.05 * b.w
    strokes.push({
      samples: line.map(([x, y]) => ({ x, y, rx: size, ry: size, rot: 0 })),
      width: b.w,
      free: true,
      index,
      path: smoothPath(line),
      outline: ribbonOutline(line, size),
    })
  })
  const curveMoved = curve?.map(([x, y]) => move(x, y, radius * 0.1 * grow))
  const n2 = (v: number) => v.toFixed(4)

  // A base is sauced once. Every spot a pooled sauce throws off lands on the pizza too and is spread to its edges,
  // which stacked three more identical films on the first and they fought each other for the same pixels.
  const spread = new Set<string>()
  const ladled = moved.map(ladle).filter((m) => {
    const base = m.over ? sauceable.find((e) => e.key === m.over) : undefined
    if (!base || !isBase(base.name, base.role)) return true
    if (spread.has(base.key)) return false
    spread.add(base.key)
    return true
  })

  return {
    style,
    marks: ladled,
    samples,
    strokes,
    path: curveMoved
      ? `M ${n2(curveMoved[0][0])} ${n2(curveMoved[0][1])} C ${n2(curveMoved[1][0])} ${n2(curveMoved[1][1])}, ` +
        `${n2(curveMoved[2][0])} ${n2(curveMoved[2][1])}, ${n2(curveMoved[3][0])} ${n2(curveMoved[3][1])}`
      : null,
    // Reported where the sauce actually ended up, not where the drag let go, or
    // the handle drifts off the plate while the sauce stays on it.
    anchor: (([x, y]) => ({ x, y }))(onPlate(anchor.x + shiftX, anchor.y + shiftY, 0)),
  }
}
