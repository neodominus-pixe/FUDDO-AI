/* The landing page's toy kitchen: a pantry, two sauces, and twelve ways to
   arrange them. Everything is expressed in plate units -- 0 to 100 across the
   plate, centre at 50,50 -- so the big interactive plate and the thumbnail
   plates further down the page are the same data at two sizes. */

export type Kind = 'protein' | 'puree' | 'veg' | 'fruit' | 'crisp' | 'herb'

export type Food = {
  id: string
  name: string
  role: string
  color: string
  kind: Kind
  /** Width and height, in plate units. */
  w: number
  h: number
}

// Colours are food, not brand.
export const PANTRY: Food[] = [
  { id: 'duck', name: 'Seared duck', role: 'hero', color: '#8a4a30', kind: 'protein', w: 26, h: 15 },
  { id: 'puree', name: 'Celeriac purée', role: 'support', color: '#efe6d2', kind: 'puree', w: 18, h: 11 },
  { id: 'leek', name: 'Charred leek', role: 'support', color: '#6f9148', kind: 'veg', w: 27, h: 8 },
  { id: 'cherry', name: 'Pickled cherry', role: 'garnish', color: '#b02a44', kind: 'fruit', w: 8, h: 8 },
  { id: 'shallot', name: 'Crisp shallot', role: 'garnish', color: '#d09a48', kind: 'crisp', w: 11, h: 8 },
  { id: 'chervil', name: 'Micro chervil', role: 'garnish', color: '#7fa85a', kind: 'herb', w: 8, h: 7 },
]

export const SAUCES = [
  { id: 'jus', name: 'Red wine jus', color: '#6b1a2c' },
  { id: 'oil', name: 'Chervil oil', color: '#7d9a2e' },
] as const

export const foodById = (id: string) => PANTRY.find((f) => f.id === id)!

export type Placed = { id: string; x: number; y: number; r: number }
export type Point = { x: number; y: number; w: number }
export type Stroke = { color: string; points: Point[] }

export const FAMILIES = ['Minimal', 'Organic', 'Architectural'] as const
export const CONCEPT_COUNT = 12

export function conceptName(concept: number) {
  return FAMILIES[concept % 3]
}

const rad = (deg: number) => (deg * Math.PI) / 180

function line(x1: number, y1: number, x2: number, y2: number, w: number, steps = 14): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    // Thin at both ends, the way a spoon drag starts and lifts.
    const taper = 0.45 + 0.55 * Math.sin(Math.PI * t)
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, w: w * taper }
  })
}

function arc(cx: number, cy: number, radius: number, from: number, to: number, w: number, steps = 22): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const a = rad(from + (to - from) * t)
    // A swoosh: fat where the spoon lands, drawn out to nothing.
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, w: w * (1 - t * 0.8) }
  })
}

const dot = (x: number, y: number, w: number): Point[] => [{ x, y, w }]

/* One of twelve compositions for whatever is on the plate: three families,
   four variations of each. Returns where every piece goes and the sauce work
   that belongs with it. Pure, so the same call draws a thumbnail. */
export function arrange(concept: number, ids: string[]): { placed: Placed[]; sauce: Point[][] } {
  const family = concept % 3
  const v = Math.floor(concept / 3) % 4
  const n = ids.length

  if (family === 0) {
    // Minimal: one quiet line, at four different angles.
    const angle = [0, -24, 90, 32][v]
    const cx = [50, 50, 40, 52][v]
    const cy = [47, 50, 50, 48][v]
    const dx = Math.cos(rad(angle))
    const dy = Math.sin(rad(angle))
    const step = n > 1 ? Math.min(17, 58 / (n - 1)) : 0
    const placed = ids.map((id, i) => {
      const d = (i - (n - 1) / 2) * step
      const food = foodById(id)
      return { id, x: cx + dx * d, y: cy + dy * d, r: food.w > food.h * 2 ? angle + 90 : angle }
    })
    // The smear runs alongside the line, offset to one side of it.
    const ox = -dy * 11
    const oy = dx * 11
    const sauce = [line(cx + ox - dx * 31, cy + oy - dy * 31, cx + ox + dx * 31, cy + oy + dy * 31, 4.6)]
    return { placed, sauce }
  }

  if (family === 1) {
    // Organic: a golden-angle spiral, turned and mirrored per variation.
    const start = [0.6, 2.2, 3.9, 5.3][v]
    const dir = v % 2 ? -1 : 1
    const placed = ids.map((id, i) => {
      const a = start + dir * i * 2.4
      const radius = 4 + i * 5.2
      return { id, x: 50 + Math.cos(a) * radius, y: 50 + Math.sin(a) * radius * 0.92, r: ((i * 53 + v * 31) % 140) - 70 }
    })
    const from = [150, 20, 250, 300][v]
    const sauce = [arc(50, 50, 30, from, from + dir * 150, 6.2), arc(50, 50, 22, from + dir * 20, from + dir * 110, 2.6)]
    return { placed, sauce }
  }

  // Architectural: a stack, off-centre, with sauce dotted in a ruled row.
  const cx = [50, 38, 62, 50][v]
  const base = [60, 60, 60, 54][v]
  const placed = ids.map((id, i) => ({
    id,
    x: cx + (i % 2 ? 2.2 : -2.2),
    y: base - i * 6.4,
    r: i % 2 ? 9 : -7,
  }))
  const sauce: Point[][] = []
  const side = cx > 50 ? -1 : 1
  for (let i = 0; i < 5; i++) {
    const size = 6.4 - i * 1.05
    if (v === 3) {
      // Ring the stack instead of lining up beside it.
      const a = rad(200 + i * 35)
      sauce.push(dot(50 + Math.cos(a) * 30, 52 + Math.sin(a) * 30, size))
    } else {
      sauce.push(dot(cx + side * (22 + i * 7.2), 62 - i * 1.5, size))
    }
  }
  return { placed, sauce }
}

/** Keep a piece on the porcelain: no further than `limit` units from centre. */
export function clampToPlate(x: number, y: number, limit = 41) {
  const dx = x - 50
  const dy = y - 50
  const d = Math.hypot(dx, dy)
  if (d <= limit) return { x, y }
  return { x: 50 + (dx / d) * limit, y: 50 + (dy / d) * limit }
}
