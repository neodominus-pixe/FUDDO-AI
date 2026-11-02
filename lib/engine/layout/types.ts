import type { ComponentRole, SauceStyle } from '../../types'

export type PlacedElement = {
  // Stable per-element identity. Garnish repeats one component many times, so
  // the component id alone is not enough to address a single blob when dragging.
  key: string
  componentId: string
  name: string
  role: ComponentRole
  x: number
  y: number
  scale: number
  rotation: number
  z: number
}

// `over` is the key of the element the mark was ladled onto, when the dish is
// one that is sauced on top rather than stood in a pool. Decided here rather
// than in a renderer: the picture, the model and the prompt all have to agree
// about whether the sauce is under the food or over it.
export type SauceMark = { x: number; y: number; rx: number; ry: number; rot: number; over?: string }

// One continuous run of sauce: a drizzle, or a stroke the chef painted. `samples` run along it; `path` is its centre
// line and `outline` (painted strokes only) its tapered shape, both as SVG in frame coordinates.
export type SauceStroke = {
  samples: SauceMark[]
  /** Width multiplier: 1 is a drizzle's width. */
  width: number
  /** Painted by hand, as opposed to laid out by the plating style. */
  free: boolean
  /** Where a painted stroke is in `spec.brush`; -1 for a drizzle. */
  index: number
  path: string
  outline: string
}

export type SauceLayout = {
  style: SauceStyle
  marks: SauceMark[]
  path: string | null
  // Where the sauce sits as a whole, so the chef has something to take hold of.
  // Every style is a different number of marks; this is the one point that all
  // of them can be dragged by.
  anchor: { x: number; y: number }
  // A drizzle is a smooth stroke in 2D but has to become discrete blobs in 3D.
  // Sampling it here keeps both renderers reading from the same curve.
  samples: SauceMark[]
  // The same samples grouped into their runs. Each run is one swept piece in the 3D model.
  strokes: SauceStroke[]
}

export type PlateGeometry = {
  shape: 'circle' | 'square' | 'board'
  face: string
  rim: string
  rimWidth: number
  radius: number
}

export type Layout = {
  plate: PlateGeometry
  elements: PlacedElement[]
  sauce: SauceLayout
  // Whether this dish is one build rather than several arranged things. Decided
  // once, here, because placement, elevation and the prompt all have to agree.
  stacked: boolean
  // The element everything else is served on, when the dish has one.
  baseKey: string | null
}

// All values are in plate-radius units: 1.0 is the distance from the centre of
// the plate to its rim, with y measured up from the table.
export type Elevation = {
  rx: number
  ry: number
  rz: number
  y: number
  /** How far the piece leans from upright, [about X, about Z] in degrees: a leaf on a dome, a steak against the purée. */
  tilt?: [number, number]
  /** Cheese that has melted over a pizza: built as a pool rather than as the slice it was (engine/gltf/built.ts). */
  melted?: boolean
}
