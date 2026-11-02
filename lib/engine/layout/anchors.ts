import { type ShapeFamily, shapeFor } from '../../shapes'
import type { Composition, Dish, PlatingSpec } from '../../types'

// The layers of one build, concentric about a seat on the plate. An earlier
// version pushed each layer further back in depth, which from any angle read as
// five things side by side rather than one build, and shrank every layer so a
// bun no longer matched its patty.
export function stackPoints(count: number, rand: () => number, seat = { x: 0, y: 0 }) {
  const pts: Array<{ x: number; y: number; s: number }> = []
  for (let i = 0; i < count; i++) {
    pts.push({
      x: seat.x + (rand() - 0.5) * 0.07,
      y: seat.y + (rand() - 0.5) * 0.07,
      s: i === 0 ? 1 : 0.97 - i * 0.015,
    })
  }
  return pts
}

// Dishes that are one built object rather than several things arranged on a
// plate. Their parts are not plating decisions: a burger with its bun over here
// and its patty over there is not a burger plated differently, it is not a
// burger. So for these the composition decides where the build SITS, and never
// whether it comes apart.
export const ASSEMBLIES = [
  'burger', 'sandwich', 'sarnie', 'toastie', 'panini', 'bagel', 'slider',
  'croque', 'bap', 'banh mi', 'hot dog', 'sub roll', 'reuben',
]

// Forms that other things are served ON: a pizza base, a slice of toast, a taco
// shell, a tart case. Their toppings are not separate items sharing a plate --
// avocado beside the toast is not avocado toast.
export const BASE_FAMILIES = new Set<ShapeFamily>(['disc', 'folded', 'pizza'])

export const BREAD = ['toast', 'sourdough', 'bread', 'crostini', 'bruschetta', 'rye', 'ciabatta', 'baguette']

// Round and flat, but a mouthful rather than a platform. A base takes the whole
// seat and everything else in the dish is arranged on top of it, which is right
// for a pizza and absurd for a macaron: three oatcakes on a cheese board came
// out as one plate-sized biscuit with the cheese and the grapes sat on it.
export const BITE = [
  'cookie', 'biscuit', 'shortbread', 'macaron', 'oatcake', 'cracker', 'crumpet',
  'wafer', 'pikelet', 'digestive', 'tuile', 'poppadom', 'papadum',
]

export function isBase(name: string, role: string) {
  if (role === 'garnish') return false
  const t = name.toLowerCase()
  if (BITE.some((k) => t.includes(k))) return false
  const family = shapeFor(name, role)
  if (BASE_FAMILIES.has(family)) return true
  // A slice is only a base when it is a slice of something you put things on.
  return family === 'slice' && BREAD.some((k) => t.includes(k))
}

// Things that arrive by the handful, and how many more of them than one. A
// single mussel is not a portion of mussels -- it is a mussel -- and the chef
// should not have to ask for the other four. An explicit count in the spec
// always wins, including a deliberate zero.
// Mushrooms arrive as a handful of them too: one girolle beside a piece of fish
// is a garnish nobody ordered, and the chef writing "girolles" means the pan.
// Pods belong here rather than with the plurals below: one mange tout is not a
// small portion of mange tout, and "edamame" and "okra" are already plural
// without an s on the end for the name rule to find.
export const DEFAULT_COPIES: Partial<Record<ShapeFamily, number>> = { shell: 4, pillow: 2, cap: 2, pod: 3, chunk: 3 }

// Forms where one piece is one piece, so a name in the plural means several of
// them: three meatballs, four onion rings, two tacos. Left to the name rather
// than to the form, because one burrata is a burrata and one apple is an apple
// -- both of which are the same round shape as a meatball.
// A baton belongs here: a chef writing "asparagus spears" means the handful, and
// one spear on a plate reads as a courgette. One "cinnamon stick" is still one
// stick -- the plural is what asks.
export const SEVERAL = new Set<ShapeFamily>(['ball', 'ring', 'skewer', 'folded', 'shard', 'baton', 'leaf'])

// Round slices that arrive as several: a pizza is not topped with one pepperoni, and a salad does not have one round of
// cucumber in it. Not when the dish is a stack, where each extra would be another layer of the build.
// Each is for the forms it is true of: three crushed potatoes are three discs, but a disc of pancake is one.
const HANDFUL: Array<[ShapeFamily[], RegExp, number]> = [
  [['coin'], /pepperoni/, 5],
  [['coin'], /salami|chorizo/, 4],
  [['coin'], /mozzarella/, 4],
  [['coin'], /cucumber/, 4],
  [['coin'], /tomato/, 3],
  [['coin'], /pickle|gherkin/, 3],
  [['coin'], /scallop/, 2],
  [['patty'], /crushed|smashed/, 2],
  [['disc'], /hash brown/, 2],
  [['pillow'], /gnocchi/, 4],
  [['prawn'], /prawns|shrimps|langoustines|crayfish/, 3],
]

export function defaultCopies(name: string, role: string, stacked = false) {
  const family = shapeFor(name, role)
  const fixed = DEFAULT_COPIES[family]
  if (fixed !== undefined) return fixed
  if (!stacked) {
    const t = name.trim().toLowerCase()
    for (const [families, pattern, n] of HANDFUL) if (families.includes(family) && pattern.test(t)) return n
  }
  const t = name.trim().toLowerCase()
  return SEVERAL.has(family) && /[^su]s$/.test(t) ? 2 : 0
}

export function buildsAsStack(dish: Dish, spec: PlatingSpec) {
  // Nothing is built on top of a glass, whatever the composition says.
  if (dish.components.some((c) => c.role !== 'garnish' && shapeFor(c.name, c.role) === 'glass')) return false
  if (spec.composition === 'stacked-tall') return true
  const name = dish.name.toLowerCase()
  // A component that is already a whole sandwich says the dish is not being
  // built from its layers -- it arrived assembled, and everything else on the
  // plate is a side. On the name alone, "club sandwich, skinny fries" stacked
  // the chips on top of the sandwich.
  if (dish.components.some((c) => shapeFor(c.name, c.role) === 'stack')) return false
  if (ASSEMBLIES.some((k) => name.includes(k))) return true
  // A bottom bun is only ever listed by someone building something on top of it.
  return dish.components.some((c) => c.role !== 'garnish' && shapeFor(c.name, c.role) === 'bunBase')
}

// Anchor positions per composition, expressed as offsets from plate centre in
// plate-radius units. The hero is index 0; supports follow.
export function anchors(composition: Composition, count: number, rand: () => number) {
  const pts: Array<{ x: number; y: number; s: number }> = []
  switch (composition) {
    case 'centered':
      pts.push({ x: 0, y: -0.04, s: 1 })
      for (let i = 0; i < count - 1; i++) {
        const a = Math.PI * (0.25 + (0.5 * i) / Math.max(1, count - 2 || 1))
        pts.push({ x: Math.cos(a) * 0.46, y: 0.30 + Math.sin(a) * 0.14, s: 0.72 })
      }
      break
    case 'stacked-tall':
      pts.push(...stackPoints(count, rand))
      break
    case 'off-center':
      pts.push({ x: -0.22, y: -0.02, s: 1 })
      for (let i = 0; i < count - 1; i++) {
        pts.push({ x: 0.20 + (i % 2) * 0.16, y: -0.14 + i * 0.16, s: 0.68 })
      }
      break
    case 'linear': {
      const span = 1.30
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1)
        pts.push({ x: -span / 2 + t * span, y: (rand() - 0.5) * 0.08, s: i === 0 ? 0.98 : 0.72 })
      }
      break
    }
    case 'scattered': {
      // Evenly spaced sectors with jitter rather than free random angles, so
      // three components never all land in one quadrant leaving half the plate
      // bare. Still varies plate to plate; it just cannot bunch.
      const start = rand() * Math.PI * 2
      for (let i = 0; i < count; i++) {
        const a = start + (i / count) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / count)
        const r = i === 0 ? 0.16 + rand() * 0.1 : 0.42 + rand() * 0.2
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, s: i === 0 ? 1 : 0.62 + rand() * 0.2 })
      }
      break
    }
    case 'negative-space':
      pts.push({ x: 0.26, y: -0.18, s: 1 })
      for (let i = 0; i < count - 1; i++) {
        pts.push({ x: 0.16 + (rand() - 0.5) * 0.3, y: 0.06 + i * 0.13, s: 0.66 })
      }
      break
  }
  return pts
}
