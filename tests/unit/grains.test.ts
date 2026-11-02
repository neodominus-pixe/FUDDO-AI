import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { grainHeap } from '@/lib/engine/gltf'
import { buildPlatingModel } from '@/lib/model3d'
import type { Component, Dish, PlatingSpec } from '@/lib/types'

const dish = (name: string, components: Array<[string, Component['role']]>): Dish => ({
  id: 'd',
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  components: components.map(([n, role], i) => ({ id: `c${i + 1}`, name: n, role, imagePath: null })),
})

const spec = (over: Partial<PlatingSpec> = {}): PlatingSpec => ({
  id: 'spec-1', composition: 'centered', plate: 'round-white', sauce: 'none', height: 'medium', garnish: 'moderate', notes: '', overrides: {}, seed: 1234, ...over,
})

describe('a heap of grains is made of grains', () => {
  it('stays within what a 16-bit index can address, for rice, couscous and beans alike', () => {
    for (const [name, heap] of [
      ['rice', grainHeap(101)],
      ['couscous', grainHeap(131, { count: 1300, length: 0.075, width: 0.068, rings: 4, seg: 5 })],
      ['beans', grainHeap(137, { count: 420, length: 0.115, width: 0.082, rings: 5, seg: 6, bend: 0.28 })],
    ] as const) {
      assert.ok(heap.positions.length / 3 < 65535, `${name}: ${heap.positions.length / 3} vertices`)
      assert.ok(heap.positions.length / 3 > 5000, `${name} is many pieces, not one lump`)
    }
  })

  it('fits the unit box, and is the same every time', () => {
    const a = grainHeap(101)
    let max = 0
    for (let i = 0; i < a.positions.length; i += 3) max = Math.max(max, Math.hypot(a.positions[i], a.positions[i + 2]), Math.abs(a.positions[i + 1]))
    assert.ok(max <= 1.0001)
    assert.deepEqual(Array.from(a.positions.slice(0, 60)), Array.from(grainHeap(101).positions.slice(0, 60)))
  })

  it('picks the grain from the food: rice, couscous and beans are not the same heap', () => {
    const size = (food: string) => {
      const { gltf } = buildPlatingModel(dish('Bowl', [[food, 'hero']]), spec())
      return (gltf.accessors as Array<{ count: number; type: string }>).filter((x) => x.type === 'VEC3').map((x) => x.count).sort((x, y) => y - x)[0]
    }
    const rice = size('Basmati rice')
    const couscous = size('Pearl couscous')
    const beans = size('Black beans')
    assert.ok(rice !== couscous && couscous !== beans && rice !== beans, `${rice} ${couscous} ${beans}`)
  })
})
