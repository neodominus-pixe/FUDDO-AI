import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { vesselFor } from '@/lib/engine/gltf'
import { buildPlatingModel } from '@/lib/model3d'
import { shapeFor } from '@/lib/shapes'
import { kindFor } from '@/lib/textures/procedural'
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

type Gltf = ReturnType<typeof buildPlatingModel>['gltf']
const nodeNames = (g: Gltf) => (g.nodes as Array<{ name?: string }>).map((n) => n.name ?? '')

describe('drinks come in a glass', () => {
  it('names the drinks as glass, and leaves the food that shares a word with one alone', () => {
    for (const n of ['Mojito', 'Espresso martini', 'Latte', 'Flat white', 'Hot chocolate', 'Iced tea', 'Chocolate milkshake', 'Mango smoothie', 'Kombucha', 'Bubble tea', 'Old fashioned']) {
      assert.equal(shapeFor(n, 'hero'), 'glass', n)
    }
    for (const n of ['Smoothie bowl', 'Hot chocolate fondant', 'Mocha cake', 'Green tea ice cream', 'Prawn cocktail', 'Red wine jus', 'Milk', 'Affogato']) {
      assert.notEqual(shapeFor(n, 'hero'), 'glass', n)
    }
  })

  it('is a liquid whatever it is flavoured with', () => {
    assert.equal(kindFor('Banana milkshake'), 'liquid')
    assert.equal(kindFor('Strawberry lemonade'), 'liquid')
  })

  it('picks the vessel from the drink', () => {
    assert.equal(vesselFor('Espresso martini'), 'stemmed')
    assert.equal(vesselFor('Margarita'), 'stemmed')
    assert.equal(vesselFor('Latte'), 'mug')
    assert.equal(vesselFor('Hot chocolate'), 'mug')
    assert.equal(vesselFor('Iced coffee'), 'tall')
    assert.equal(vesselFor('Mojito'), 'tall')
    assert.equal(vesselFor('Chocolate milkshake'), 'tall')
    assert.equal(vesselFor('Old fashioned'), 'tumbler')
    assert.equal(vesselFor('Negroni'), 'tumbler')
  })

  it('stands as the liquid with a clear glass hung off it', () => {
    const { gltf } = buildPlatingModel(dish('Mojito', [['Mojito', 'hero'], ['Lime wedge', 'support'], ['Mint', 'garnish']]), spec())
    const names = nodeNames(gltf)
    assert.ok(names.includes('Mojito'), 'the liquid')
    assert.ok(names.includes('Mojito glass'), 'the glass')
    const index = names.indexOf('Mojito glass')
    const material = (gltf.materials as Array<{ alphaMode?: string; doubleSided?: boolean; pbrMetallicRoughness: { baseColorFactor: number[] } }>)[
      (gltf.meshes as Array<{ primitives: Array<{ material: number }> }>)[(gltf.nodes as Array<{ mesh: number }>)[index].mesh].primitives[0].material
    ]
    assert.equal(material.alphaMode, 'BLEND')
    assert.equal(material.doubleSided, true)
    assert.ok(material.pbrMetallicRoughness.baseColorFactor[3] < 0.5, 'mostly clear')
  })

  it('keeps its proportions at every plating height, since the setting is how high a mound is piled', () => {
    const slenderness = (height: PlatingSpec['height']) => {
      const { gltf } = buildPlatingModel(dish('Mojito', [['Mojito', 'hero']]), spec({ height }))
      const scale = (gltf.nodes as Array<{ name?: string; scale?: number[] }>).find((n) => n.name === 'Mojito')!.scale!
      return scale[1] / scale[0]
    }
    assert.ok(Math.abs(slenderness('flat') - slenderness('tall')) < 1e-9)
    assert.ok(slenderness('flat') > 1, 'taller than it is wide')
  })

  it('has nothing built on top of it, and its ice in it', () => {
    const d = dish('Mojito', [['Mojito', 'hero'], ['Lime wedge', 'support'], ['Crushed ice', 'support']])
    const { gltf } = buildPlatingModel(d, spec({ composition: 'stacked-tall' }))
    const at = (name: string) => (gltf.nodes as Array<{ name?: string; translation: number[] }>).find((n) => n.name === name)!.translation
    const glass = at('Mojito')
    const ice = at('Crushed ice')
    assert.ok(Math.hypot(ice[0] - glass[0], ice[2] - glass[2]) < 0.01, 'the ice is in the glass')
    assert.ok(ice[1] > glass[1] - 1, 'and not sunk through the plate')
    // The wedge is on the plate beside it, not on top of the glass.
    const lime = at('Lime wedge')
    assert.ok(lime[1] < glass[1], 'the lime wedge is no higher than the middle of the glass')
  })
})

describe('what comes from the sea has a form of its own', () => {
  it('shapes the shellfish and the whole fish', () => {
    for (const [n, f] of [['King prawns', 'prawn'], ['Lobster tail', 'lobster'], ['Dressed crab', 'crab'], ['Whole sea bass', 'wholefish']] as const) {
      assert.equal(shapeFor(n, 'hero'), f, n)
    }
  })

  it('serves a fillet as a fillet, not as the whole animal', () => {
    assert.equal(shapeFor('Sea bass fillet', 'hero'), 'fillet')
    assert.equal(shapeFor('Salmon fillet', 'hero'), 'fillet')
  })

  it('puts the fat band on a steak as a pale piece of its own', () => {
    const { gltf } = buildPlatingModel(dish('Steak', [['Ribeye steak', 'hero']]), spec())
    assert.ok(nodeNames(gltf).includes('Ribeye steak fat'))
  })
})

describe('foods that light shines through', () => {
  it('names the yolks, honey and syrups, and nothing that only contains the letters', async () => {
    const { translucentFood } = await import('@/components/scene/look')
    for (const n of ['Egg yolk sauce', 'Egg yolk', 'Honey', 'Maple syrup', 'Golden syrup', 'Hot honey']) assert.ok(translucentFood(n), n)
    for (const n of ['Honeydew', 'Honeycomb', 'Egg noodles', 'Scrambled eggs', 'Tomato sauce', 'Chicken']) assert.ok(!translucentFood(n), n)
  })
})
