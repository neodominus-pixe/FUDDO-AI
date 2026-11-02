import { createHash } from 'node:crypto'
import { buildPlatingModel } from '@/lib/model3d'
import { SHAPE_ORDER } from '@/lib/shapes'
import { buildSpread } from '@/lib/spec'
import type { Component, Dish, PlatingSpec } from '@/lib/types'

// The 3D engine's output for a fixed set of inputs, reduced to short fingerprints. A refactor that changes
// even one vertex changes a fingerprint; a deliberate improvement updates them with `npm run golden:update`.

const dish = (name: string, components: Array<[string, Component['role']]>): Dish => ({
  id: 'd',
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  components: components.map(([n, role], i) => ({ id: `c${i + 1}`, name: n, role, imagePath: null })),
})

const DUCK = dish('Duck', [['Seared duck breast', 'hero'], ['Celeriac puree', 'support'], ['Charred baby leek', 'support'], ['Red wine jus', 'sauce'], ['Micro chervil', 'garnish']])
const BURGER = dish('Burger', [['Brioche bun', 'support'], ['Beef patty', 'hero'], ['Cheddar', 'support'], ['Tomato', 'support'], ['Lettuce', 'garnish']])
const PASTA = dish('Pasta', [['Tagliatelle', 'hero'], ['Ragu', 'sauce'], ['Parmesan', 'garnish']])
const TEST = dish('Test', [['Test food', 'hero'], ['Test sauce', 'sauce'], ['Test garnish', 'garnish']])

const base: PlatingSpec = {
  id: 'spec-1', composition: 'centered', plate: 'round-white', sauce: 'pooled', height: 'medium', garnish: 'moderate', notes: '', overrides: {}, seed: 1234,
}

export type GoldenCase = { name: string; dish: Dish; spec: PlatingSpec }

export function goldenCases(): GoldenCase[] {
  const out: GoldenCase[] = []

  // Every shape family, as the main component (c1) and as the garnish (c3).
  SHAPE_ORDER.forEach((family, v) => {
    out.push({ name: `family/${family}/hero`, dish: TEST, spec: { ...base, tweaks: { 'c1:0': { v } } } })
    out.push({ name: `family/${family}/garnish`, dish: TEST, spec: { ...base, tweaks: { 'c3:0': { v } } } })
  })

  // All twelve directions, three different dishes.
  for (const [dishName, d] of [['duck', DUCK], ['burger', BURGER], ['pasta', PASTA]] as const) {
    buildSpread(12, 20260930).forEach(({ name, spec }) => out.push({ name: `direction/${dishName}/${name}`, dish: d, spec }))
  }

  // Every plate with every sauce style.
  for (const plate of ['round-white', 'black-slate', 'square-white', 'deep-bowl', 'shallow-bowl', 'wooden-board', 'coupe-grey'] as const) {
    for (const sauce of ['pooled', 'dotted', 'drizzled', 'smeared', 'aside', 'none'] as const) {
      out.push({ name: `plate/${plate}/${sauce}`, dish: DUCK, spec: { ...base, plate, sauce } })
    }
  }

  // Chef edits: moved, resized, recoloured, hidden, duplicated.
  out.push({
    name: 'edits/duck',
    dish: DUCK,
    spec: {
      ...base,
      overrides: { 'c1:0': { x: 0.4, y: 0.55 }, sauce: { x: 0.6, y: 0.5 } },
      tweaks: { 'c1:0': { s: 1.3, h: 0.8, r: 40, c: '#7a3a2a' }, 'c3:0': { hidden: true } },
      copies: { c2: 2 },
    },
  })
  return out
}

export function fingerprint(c: GoldenCase): string {
  return createHash('sha256').update(JSON.stringify(buildPlatingModel(c.dish, c.spec).gltf)).digest('hex').slice(0, 16)
}
