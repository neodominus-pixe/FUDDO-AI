// Snapping for a dragged element, in scene units (plate rim at 1). Pure, so it can be tested without a browser.

export type Guide = { kind: 'axis'; axis: 'x' | 'z'; at: number } | { kind: 'ring'; radius: number }

export type SnapOptions = {
  enabled: boolean
  /** How close, in scene units, a point must be to a line for it to catch. */
  threshold?: number
  /** Where the other pieces stand; lining up with them is what makes a plating look deliberate. */
  others?: Array<{ x: number; z: number }>
  rings?: number[]
}

export const DEFAULT_RINGS = [0.33, 0.66]

export function snapPoint(x: number, z: number, o: SnapOptions): { x: number; z: number; guides: Guide[] } {
  if (!o.enabled) return { x, z, guides: [] }
  const threshold = o.threshold ?? 0.045
  const guides: Guide[] = []

  // Axes: the middle of the plate, and the rows and columns of every other piece.
  const xs = [0, ...(o.others ?? []).map((p) => p.x)]
  const zs = [0, ...(o.others ?? []).map((p) => p.z)]
  let nx = x
  let nz = z
  let caughtX = false
  let caughtZ = false
  let best = threshold
  for (const at of xs) {
    const d = Math.abs(x - at)
    if (d < best) {
      best = d
      nx = at
      caughtX = true
    }
  }
  best = threshold
  for (const at of zs) {
    const d = Math.abs(z - at)
    if (d < best) {
      best = d
      nz = at
      caughtZ = true
    }
  }
  if (caughtX) guides.push({ kind: 'axis', axis: 'x', at: nx })
  if (caughtZ) guides.push({ kind: 'axis', axis: 'z', at: nz })

  // Rings: concentric circles round the middle. Only tried when the point did not already catch on both axes,
  // since catching on both is the stronger statement.
  if (!(caughtX && caughtZ)) {
    const d = Math.hypot(nx, nz)
    let ring: number | null = null
    let nearest = threshold
    for (const r of o.rings ?? DEFAULT_RINGS) {
      const off = Math.abs(d - r)
      if (off < nearest) {
        nearest = off
        ring = r
      }
    }
    if (ring !== null && d > 1e-6) {
      nx = (nx / d) * ring
      nz = (nz / d) * ring
      guides.push({ kind: 'ring', radius: ring })
    }
  }
  return { x: nx, z: nz, guides }
}
