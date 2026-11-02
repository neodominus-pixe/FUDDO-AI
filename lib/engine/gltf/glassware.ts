import { quadGrid, solid, sweepInto } from './helpers'
import type { Prim } from './types'

// Drinks, in the glass they are served in. A cocktail was a flat pool on a plate; it is a glass and what is in it.
//
// Each vessel comes as a pair: the glass (thin-walled, drawn translucent) and the liquid that fills it to a little
// below the rim. The liquid is the piece that carries the drink's name and colour; the glass hangs off it, the way a
// crust hangs off a steak.
//
// All four share one box: the foot is at y = -1 and the rim is at y = 0.9, so whatever sits on the rim of one sits on
// the rim of any. They differ in how wide they are, which is what tells a tumbler from a highball from a coupe.

export type GlassKind = 'tumbler' | 'tall' | 'stemmed' | 'mug'

/** [radius, height] pairs, bottom to top; height never goes down. */
type Profile = Array<[number, number]>

// Every glass is filled to the same height, which is also where ice sits: layout/elevations.ts seats it there.
const LEVEL = 0.62

type Vessel = { outer: Profile; wall: number; floor: number; level: number }

const VESSELS: Record<GlassKind, Vessel> = {
  // A heavy-bottomed rocks glass: straight, flaring a little, a thick base.
  tumbler: { outer: [[0, -1], [0.82, -1], [0.88, -0.94], [1.0, 0.9]], wall: 0.07, floor: -0.6, level: LEVEL },
  // A highball or a shake glass: narrow, tall, thin.
  tall: { outer: [[0, -1], [0.55, -1], [0.6, -0.94], [0.74, 0.9]], wall: 0.05, floor: -0.82, level: LEVEL },
  // A coupe or a martini glass: a foot, a stem, and a bowl that opens wide.
  stemmed: {
    outer: [[0, -1], [0.5, -1], [0.48, -0.96], [0.08, -0.9], [0.065, -0.45], [0.12, -0.36], [0.4, -0.14], [0.7, 0.25], [0.92, 0.62], [1.0, 0.9]],
    wall: 0.04,
    floor: -0.3,
    level: LEVEL,
  },
  // A cup: straight-sided, and thick, with a handle added below.
  mug: { outer: [[0, -1], [0.85, -1], [0.92, -0.94], [0.95, -0.7], [0.95, 0.9]], wall: 0.07, floor: -0.75, level: LEVEL },
}

const radiusAt = (outer: Profile, y: number) => {
  for (let i = 1; i < outer.length; i++) {
    const [r0, y0] = outer[i - 1]
    const [r1, y1] = outer[i]
    if (y >= y0 && y <= y1 && y1 > y0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
  }
  return outer[outer.length - 1][0]
}

function revolve(profile: Profile, seg: number): { pos: number[]; idx: number[] } {
  const pos: number[] = []
  const idx: number[] = []
  for (const [r, y] of profile) {
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      pos.push(r * Math.cos(a), y, r * Math.sin(a))
    }
  }
  quadGrid(idx, 0, profile.length, seg + 1)
  return { pos, idx }
}

/** The glass: the outside up to the rim, then the inside back down to the floor of the well. */
export function glass(kind: GlassKind): Prim {
  const v = VESSELS[kind]
  const profile: Profile = [...v.outer]
  // The inside, walking back down: only the points above the floor, each a wall's thickness in.
  for (let i = v.outer.length - 1; i >= 0; i--) {
    const [r, y] = v.outer[i]
    if (y > v.floor) profile.push([Math.max(0.01, r - v.wall), y])
  }
  profile.push([Math.max(0.01, radiusAt(v.outer, v.floor) - v.wall), v.floor])
  profile.push([0, v.floor])
  const { pos, idx } = revolve(profile, 40)
  if (kind === 'mug') {
    // The handle: a loop standing out from the side, its ends buried in the wall.
    const path: Array<[number, number, number]> = []
    for (let i = 0; i < 14; i++) {
      const a = -1.45 + (2.9 * i) / 13
      path.push([0.8 + 0.62 * Math.cos(a), 0.55 * Math.sin(a) - 0.05, 0])
    }
    sweepInto(pos, idx, path, 0.09, { seg: 8, taper: false })
  }
  return solid(pos, idx)
}

/** What is in the glass: filled to a little below the rim, a hair inside the wall so the two never share a surface. */
export function liquidIn(kind: GlassKind): Prim {
  const v = VESSELS[kind]
  const inner = (y: number) => Math.max(0.01, radiusAt(v.outer, y) - v.wall - 0.012)
  const profile: Profile = [[0, v.floor + 0.005]]
  const rows = 6
  for (let i = 0; i <= rows; i++) {
    const y = v.floor + 0.005 + ((v.level - v.floor - 0.005) * i) / rows
    profile.push([inner(y), y])
  }
  // The surface curls up a hair against the glass, which is the one thing that tells you it is a liquid.
  profile.push([inner(v.level) * 0.9, v.level - 0.02])
  profile.push([0, v.level - 0.02])
  const { pos, idx } = revolve(profile, 40)
  return solid(pos, idx)
}

// Which glass a drink comes in, from what it is called. Hot drinks in a cup, the stemmed cocktails in a coupe, the
// long drinks and the shakes in a tall glass, and anything else over ice in a tumbler.
const ICED = /\b(iced|bubble|boba|frappe|cold brew)\b/
const STEMMED = /\b(martini|margarita|cosmopolitan|spritz|sangria|tinto de verano|champagne|prosecco|wine|coupe|daiquiri|manhattan)\b/
const MUG = /\b(espresso|latte|cappuccino|flat white|americano|mocha|hot chocolate|chai|tea|coffee|macchiato|cortado)\b/
const TALL = /\b(mojito|gin and tonic|bloody mary|lemonade|juice|kombucha|milkshake|shake|smoothie|pina colada|collins|highball|tonic|soda|beer|lager|cola|punch|mocktail|cocktail)\b/

export function vesselFor(name: string): GlassKind {
  const n = name.toLowerCase()
  if (ICED.test(n)) return 'tall'
  if (STEMMED.test(n)) return 'stemmed'
  if (MUG.test(n)) return 'mug'
  if (TALL.test(n)) return 'tall'
  return 'tumbler'
}
