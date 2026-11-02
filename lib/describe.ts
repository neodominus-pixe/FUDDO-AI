import { elevations, layout } from './layout'
import { servingFor } from './shapes'
import { ingredientHsl } from './palette'
import type { Dish, PlateStyle, PlatingSpec, SauceStyle } from './types'

// Plain kitchen language for positions. Used by the prompt a paid model receives
// and by the spec card taped above the pass, so both say the same thing.

// Named the way a chef would say it, preposition included -- food goes ON a
// plate but IN a bowl. Pasting the spec key in and appending the word "plate"
// produced "a wooden board plate" and "a deep bowl plate".
export const PLATE_TEXT: Record<PlateStyle, { on: string; noun: string }> = {
  'round-white': { on: 'on a round white plate', noun: 'plate' },
  'square-white': { on: 'on a square white plate', noun: 'plate' },
  'coupe-grey': { on: 'on a grey coupe plate', noun: 'plate' },
  'black-slate': { on: 'on a black slate', noun: 'slate' },
  'deep-bowl': { on: 'in a deep bowl', noun: 'bowl' },
  'shallow-bowl': { on: 'in a wide, shallow bowl', noun: 'bowl' },
  'wooden-board': { on: 'on a wooden serving board', noun: 'board' },
}

export function where(x: number, y: number, noun = 'plate') {
  const across = x < 0.42 ? 'left' : x > 0.58 ? 'right' : 'centre'
  const back = y < 0.42 ? 'back' : y > 0.58 ? 'front' : 'middle'
  if (across === 'centre' && back === 'middle') return `centre of the ${noun}`
  if (across === 'centre') return `${back} centre`
  if (back === 'middle') return `${across} of centre`
  return `${back} ${across}`
}

// Height only means something when the components actually differ in height.
// Judged against the tallest alone, a flat row of five items all came out
// "high on the build", which told a model nothing.
export function levelOf(top: number, lowest: number, highest: number) {
  const range = highest - lowest
  if (range < highest * 0.12) return 'on the plate'
  const t = (top - lowest) / range
  return t > 0.66 ? 'high on the build' : t > 0.33 ? 'mid height' : 'on the plate'
}

export function describeSauce(style: SauceStyle, name: string, count: number, overFood = false) {
  const who = name || 'sauce'
  // Pasta and rice are sauced on top and the layout plates them that way. Saying
  // "pooled underneath" would send a paid model the opposite picture.
  if (overFood && (style === 'pooled' || style === 'smeared')) {
    return `${who} ladled generously over the top of the food, not pooled underneath it`
  }
  switch (style) {
    case 'pooled':
      return `${who} pooled underneath the food`
    case 'dotted':
      return `${who} in ${count} small dots spaced around the food`
    case 'drizzled':
      return `${who} drizzled in one continuous ribbon across the plate`
    case 'smeared':
      return `${who} swiped in a single smear across the plate`
    case 'aside':
      return `a small quenelle of ${who} set to one side, not touching the food`
    case 'none':
      return 'no visible sauce'
  }
}

// Per-element adjustments the chef made by hand, in words a model can use.
// Without this the spec says "taller, darker" and the prompt says nothing.
export function describeTweaks(dish: Dish, spec: PlatingSpec): string[] {
  const l = layout(dish, spec)
  const out: string[] = []
  for (const el of l.elements) {
    const t = spec.tweaks?.[el.key]
    if (!t) continue
    const notes: string[] = []
    if (t.h !== undefined && t.h >= 1.25) notes.push('built noticeably taller than usual')
    else if (t.h !== undefined && t.h <= 0.8) notes.push('kept low and flat')
    if (t.s !== undefined && t.s >= 1.25) notes.push('a generous portion')
    else if (t.s !== undefined && t.s <= 0.8) notes.push('a small portion')
    if (t.c) {
      const own = ingredientHsl(el.name, el.role)[2]
      const n = parseInt(t.c.slice(1), 16)
      const lightness = ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114) / 2.55
      if (lightness < own - 12) notes.push('a deeper, darker shade than usual')
      else if (lightness > own + 12) notes.push('a paler shade than usual')
    }
    if (notes.length) out.push(`${el.name}: ${notes.join(', ')}`)
  }
  // Garnish repeats one component many times; say it once.
  return [...new Set(out)]
}

export type Placement = {
  name: string
  role: string
  where: string
  level: string
  restsOn: string | null
  // How this component is served -- twirled, heaped, ladled. Empty when its own
  // name already says it, or when the name was not recognised at all.
  served: string
}

// Elements described in build order. For a stacked composition that means bottom
// to top, which is the difference between "a burger" and "five things on a plate".
export function describePlacement(dish: Dish, spec: PlatingSpec) {
  const l = layout(dish, spec)
  const elev = elevations(l, spec)
  const solids = l.elements.filter((e) => e.role !== 'garnish')
  const ordered = [...solids].sort((a, b) => (elev.get(a.key)?.y ?? 0) - (elev.get(b.key)?.y ?? 0))
  const tops = ordered.map((e) => { const el = elev.get(e.key); return el ? el.y + el.ry : 0 })
  const lowest = Math.min(...tops, Infinity)
  const highest = Math.max(...tops, 0.0001)
  const stacked = l.stacked

  const items: Placement[] = ordered.map((e, i) => ({
    name: e.name,
    role: e.role,
    where: where(e.x, e.y, PLATE_TEXT[spec.plate].noun),
    served: servingFor(e.name, e.role, spec.tweaks?.[e.key]?.v),
    // Only a stack lifts anything. Elsewhere the differences in `tops` come from
    // one component simply being bigger than another, which is not build height.
    level: stacked ? levelOf(tops[i], lowest, highest) : 'on the plate',
    // Only a stack has anything resting on anything. Spread-out compositions
    // sit side by side and must not be described as leaning on each other.
    restsOn: stacked && i > 0 ? ordered[i - 1].name : null,
  }))

  return { items, stacked, tallest: highest }
}
