import type { Component, Dish, PlatingSpec } from '../../types'
import { familyFor } from '../../shapes'

import { anchors, buildsAsStack, defaultCopies, isBase, stackPoints } from './anchors'
import { PLATE_GEOMETRY, plateWellRadius } from './plates'
import { rng } from './random'
import { sauceLayout } from './sauce'
import { clampToPlate, footprint, separate } from './separation'
import type { Layout, PlacedElement, SauceLayout } from './types'

export const HEIGHT_SCALE = { flat: 0.92, low: 1.0, medium: 1.12, tall: 1.28 } as const

export const GARNISH_COUNT = { minimal: 2, moderate: 4, generous: 8 } as const

export function layout(dish: Dish, spec: PlatingSpec): Layout {
  const rand = rng(spec.seed)
  const plate = PLATE_GEOMETRY[spec.plate]
  const hScale = HEIGHT_SCALE[spec.height]

  // An unnamed component cannot be described in a prompt or on a spec card, and
  // the Add button creates one every time it is pressed. Drop them rather than
  // plating a nameless blob and listing it as "" in the placement.
  const named = dish.components.filter((c) => c.name.trim().length > 0)
  const solids = named.filter((c) => c.role !== 'sauce' && c.role !== 'garnish')
  const garnishes = named.filter((c) => c.role === 'garnish')
  // Each component appears once plus however many copies the chef asked for.
  const copies = spec.copies ?? {}
  const ordered: Array<{ c: Component; n: number }> = []
  const building = buildsAsStack(dish, spec)
  for (const c of solids) {
    const extra = Math.max(0, Math.min(5, Math.floor(copies[c.id] ?? defaultCopies(c.name, c.role, building))))
    for (let n = 0; n <= extra; n++) ordered.push({ c, n })
  }

  const stacked = buildsAsStack(dish, spec)
  const count = Math.max(1, ordered.length)
  const laidOut = anchors(spec.composition, count, rand)
  // An assembly still answers to the composition -- it just answers with where
  // the whole build stands, taking the seat the hero would have had.
  const pts = stacked && spec.composition !== 'stacked-tall' ? stackPoints(count, rand, laidOut[0]) : laidOut

  // A dish served on something: the base takes the seat, everything else goes on
  // top of it rather than next to it. Checked after the stack, because a bun is
  // both -- and a burger is a stack, not a topped base.
  const baseAt = stacked ? -1 : ordered.findIndex(({ c }) => isBase(c.name, c.role))
  if (baseAt >= 0 && ordered.length > 1) {
    const seat = pts[baseAt] ?? { x: 0, y: 0, s: 1 }
    let n = 0
    for (let i = 0; i < pts.length; i++) {
      if (i === baseAt) {
        pts[i] = { ...seat, s: 1 }
        continue
      }
      // Spread over the face of the base on a turned circle, so two toppings
      // never land on top of each other and none of them slides off the edge.
      const a = n * 2.39996 + rand() * 0.5
      const r = 0.17 + 0.13 * Math.sqrt((n + 1) / Math.max(1, pts.length - 1))
      pts[i] = { x: seat.x + Math.cos(a) * r, y: seat.y + Math.sin(a) * r * 0.9, s: 0.46 }
      n++
    }
  }
  const elements: PlacedElement[] = ordered.map(({ c, n }, i) => {
    const p = pts[i] ?? pts[pts.length - 1] ?? { x: 0, y: 0, s: 0.7 }
    return {
      // Keyed by component and copy number, never by position. A position-based
      // key silently detached every tweak and drag the moment the chef reordered
      // the component list.
      key: `${c.id}:${n}`,
      componentId: c.id,
      name: c.name,
      role: c.role,
      x: 0.5 + p.x * plate.radius,
      y: 0.5 + p.y * plate.radius,
      scale: p.s * hScale,
      rotation: (rand() - 0.5) * 22,
      z: 10 + i,
    }
  })

  // Hidden elements are removed before anything else runs, so sauce placement,
  // separation, the prompt and the spec card all agree they are not on the plate.
  const visible = elements.filter((e) => !spec.tweaks?.[e.key]?.hidden)
  elements.length = 0
  elements.push(...visible)

  // A stack is supposed to overlap seen from above -- that is what a stack is.
  // Every other composition spreads across the plate and must not pile up.
  // Food can lean a little way up a shallow wall, but must not perch on a rim.
  const reach = Math.max(plateWellRadius(spec.plate), 0.7)
  const baseKey = baseAt >= 0 && ordered.length > 1 ? `${ordered[baseAt].c.id}:${ordered[baseAt].n}` : null
  // Neither a build nor a topped base may be pulled apart by the separation
  // pass: on both of them the overlap IS the dish.
  if (!stacked && !baseKey) separate(elements, plate.radius, reach)
  else {
    // A build has to stay on the plate as a whole. The composition seats are
    // sized for one component among several; a five-layer burger sat at the end
    // of a linear run hangs over the edge of the slate.
    const solidsOut = elements.filter((e) => e.role !== 'garnish')
    if (solidsOut.length) {
      const cx = solidsOut.reduce((a, e) => a + e.x, 0) / solidsOut.length
      const cy = solidsOut.reduce((a, e) => a + e.y, 0) / solidsOut.length
      const pad = Math.max(...solidsOut.map((e) => footprint(e, plate.radius)))
      const d = Math.hypot(cx - 0.5, cy - 0.5)
      // A board or a slate is a rectangle inscribed differently from the circle
      // `reach` describes: measuring a build against the radius walks it off the
      // corner. A margin on top of the footprint keeps it ON the board rather
      // than balanced on the edge of it.
      const room = plate.shape === 'circle' ? reach : reach * 0.82
      const max = Math.max(0, plate.radius * room - pad * 1.2)
      if (d > max) {
        // The build moves as one piece, keeping the way it is arranged. Pulling every position towards the middle by a
        // factor instead squeezed the arrangement itself: a pizza is bigger than the room it is allowed, the factor
        // reached zero, and every topping landed on one spot.
        const k = max / d
        const dx = (cx - 0.5) * (k - 1)
        const dy = (cy - 0.5) * (k - 1)
        for (const e of elements) {
          e.x += dx
          e.y += dy
        }
      }
    }
  }

  // Garnish is scattered over and around the hero, count driven by density.
  // Placed after separation so it follows the hero's final position.
  const garnishTotal = GARNISH_COUNT[spec.garnish]
  // Garnish normally sits over the hero. On a stack that means the crown, not
  // the bottom layer: anchoring to the first component buried every sesame seed
  // on a burger inside the base bun.
  const stack = stacked
  const hero = stack ? elements[elements.length - 1] : elements[0]
  // With nothing to sit on it used to be dropped silently, leaving a prompt that
  // promised herbs over an empty plate, so it scatters across the plate instead.
  const anchor = hero ?? { x: 0.5, y: 0.5 }
  const spread = hero ? (stack ? 0.2 : 0.34) : 0.62
  const inset = hero && stack ? 0.02 : 0.12
  if (garnishes.length > 0) {
    for (let i = 0; i < garnishTotal; i++) {
      const src = garnishes[i % garnishes.length]
      const a = rand() * Math.PI * 2
      const r = plate.radius * (inset + rand() * spread)
      elements.push({
        key: `${src.id}:g${i}`,
        componentId: src.id,
        name: src.name,
        role: 'garnish',
        x: anchor.x + Math.cos(a) * r,
        y: anchor.y + Math.sin(a) * r * 0.8,
        scale: 0.20 + rand() * 0.12,
        rotation: rand() * 360,
        z: 40 + i,
      })
      clampToPlate(elements[elements.length - 1], plate.radius, reach)
    }
  }

  // A garnish piece the chef took off stays off. It is dropped only now, after every one has been placed, so the
  // random numbers the others were laid out with are not disturbed by taking one away.
  for (let i = elements.length - 1; i >= 0; i--) {
    if (spec.tweaks?.[elements[i].key]?.hidden) elements.splice(i, 1)
  }

  // Drag nudges are applied last, on top of the composition preset. Because they
  // live on the spec rather than on a rendered image, re-rendering is idempotent:
  // the same spec always produces the same plate, however many edits preceded it.
  const overrides = spec.overrides ?? {}
  for (const el of elements) {
    const o = overrides[el.key]
    if (o) {
      el.x = Math.min(0.94, Math.max(0.06, o.x))
      el.y = Math.min(0.94, Math.max(0.06, o.y))
    }
  }

  // A liquid is not placed, it is poured: whatever the composition did with it,
  // it ends up level and centred in the vessel, and everything else is served
  // in it. Doing this here rather than in each renderer keeps the picture and
  // the model holding the same soup.
  for (const el of elements) {
    if (familyFor(el.name, el.role, spec.tweaks?.[el.key]?.v) === 'liquid') {
      el.x = 0.5
      el.y = 0.5
    }
  }

  // Ice goes in the glass, not beside it.
  const glassEl = elements.find((el) => familyFor(el.name, el.role, spec.tweaks?.[el.key]?.v) === 'glass')
  if (glassEl) {
    for (const el of elements) {
      if (el !== glassEl && el.role !== 'garnish' && /\bice\b/i.test(el.name)) {
        el.x = glassEl.x
        el.y = glassEl.y
      }
    }
  }

  // A dish with no sauce in it gets no sauce on the plate. The style still rides
  // on the spec -- it is one of the ten things a spread varies -- but inventing a
  // red pool under a mushroom risotto puts an ingredient on the plate that the
  // chef never listed, which is the one thing a review render must not do.
  // Sauce the chef painted by hand is the exception: they put it there, so it stays, even on a dish whose list has no
  // sauce in it, and the style that would have been laid out is simply not used.
  const hasSauce = dish.components.some((c) => c.role === 'sauce')
  const painted = (spec.brush?.length ?? 0) > 0
  const sauce: SauceLayout =
    hasSauce || painted
      ? sauceLayout(hasSauce ? spec.sauce : 'none', plate.radius, spec.plate, elements, rand, spec)
      : { style: spec.sauce, marks: [], path: null, samples: [], strokes: [], anchor: { x: 0.5, y: 0.5 } }
  return { plate, elements, sauce, stacked, baseKey }
}
