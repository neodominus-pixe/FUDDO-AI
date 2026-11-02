import type { PlateStyle, PlatingSpec } from '../../types'
import { DECK_LEVEL, MELTS, familyFor, shapeMetrics, type ShapeFamily } from '../../shapes'

import { VERTICAL, liquidFill, plateSurfaceY } from './plates'
import { footprint } from './separation'
import type { Elevation, Layout, PlacedElement } from './types'

// How generously a plate is filled. A bowl is served heaped -- pasta and risotto
// ride up its walls rather than sitting in the little flat well at the bottom --
// so a portion measured against the rim of a plate looks lost in one.
export const PORTION: Partial<Record<PlateStyle, number>> = { 'deep-bowl': 1.6, 'shallow-bowl': 1.3 }

// A stable number per element key, for anything that should vary between
// repeats of the same component but never between renders of the same plate.
export function hashKey(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/**
 * How high a spoonful of sauce ladled over `over` sits. Over a dome it is near the top; over a pizza it is down on the
 * deck, inside the crust, which is where sauce on a pizza actually is.
 */
export function ladledY(l: Layout, spec: PlatingSpec, elev: Map<string, Elevation>, over: string): number | undefined {
  return ladled(l, spec, elev, over)?.y
}

/** Where sauce ladled over something sits, and how thick it is: a spoonful on a dome, a thin spread on a pizza's deck. */
export function ladled(l: Layout, spec: PlatingSpec, elev: Map<string, Elevation>, over: string): { y: number; thickness: number } | undefined {
  const seat = elev.get(over)
  if (!seat) return undefined
  const el = l.elements.find((e) => e.key === over)
  const deck = el ? DECK_LEVEL[familyFor(el.name, el.role, spec.tweaks?.[el.key]?.v)] : undefined
  return deck !== undefined
    ? { y: seat.y + seat.ry * deck + 0.012, thickness: SPREAD }
    : { y: seat.y + seat.ry * 0.72, thickness: 0.06 }
}

// Pieces that lean on a neighbour, and the soft mounds they lean on. A steak is not set down beside the puree with a gap
// between them: one edge comes to rest on it, and the piece tilts to match.
const LEANERS = new Set<ShapeFamily>(['cut', 'steak', 'breast', 'fillet', 'bird', 'whole', 'patty'])
const MOUNDS = new Set<ShapeFamily>(['quenelle', 'dome', 'grains', 'pile', 'nest', 'blob', 'tubes', 'heap', 'pillow', 'ball', 'chunk'])

// How far a bit of garnish leans when it lands: leaves and sprigs curl up off the plate, a seed or a crumb lies nearly flat.
const LEAN: Partial<Record<ShapeFamily, number>> = { leaf: 24, sprig: 28, ruffle: 18, shard: 12, crumb: 7, seed: 5, dust: 0, slice: 10 }
const unit = (key: string, salt: number) => (hashKey(key + salt) % 1000) / 1000

// Sauce spread over a pizza is a film, and what goes on the pizza sits on top of it.
const SPREAD = 0.012
const TOPPING_LIFT = 0.016

export function elevations(l: Layout, spec: PlatingSpec): Map<string, Elevation> {
  const out = new Map<string, Elevation>()
  // A build has a floor under how flat it can be pressed. Every layer of a
  // burger is a real thing with a real thickness: at the flat setting the five
  // of them merged into one pancake, which is the same failure as pulling them
  // apart -- a picture of something that is not the dish.
  const vertical = l.stacked ? Math.max(VERTICAL[spec.height], 0.62) : VERTICAL[spec.height]
  const portion = PORTION[spec.plate] ?? 1
  const toScene = (v: number) => (v - 0.5) / l.plate.radius
  // The plate is not flat, so "resting on the plate" is a different height at
  // the centre of a bowl than near its rim.
  // Measured under the element's outer edge, not its centre: on a bowl wall the
  // far side of a component is much higher, and using the centre buries it.
  const surfaceAt = (x: number, y: number, r = 0) =>
    plateSurfaceY(spec.plate, Math.min(1, Math.hypot(toScene(x), toScene(y)) + r * 0.7))

  const solids = l.elements.filter((e) => e.role !== 'garnish')
  // The base is seated first, because everything else in the dish is seated on
  // it -- and the same slot already feeds the garnish, so a slice of chilli
  // lands on the avocado toast rather than on the plate beside it.
  if (l.baseKey) {
    const at = solids.findIndex((e) => e.key === l.baseKey)
    if (at > 0) solids.unshift(...solids.splice(at, 1))
  }
  // The piece garnish lands on, and enough of its form to follow its surface.
  let hero: { x: number; z: number; cy: number; rx: number; ry: number; deck?: number; pizza?: boolean } | undefined
  // How high what is spread over a deck comes: garnish on a pizza goes on after the oven, on top of the cheese.
  let deckTop = -Infinity

  const tweak = (key: string) => spec.tweaks?.[key] ?? {}

  // A stack is built by resting each layer on top of the one below, so a thin
  // slice of cheese adds a sliver and a bun adds its full height. Lifting by
  // "index x this element's own radius" let thin layers sink into thick ones.
  const stacked = l.stacked
  let stackTop = solids.length ? surfaceAt(solids[0].x, solids[0].y, 0.3 * solids[0].scale) : 0
  // Where the build stands, so a layer the chef has dragged clear of it can be
  // told apart from one still in it. Dragged aside, a patty should sit on the
  // plate -- not hang in the air at the height the bun left it.
  const seat = solids.length
    ? {
        x: solids.reduce((a, e) => a + e.x, 0) / solids.length,
        y: solids.reduce((a, e) => a + e.y, 0) / solids.length,
      }
    : { x: 0.5, y: 0.5 }
  const inBuild = (el: PlacedElement) =>
    !stacked || Math.hypot(el.x - seat.x, el.y - seat.y) <= footprint(el, l.plate.radius)

  // Garnish belongs on the top of a build and over the hero of everything else.
  const garnishSeat = stacked ? solids.length - 1 : 0

  // If anything in the dish is a liquid, it sets a waterline that the rest of
  // the dish sits in rather than under.
  const fill = l.elements.some((e) => familyFor(e.name, e.role, tweak(e.key).v) === 'liquid')
    ? liquidFill(spec.plate)
    : null
  const afloat = (x: number, y: number, ry: number, seated: number) => {
    if (!fill) return seated
    const d = Math.hypot(toScene(x), toScene(y))
    // Riding low in it, the way a crouton or a dumpling does.
    return d < fill.radius ? Math.max(seated, fill.level + ry * 0.25) : seated
  }

  solids.forEach((el, i) => {
    const t = tweak(el.key)
    const family = familyFor(el.name, el.role, t.v)
    if (family === 'liquid' && fill) {
      out.set(el.key, { rx: fill.radius, ry: fill.depth, rz: fill.radius, y: fill.level })
      return
    }
    const m = shapeMetrics(family)
    let rx = 0.3 * el.scale * (t.s ?? 1) * m.widthMul * portion
    // A glass is as tall as a glass is, whatever the plating height says: that setting is how high a mound is piled.
    let ry = rx * 0.55 * (family === 'glass' ? 1 : vertical) * (t.h ?? 1) * m.heightMul
    // Layers overlap very slightly so the build reads as one object, not a tower
    // of separate discs with daylight between them.
    const stacking = stacked && inBuild(el)
    // Riding on the base: measured against the base's own domed surface, so a
    // topping near its edge follows the slope down instead of hanging in space.
    const rider = !stacking && hero && l.baseKey && el.key !== l.baseKey ? hero : null
    // Cheese on a pizza has been through the oven: run out wider than the slice that went on, and only a few
    // millimetres thick. A round white token standing proud of the sauce is the one thing that says "not baked".
    const melted =
      !!rider && !!rider.pizza && MELTS.test(el.name) && Math.hypot(toScene(el.x) - rider.x, toScene(el.y) - rider.z) < rider.rx * 0.98
    if (melted) {
      rx *= 1.3
      ry = rx * 0.07 * (t.h ?? 1)
    }
    const onBase = rider
      ? (() => {
          const d = Math.hypot(toScene(el.x) - rider.x, toScene(el.y) - rider.z)
          return d < rider.rx * 0.98
            ? (rider.deck !== undefined ? rider.cy + rider.ry * rider.deck + TOPPING_LIFT : rider.cy + rider.ry * Math.sqrt(Math.max(0, 1 - (d / rider.rx) ** 2))) + ry * 0.86
            : null
        })()
      : null
    const y = stacking
      ? stackTop + ry * 0.94
      : onBase ?? afloat(el.x, el.y, ry, surfaceAt(el.x, el.y, rx) + ry)
    if (stacking) stackTop = y + ry * 0.88
    if (rider && onBase !== null && rider.pizza) deckTop = Math.max(deckTop, y + ry * 0.5)
    out.set(el.key, { rx, ry, rz: rx * m.aspect, y, ...(melted ? { melted } : {}) })
    if (i === garnishSeat) hero = { x: toScene(el.x), z: toScene(el.y), cy: y, rx, ry, deck: DECK_LEVEL[family], pizza: family === 'pizza' }
  })

  // Ice floats in the drink: small enough to be inside the glass, and half out of the surface (which is at 0.62 of the
  // way up the glass, in engine/gltf/glassware.ts).
  const glassSeat = solids.find((e) => familyFor(e.name, e.role, tweak(e.key).v) === 'glass')
  const inGlass = glassSeat ? out.get(glassSeat.key) : undefined
  if (glassSeat && inGlass) {
    for (const el of solids) {
      const mine = out.get(el.key)
      if (el === glassSeat || !mine || !/\bice\b/i.test(el.name)) continue
      mine.rx = Math.min(mine.rx, inGlass.rx * 0.62)
      mine.rz = Math.min(mine.rz, inGlass.rz * 0.62)
      mine.ry = Math.min(mine.ry, inGlass.ry * 0.14)
      mine.y = inGlass.y + inGlass.ry * 0.62 + mine.ry * 0.3
    }
  }

  // Garnish rests on whatever is underneath rather than floating or sinking.
  for (const el of l.elements.filter((e) => e.role === 'garnish')) {
    const t = tweak(el.key)
    const gm = shapeMetrics(familyFor(el.name, el.role, t.v))
    // No two leaves off the same bunch are the same size. Derived from the key so
    // it is stable, not random per render.
    const vary = 0.82 + 0.36 * (hashKey(el.key) % 100) / 100
    const fam = familyFor(el.name, el.role, t.v)
    const d = hero ? Math.hypot(toScene(el.x) - hero.x, toScene(el.y) - hero.z) : Infinity
    const onPizza = !!hero && !!hero.pizza && d < hero.rx * 0.95
    // A leaf on a pizza is a whole basil or rocket leaf, a sixth of the way across it, not a sprig of microherbs.
    const rx = 0.16 * el.scale * (t.s ?? 1) * gm.widthMul * portion * vary * (onPizza && fam === 'leaf' ? 1.9 : 1)
    const ry = rx * 1.6 * Math.max(0.6, vertical) * (t.h ?? 1) * gm.heightMul
    // Seated on the hero's actual surface rather than on a flat lid over it, so
    // a seed near the edge of a bun follows the crown down instead of hanging.
    const seat =
      hero && d < hero.rx * 0.95
        ? hero.deck !== undefined
          ? Math.max(hero.cy + hero.ry * hero.deck + TOPPING_LIFT, hero.pizza ? deckTop : -Infinity)
          : hero.cy + hero.ry * Math.sqrt(Math.max(0, 1 - (d / hero.rx) ** 2))
        : surfaceAt(el.x, el.y, rx)
    // Sitting into what it lands on rather than perched on top of it: a seed
    // on a bun is pressed into the crust, not balanced on it.
    // Settled, not stood up: it lands at a slight angle of its own, and on a dome it also follows the slope.
    const lean = (LEAN[fam] ?? 10) * (0.35 + 0.65 * unit(el.key, 2))
    const heading = unit(el.key, 3) * Math.PI * 2
    let tx = Math.cos(heading) * lean
    let tz = Math.sin(heading) * lean
    if (hero && d < hero.rx * 0.95 && d > 1e-6 && hero.deck === undefined) {
      const slope = Math.asin(Math.min(0.9, d / hero.rx)) * (180 / Math.PI) * 0.55
      tx += ((toScene(el.x) - hero.x) / d) * slope
      tz += ((toScene(el.y) - hero.z) / d) * slope
    }
    const mag = Math.hypot(tx, tz)
    if (mag > 32) {
      tx *= 32 / mag
      tz *= 32 / mag
    }
    out.set(el.key, {
      rx,
      ry,
      rz: rx * gm.aspect,
      y: afloat(el.x, el.y, ry, seat + ry * 0.55),
      tilt: [tz, -tx],
    })
  }

  // Pieces that rest against something: a steak or a breast beside a puree comes to lean on it, the edge nearest the mound
  // lifted onto it and the far edge on the plate. Not in a build, where every layer is already sitting on the one below.
  if (!stacked) {
    for (const el of solids) {
      const mine = out.get(el.key)
      const fam = familyFor(el.name, el.role, tweak(el.key).v)
      if (!mine || !LEANERS.has(fam)) continue
      let near: { dx: number; dy: number; d: number } | null = null
      for (const other of solids) {
        if (other === el) continue
        const of = familyFor(other.name, other.role, tweak(other.key).v)
        if (!MOUNDS.has(of)) continue
        const dx = el.x - other.x
        const dy = el.y - other.y
        const d = Math.hypot(dx, dy)
        if (d < (footprint(el, l.plate.radius) + footprint(other, l.plate.radius)) * 1.12 && (!near || d < near.d)) near = { dx, dy, d }
      }
      if (!near || near.d < 1e-6) continue
      // The side facing the mound goes up, so the piece tilts away from it.
      const deg = 7 + 6 * unit(el.key, 1)
      const ux = near.dx / near.d
      const uz = near.dy / near.d
      mine.tilt = [deg * uz, -deg * ux]
      mine.y += mine.rz * Math.sin((deg * Math.PI) / 180) * 0.8
    }
  }

  // A piece the chef set down on top of another stands that much higher than where it would have rested.
  for (const [key, o] of Object.entries(spec.overrides ?? {})) {
    const at = out.get(key)
    if (at && o.e) at.y += o.e
  }

  return out
}
