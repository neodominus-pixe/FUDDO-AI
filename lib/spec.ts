import { SAUCE_KEY } from './types'
import type { Angle, Dish, PlatingSpec } from './types'
import { PLATE_TEXT, describePlacement, describeSauce, describeTweaks, where } from './describe'
import { layout } from './layout'

// Twelve deliberately distinct plating directions rather than random combinations.
// Named directions matter: the consultant says "the negative-space one", not "number 7".
export const DIRECTIONS: Array<{ name: string; spec: Omit<PlatingSpec, 'id' | 'seed' | 'notes' | 'overrides'> }> = [
  { name: 'Classic centred',    spec: { composition: 'centered',       plate: 'round-white',   sauce: 'pooled',   height: 'medium', garnish: 'moderate' } },
  { name: 'Tall stack',         spec: { composition: 'stacked-tall',   plate: 'round-white',   sauce: 'dotted',   height: 'tall',   garnish: 'minimal' } },
  { name: 'Negative space',     spec: { composition: 'negative-space', plate: 'coupe-grey',    sauce: 'smeared',  height: 'low',    garnish: 'minimal' } },
  { name: 'Slate linear',       spec: { composition: 'linear',         plate: 'black-slate',   sauce: 'dotted',   height: 'low',    garnish: 'moderate' } },
  { name: 'Rustic board',       spec: { composition: 'scattered',      plate: 'wooden-board',  sauce: 'aside',    height: 'flat',   garnish: 'generous' } },
  { name: 'Bowl, pooled',       spec: { composition: 'centered',       plate: 'shallow-bowl',  sauce: 'pooled',   height: 'low',    garnish: 'moderate' } },
  { name: 'Off-centre drizzle', spec: { composition: 'off-center',     plate: 'square-white',  sauce: 'drizzled', height: 'medium', garnish: 'moderate' } },
  { name: 'Garden scatter',     spec: { composition: 'scattered',      plate: 'round-white',   sauce: 'dotted',   height: 'low',    garnish: 'generous' } },
  { name: 'Fine-dining smear',  spec: { composition: 'off-center',     plate: 'coupe-grey',    sauce: 'smeared',  height: 'medium', garnish: 'minimal' } },
  { name: 'Modern square',      spec: { composition: 'linear',         plate: 'square-white',  sauce: 'drizzled', height: 'medium', garnish: 'minimal' } },
  { name: 'Slate tall',         spec: { composition: 'stacked-tall',   plate: 'black-slate',   sauce: 'aside',    height: 'tall',   garnish: 'moderate' } },
  { name: 'Minimal centred',    spec: { composition: 'centered',       plate: 'coupe-grey',    sauce: 'none',     height: 'flat',   garnish: 'minimal' } },
]

export function buildSpread(count = 12, baseSeed = Date.now()): Array<{ name: string; spec: PlatingSpec }> {
  return Array.from({ length: count }, (_, i) => {
    const d = DIRECTIONS[i % DIRECTIONS.length]
    return {
      name: d.name,
      spec: {
        ...d.spec,
        id: `spec-${i + 1}`,
        seed: (baseSeed + i * 7919) >>> 0,
        notes: '',
        overrides: {},
      },
    }
  })
}

const ANGLE_TEXT: Record<Angle, string> = {
  'three-quarter': 'shot at a 35-degree three-quarter angle, the way a diner sees it',
  'top-down': 'shot directly overhead, flat lay, plate centred in frame',
  side: 'shot at plate level from the side to show height and layering',
}

// The prompt a real provider receives. Rendered in the UI so you can judge
// output quality before paying for a single call.
//
// Every component is named, and positions are expressed as relationships rather
// than frame percentages. A stack described as five coordinates near the middle
// of the plate reads to an image model as five scattered objects -- which is how
// a burger comes back looking like a salad.
export function promptFromSpec(dish: Dish, spec: PlatingSpec, angle: Angle): string {
  const l = layout(dish, spec)
  const { items, stacked } = describePlacement(dish, spec)

  const sauce = dish.components.find((c) => c.role === 'sauce')
  const garnish = dish.components.find((c) => c.role === 'garnish')
  const garnishCount = l.elements.filter((e) => e.role === 'garnish').length
  const sauceCount = l.sauce.marks.length + l.sauce.samples.length
  // Sauce the chef painted by hand. With no sauce component and nothing else laid out, it is the only sauce there is.
  const painted = l.sauce.strokes.filter((s) => s.free).length
  const sauceStyle = !sauce && painted ? 'none' : spec.sauce

  const roster = [...new Set([...items.map((i) => i.name), sauce?.name, garnish?.name].filter(Boolean))]
  const tweaks = describeTweaks(dish, spec)
  const withPhotos = dish.components.filter((c) => c.imagePath).length

  // A component's form matters more to the picture than its position does: a
  // model told "spaghetti, centre of the plate" will paint a pile of loose
  // strands, which is a different dish from the one on the spec card.
  const served = (i: (typeof items)[number]) => (i.served ? `, ${i.served}` : '')
  const build = stacked
    ? `Built as one vertical stack, ${spec.height} in height, layered from the bottom up: ${items
        .map((i, n) => `(${n + 1}) ${i.name}${served(i)}`)
        .join(', ')}. Each layer sits squarely on the one below it and the stack stays centred and upright.`
    : `Arranged ${spec.composition.replace(/-/g, ' ')} across the ${PLATE_TEXT[spec.plate].noun}, ${spec.height} in height. ${items
        .map((i) => `${i.name} ${i.where}${served(i)}`)
        .join('; ')}.`

  return [
    `Professional food photography of "${dish.name}".`,
    roster.length ? `The dish contains exactly these components and nothing else: ${roster.join(', ')}.` : '',
    withPhotos
      ? `Use the ${withPhotos} supplied reference photograph${withPhotos === 1 ? '' : 's'} as the exact appearance of those components - do not substitute, add or invent ingredients.`
      : `Do not substitute, add or invent any ingredient beyond those listed.`,
    `Served ${PLATE_TEXT[spec.plate].on}.`,
    build,
    // Where the chef put it, when they moved it themselves. A plating engine's
    // own placement is implied by the style; a deliberate one is not, and a paid
    // model that is not told will put the sauce back where it likes.
    `Sauce: ${sauceStyle === 'none' && painted ? '' : describeSauce(sauceStyle, sauce?.name ?? '', sauceCount, l.sauce.marks.some((m) => m.over))}${
      spec.overrides?.[SAUCE_KEY] && sauceStyle !== 'none'
        ? `, set ${where(l.sauce.anchor.x, l.sauce.anchor.y, PLATE_TEXT[spec.plate].noun)}`
        : ''
    }${painted ? `${sauceStyle === 'none' ? '' : '; '}${painted === 1 ? 'one' : painted} hand-painted swoosh${painted === 1 ? '' : 'es'} of ${sauce?.name ?? 'sauce'} swept across the plate` : ''}.`,
    garnish && garnishCount
      ? `Garnish: ${garnishCount} small pieces of ${garnish.name}, ${spec.garnish === 'minimal' ? 'placed sparingly' : 'scattered'} over the top.`
      : 'No garnish.',
    tweaks.length ? `Chef adjustments: ${tweaks.join('; ')}.` : '',
    `Camera: ${ANGLE_TEXT[angle]}.`,
    `Soft diffused studio lighting, shallow depth of field, neutral background, no hands, no cutlery, no text.`,
    spec.notes ? `Chef direction: ${spec.notes}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
