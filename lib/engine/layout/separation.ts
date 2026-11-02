import { shapeFor, shapeMetrics } from '../../shapes'

import type { PlacedElement } from './types'

// An element's footprint on the plate, in frame units. Kept here so the layout,
// the renderers and the separation pass all agree on how big a thing is.
export function footprint(el: PlacedElement, plateRadius: number) {
  // Spread is part of the shape: a baton of leek reaches further across the
  // plate than a quenelle of the same nominal size, and separation has to know.
  const { widthMul } = shapeMetrics(shapeFor(el.name, el.role))
  return (el.role === 'garnish' ? 0.16 : 0.3) * el.scale * widthMul * plateRadius
}

export const KISS = 0.86

// components may touch; they must not bury each other
export const RIM_INSET = 0.72

// how much of a footprint may hang past the rim

export function clampToPlate(el: PlacedElement, plateRadius: number, reach = 1) {
  const r = footprint(el, plateRadius)
  const dx = el.x - 0.5
  const dy = el.y - 0.5
  const d = Math.hypot(dx, dy)
  const max = Math.max(0, plateRadius * reach - r * RIM_INSET)
  if (d > max && d > 1e-6) {
    el.x = 0.5 + (dx / d) * max
    el.y = 0.5 + (dy / d) * max
  }
}

// The composition anchors are fixed offsets that take no account of how big each
// component is, so three items could land 60% buried in one another. Relaxing
// them apart by their real radii fixes every composition at once, rather than
// hand-tuning each preset. Deterministic, so a spec still renders identically.
export function separate(elements: PlacedElement[], plateRadius: number, reach: number, passes = 16) {
  const solids = elements.filter((e) => e.role !== 'garnish')
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i]
        const b = solids[j]
        const want = (footprint(a, plateRadius) + footprint(b, plateRadius)) * KISS
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d >= want) continue
        // Exactly coincident points have no direction to separate along.
        if (d < 1e-6) {
          dx = 1e-3
          dy = 0
          d = 1e-3
        }
        const push = (want - d) / 2
        a.x -= (dx / d) * push
        a.y -= (dy / d) * push
        b.x += (dx / d) * push
        b.y += (dy / d) * push
      }
    }
    for (const el of solids) clampToPlate(el, plateRadius, reach)
  }
}
