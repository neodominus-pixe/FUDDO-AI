import type { Height, PlateStyle } from '../../types'

import type { PlateGeometry } from './types'

export const PLATE_GEOMETRY: Record<PlateStyle, PlateGeometry> = {
  'round-white': { shape: 'circle', face: '#fbfbf9', rim: '#e8e6e0', rimWidth: 0.055, radius: 0.40 },
  'black-slate': { shape: 'square', face: '#2b2b2e', rim: '#1d1d20', rimWidth: 0.02, radius: 0.42 },
  'square-white': { shape: 'square', face: '#fcfcfa', rim: '#e6e4de', rimWidth: 0.04, radius: 0.40 },
  'deep-bowl': { shape: 'circle', face: '#f5f3ee', rim: '#ddd9d0', rimWidth: 0.10, radius: 0.42 },
  // A pasta or risotto bowl: wide and low, with a rolled lip, so the food is seen from above as on a plate and held as in a bowl.
  'shallow-bowl': { shape: 'circle', face: '#f7f5f0', rim: '#e0dcd3', rimWidth: 0.07, radius: 0.42 },
  'wooden-board': { shape: 'board', face: '#b98b5b', rim: '#9c7248', rimWidth: 0.015, radius: 0.44 },
  'coupe-grey': { shape: 'circle', face: '#d9d7d1', rim: '#c2bfb7', rimWidth: 0.07, radius: 0.41 },
}

// --- Build geometry -------------------------------------------------------
// How tall the plate stands. A flat overhead picture cannot show this, which is
// the whole reason the angled views and the 3D model exist. Both renderers read
// these numbers from here so they can never disagree about the same plating.

export const VERTICAL: Record<Height, number> = { flat: 0.34, low: 0.5, medium: 0.72, tall: 1.05 }

export const PLATE_THICKNESS = 0.06

// Plate outlines as [radius, height], swept around the Y axis: centre of the
// face, out over the rim, then back along the underside. This is what gives a
// coupe its wide rim and a bowl its depth instead of three identical discs --
// and, more importantly, what tells the food how high the plate is beneath it.
export const PLATE_PROFILE: Record<PlateStyle, Array<[number, number]>> = {
  'round-white': [
    [0, 0.022], [0.44, 0.020], [0.62, 0.028], [0.78, 0.062], [0.92, 0.100], [0.985, 0.110], [1.0, 0.104],
    [1.0, 0.078], [0.90, 0.050], [0.68, 0.014], [0.40, 0.004], [0.30, 0.002], [0.28, -0.010], [0, -0.010],
  ],
  // A coupe has no flat rim: a level well in the middle, then one unbroken curve that rises to a rolled lip. The well
  // is what holds the food and the sauce; the curve is what makes it look like a coupe and not a plate.
  'coupe-grey': [
    [0, 0.012], [0.44, 0.010], [0.56, 0.024], [0.68, 0.056], [0.80, 0.100], [0.90, 0.138], [0.965, 0.160], [0.995, 0.164], [1.0, 0.154],
    [1.0, 0.128], [0.94, 0.112], [0.82, 0.076], [0.66, 0.032], [0.50, 0.004], [0.30, -0.008], [0, -0.008],
  ],
  // A bowl has to be genuinely deep or it reads as a plate: rim at 0.62 against
  // a radius of 1.0, with steep walls and a small flat well at the bottom.
  'deep-bowl': [
    [0, 0.020], [0.22, 0.032], [0.42, 0.090], [0.60, 0.196], [0.76, 0.344], [0.90, 0.508], [1.0, 0.620],
    [1.0, 0.582], [0.88, 0.466], [0.72, 0.304], [0.52, 0.152], [0.32, 0.042], [0.24, 0.004], [0, 0.0],
  ],
  // About 60% of the depth of the deep bowl: a small flat well, then a wall that curves up and out to a rolled lip. Deep enough
  // that a liquid is held (liquidFill needs a wall over a quarter of the radius), shallow enough to see into from the side.
  'shallow-bowl': [
    [0, 0.020], [0.30, 0.018], [0.46, 0.034], [0.62, 0.092], [0.76, 0.180], [0.88, 0.285], [0.96, 0.350], [1.0, 0.378],
    [1.0, 0.344], [0.94, 0.300], [0.84, 0.212], [0.70, 0.110], [0.54, 0.038], [0.36, 0.004], [0.26, -0.006], [0, -0.006],
  ],
  'black-slate': [[0, 0.024], [1, 0.024]],
  'square-white': [[0, 0.024], [1, 0.024]],
  'wooden-board': [[0, 0.066], [1, 0.066]],
}

export function plateSurfaceY(style: PlateStyle, r: number) {
  const profile = PLATE_PROFILE[style]
  // The face is the leading run of the outline, before it turns back underneath.
  let end = 0
  while (end + 1 < profile.length && profile[end + 1][0] > profile[end][0]) end++
  const rr = Math.min(Math.max(r, 0), profile[end][0])
  for (let i = 0; i < end; i++) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    if (rr <= r1) {
      const t = r1 === r0 ? 0 : (rr - r0) / (r1 - r0)
      return y0 + (y1 - y0) * t
    }
  }
  return profile[end][1]
}

// How far out the plate stays flat enough to hold something. Sauce is liquid --
// it pools in the well and cannot climb a bowl's wall -- so this, not the rim,
// is the limit for anything poured. A rim plate has a wide well; a bowl narrow.
export function plateWellRadius(style: PlateStyle) {
  const base = plateSurfaceY(style, 0)
  let well = 0.3
  for (let r = 0.3; r <= 1.0; r += 0.02) {
    if (plateSurfaceY(style, r) - base > 0.025) break
    well = r
  }
  return well
}

// Height of the plate's face at a given radius (0 centre, 1 rim). Food and sauce
// sit on this, so a bowl's contents nestle into the well instead of floating at
// a fixed height and disappearing into the wall.
// Where a liquid settles in a given vessel, and how wide its surface is there.
// A soup is not a solid that keeps its own shape: it is level, and its width is
// whatever the plate's own profile is at that level. A flat plate gets a shallow
// pool, a deep bowl gets a filled bowl, from the same call.
export function liquidFill(style: PlateStyle) {
  const floor = plateSurfaceY(style, 0)
  const rim = plateSurfaceY(style, 1)
  // A vessel holds liquid if its wall stands up more than a quarter of its own
  // radius. Every plate here has a raised rim -- that lip is not a wall, and
  // measuring against it filled a dinner plate to the edge with stew.
  const held = rim - floor > 0.25
  const level = floor + (held ? (rim - floor) * 0.55 : 0.012)
  let radius = 0.5
  if (held) {
    for (let r = 1; r > 0.2; r -= 0.01) {
      if (plateSurfaceY(style, r) <= level) {
        radius = Math.min(0.86, r)
        break
      }
    }
  }
  // Thin: a soup has a surface, and any real thickness shows as a wall of jelly
  // standing above the plate.
  return { level, radius, depth: held ? 0.02 : 0.012 }
}
