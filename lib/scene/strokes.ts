import type { BrushStroke, PlatingSpec } from '../types'

// Painted strokes are objects of their own: they have a key like any piece on the plate, so they can be selected,
// carried, locked, shown alone and removed. These are the pure helpers for naming and moving them.

const KEY = /^stroke:(\d+)$/

export const strokeKey = (index: number) => `stroke:${index}`

/** The place in `spec.brush` a key refers to, or null when it is not a stroke's key. */
export function strokeIndex(key: string): number | null {
  const m = KEY.exec(key)
  return m ? Number(m[1]) : null
}

const LOW = 0.06
const HIGH = 0.94

/**
 * Moves a stroke by carrying all its points by the same amount, kept inside the picture. Returns the new brush list;
 * the other strokes are untouched. `dx` and `dy` are in frame units (0..1 across the picture).
 */
export function translateStroke(brush: BrushStroke[], index: number, dx: number, dy: number): BrushStroke[] {
  const stroke = brush[index]
  if (!stroke) return brush
  const xs = stroke.pts.map((p) => p[0])
  const ys = stroke.pts.map((p) => p[1])
  // Never push any point off the picture: the whole stroke stops at the edge instead of bending against it.
  const cx = Math.min(HIGH - Math.max(...xs), Math.max(LOW - Math.min(...xs), dx))
  const cy = Math.min(HIGH - Math.max(...ys), Math.max(LOW - Math.min(...ys), dy))
  const r4 = (v: number) => Math.round(v * 10000) / 10000
  return brush.map((s, i) => (i === index ? { ...s, pts: s.pts.map(([x, y]) => [r4(x + cx), r4(y + cy)] as [number, number]) } : s))
}

/** Several strokes moved at once, each by its own amount. */
export function translateStrokes(brush: BrushStroke[], moves: Array<{ index: number; dx: number; dy: number }>): BrushStroke[] {
  return moves.reduce((acc, m) => translateStroke(acc, m.index, m.dx, m.dy), brush)
}

/** The spec with one stroke taken out; no strokes left means no brush at all. */
export function withoutStroke(spec: PlatingSpec, index: number): PlatingSpec {
  const next = (spec.brush ?? []).filter((_, i) => i !== index)
  return { ...spec, brush: next.length ? next : undefined }
}
