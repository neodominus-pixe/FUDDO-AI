import { layout } from '@/lib/layout'
import { DIRECTIONS } from '@/lib/spec'
import type { ComponentRole, Dish, PlatingSpec } from '@/lib/types'

/* The landing page's small kitchen: a pantry, two sauces, and the studio's twelve
   directions to arrange them. Everything is expressed in plate units -- 0 to 100
   across the plate, centre at 50,50 -- so the big interactive plate and the
   thumbnail plates further down the page are the same data at two sizes. */

export type Kind = 'protein' | 'puree' | 'veg' | 'fruit' | 'crisp' | 'herb'

export type Food = {
  id: string
  name: string
  role: ComponentRole
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
  { id: 'oil', name: 'Herb oil', color: '#7d9a2e' },
] as const

export const foodById = (id: string) => PANTRY.find((f) => f.id === id)!

export type Placed = { id: string; x: number; y: number; r: number }
export type Point = { x: number; y: number; w: number }
export type Stroke = { color: string; points: Point[] }

export const CONCEPT_COUNT = DIRECTIONS.length

export function conceptName(concept: number) {
  return DIRECTIONS[concept % CONCEPT_COUNT].name
}

// How far the engine's plate rim is from the centre of this page's plate, in plate units.
const RIM = 46

/* One of the studio's twelve directions for whatever is on the plate: where every piece goes and the sauce work that
   belongs with it, from the same layout engine the studio uses. Pure, so the same call draws a thumbnail. */
export function arrange(concept: number, ids: string[]): { placed: Placed[]; sauce: Point[][] } {
  if (!ids.length) return { placed: [], sauce: [] }
  const direction = DIRECTIONS[concept % CONCEPT_COUNT]
  const foods = ids.map(foodById)
  const dish: Dish = {
    id: 'landing',
    name: 'Duck breast, celeriac, red wine',
    createdAt: '2026-01-01T00:00:00.000Z',
    components: [
      ...foods.map((f) => ({ id: f.id, name: f.name, role: f.role, imagePath: null })),
      { id: 'sauce', name: SAUCES[0].name, role: 'sauce' as const, imagePath: null },
    ],
  }
  const spec: PlatingSpec = { ...direction.spec, id: `spec-${concept + 1}`, seed: 20261118 + concept * 7919, notes: '', overrides: {} }
  const plan = layout(dish, spec)
  const scale = RIM / plan.plate.radius
  const toPlate = (v: number) => 50 + (v - 0.5) * scale

  const placed = ids.map((id, i) => {
    const element = plan.elements.find((e) => e.componentId === id)
    // A direction with little garnish can leave a piece out; it still has to be somewhere on this plate.
    const at = element ? clampToPlate(toPlate(element.x), toPlate(element.y)) : clampToPlate(50 + 30 * Math.cos(i * 2.4), 50 + 30 * Math.sin(i * 2.4))
    return { id, ...at, r: element?.rotation ?? 0 }
  })
  const mark = (m: { x: number; y: number; rx: number; ry: number }) => ({ x: toPlate(m.x), y: toPlate(m.y), w: Math.max(1.6, (m.rx + m.ry) * scale) })
  const sauce = [...plan.sauce.strokes.map((run) => run.samples.map(mark)), ...plan.sauce.marks.map((m) => [mark(m)])]
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
