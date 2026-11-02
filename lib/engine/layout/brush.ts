// Free-hand sauce strokes: turning what a chef drew with the brush into something the plating can use. Everything is
// pure and works in frame coordinates (0..1 across the picture), so the picture, the model and the prompt are all
// built from the same stroke.

export type Pt = [number, number]

/** The most strokes one plating may carry, and the most points in each: a bound, so a hand-written spec cannot make the engine do unbounded work. */
export const MAX_STROKES = 8
export const MAX_STROKE_POINTS = 64

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Total length of a polyline. */
export function pathLength(pts: Pt[]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i])
  return n
}

/** Ramer–Douglas–Peucker: the fewest points that keep the shape of a drawn line to within `tolerance`. */
export function simplify(pts: Pt[], tolerance: number): Pt[] {
  if (pts.length <= 2) return pts.slice()
  const keep = new Array<boolean>(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack: Array<[number, number]> = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let far = -1
    let worst = tolerance
    const [ax, ay] = pts[a]
    const [bx, by] = pts[b]
    const len = Math.hypot(bx - ax, by - ay)
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]
      // Distance from the point to the line a–b, or to the nearer end if a and b coincide.
      const d = len < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > worst) {
        worst = d
        far = i
      }
    }
    if (far >= 0) {
      keep[far] = true
      stack.push([a, far], [far, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** Points spaced evenly along the line (`spacing` apart, at most `max` of them), always including both ends. */
export function resample(pts: Pt[], spacing: number, max = MAX_STROKE_POINTS): Pt[] {
  if (pts.length < 2) return pts.slice()
  const total = pathLength(pts)
  if (total < 1e-9) return [pts[0], pts[pts.length - 1]]
  const count = Math.max(2, Math.min(max, Math.ceil(total / Math.max(spacing, 1e-6)) + 1))
  const out: Pt[] = [pts[0]]
  let walked = 0
  let seg = 1
  for (let i = 1; i < count - 1; i++) {
    const target = (total * i) / (count - 1)
    while (seg < pts.length - 1 && walked + dist(pts[seg - 1], pts[seg]) < target) {
      walked += dist(pts[seg - 1], pts[seg])
      seg++
    }
    const a = pts[seg - 1]
    const b = pts[seg]
    const len = dist(a, b)
    const t = len < 1e-9 ? 0 : (target - walked) / len
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  out.push(pts[pts.length - 1])
  return out
}

/** How thick a stroke is along its length, 0 at the start to 1 at the end: full in the middle and fine at both ends, like a brush lifted off. */
export function brushTaper(t: number): number {
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
  return 0.22 + 0.78 * Math.pow(s, 0.55)
}

const n4 = (v: number) => v.toFixed(4)

/** A smooth SVG path through the points (Catmull–Rom turned into cubic Béziers). */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return ''
  let d = `M ${n4(pts[0][0])} ${n4(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${n4(c1[0])} ${n4(c1[1])}, ${n4(c2[0])} ${n4(c2[1])}, ${n4(p2[0])} ${n4(p2[1])}`
  }
  return d
}

/** A filled outline of the stroke with the taper applied, as an SVG path: the 2D picture of what the 3D model sweeps. */
export function ribbonOutline(pts: Pt[], halfWidth: number): string {
  if (pts.length < 2) return ''
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const nx = -(b[1] - a[1]) / len
    const ny = (b[0] - a[0]) / len
    const w = halfWidth * brushTaper(i / (pts.length - 1))
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w])
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w])
  }
  const ring = [...left, ...right.reverse()]
  return `M ${ring.map(([x, y]) => `${n4(x)} ${n4(y)}`).join(' L ')} Z`
}
