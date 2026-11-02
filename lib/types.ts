// A photographed component of the real dish. The chef shoots what they actually
// cooked, so the consultant reviews arrangements of their food, not stock food.
export type Component = {
  id: string
  name: string
  role: ComponentRole
  imagePath: string | null
}

export type ComponentRole = 'hero' | 'support' | 'sauce' | 'garnish'

export type SauceStyle = 'pooled' | 'dotted' | 'drizzled' | 'smeared' | 'aside' | 'none'
export type PlateStyle = 'round-white' | 'black-slate' | 'square-white' | 'deep-bowl' | 'shallow-bowl' | 'wooden-board' | 'coupe-grey'
export type Composition =
  | 'centered'
  | 'stacked-tall'
  | 'off-center'
  | 'linear'
  | 'scattered'
  | 'negative-space'
export type Height = 'flat' | 'low' | 'medium' | 'tall'
export type GarnishDensity = 'minimal' | 'moderate' | 'generous'
export type Angle = 'three-quarter' | 'top-down' | 'side'

// The layout spec is the source of truth. Every render is produced from this,
// never from a previous image -- that is what stops edits from drifting.
export type PlatingSpec = {
  id: string
  composition: Composition
  plate: PlateStyle
  sauce: SauceStyle
  height: Height
  garnish: GarnishDensity
  notes: string
  // Manual position nudges from dragging, keyed by element key. Applied on top
  // of the composition preset so the spec stays the single source of truth.
  // `e` is extra height, in plate-radius units, for a piece set down on top of another.
  overrides: Record<string, { x: number; y: number; e?: number }>
  // Per-element adjustments: height multiplier, size multiplier, colour override.
  // Same idea as overrides -- the spec stays the only source of truth, so a
  // tweaked plate re-renders identically and travels with the project.
  tweaks?: Record<string, ElementTweak>
  // Extra instances of a component, keyed by component id. Three quenelles of
  // puree is one component plated three times, not three components.
  copies?: Record<string, number>
  // Sauce painted by hand with the brush: up to eight strokes, each a line of points across the plate (0..1, the same
  // frame as `overrides`) and a width multiplier. They are sauce in addition to whatever `sauce` style is chosen, and
  // move, grow, turn and recolour with it.
  brush?: BrushStroke[]
  // How the plate is photographed: what it stands on, what lies beside it, how it is lit. Appearance only; it does not
  // change what is on the plate, so a plating looks the same wherever it is shown.
  scene?: SceneStyle
  seed: number
}

export type TableId = 'studio' | 'oak' | 'marble' | 'linen' | 'slate' | 'concrete'
export type PropsId = 'none' | 'cutlery' | 'napkin' | 'both'
export type LightId = 'studio' | 'bistro' | 'daylight' | 'moody'
export type SceneStyle = { table?: TableId; props?: PropsId; light?: LightId; focus?: boolean }

export const TABLES: TableId[] = ['studio', 'oak', 'marble', 'linen', 'slate', 'concrete']
export const PROPS: PropsId[] = ['none', 'cutlery', 'napkin', 'both']
export const LIGHTS: LightId[] = ['studio', 'bistro', 'daylight', 'moody']

export type BrushStroke = { w: number; pts: Array<[number, number]> }

// The reserved element key the sauce is addressed by. Component keys are always
// "<component id>:<n>", so this can never collide with one.
export const SAUCE_KEY = 'sauce'

export type ElementTweak = {
  h?: number // height multiplier
  s?: number // size multiplier
  c?: string // colour override
  r?: number // extra rotation about the vertical axis, degrees
  v?: number // which blob shape variant to use
  hidden?: boolean // dropped from this plating without leaving the dish
}

export type Dish = {
  id: string
  name: string
  components: Component[]
  createdAt: string
}

export type Render = {
  id: string
  specId: string
  spec: PlatingSpec
  svg: string | null
  imageUrl: string | null
  provider: string
  costUsd: number
  latencyMs: number
  angle: Angle
  prompt: string
}
