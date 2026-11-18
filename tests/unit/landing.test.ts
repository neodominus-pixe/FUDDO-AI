import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CONCEPT_COUNT, PANTRY, arrange, conceptName } from '@/components/landing/plating'
import { handoffComponents, parseHandoff } from '@/lib/client/dish-handoff'
import { DIRECTIONS } from '@/lib/spec'

describe('the landing page playground', () => {
  const ids = PANTRY.map((f) => f.id)

  it('offers the studio’s own twelve directions, by name', () => {
    assert.equal(CONCEPT_COUNT, 12)
    DIRECTIONS.forEach((d, i) => assert.equal(conceptName(i), d.name))
  })

  it('puts every piece on the plate, in every direction', () => {
    for (let c = 0; c < CONCEPT_COUNT; c++) {
      const { placed } = arrange(c, ids)
      assert.deepEqual(placed.map((p) => p.id), ids)
      for (const p of placed) assert.ok(Math.hypot(p.x - 50, p.y - 50) <= 41.001, `${conceptName(c)}: ${p.id}`)
    }
  })

  it('really does plate differently from one direction to the next, and the same way each time', () => {
    const seen = new Set(Array.from({ length: CONCEPT_COUNT }, (_, c) => JSON.stringify(arrange(c, ids).placed)))
    assert.ok(seen.size >= 10, `${seen.size} distinct arrangements`)
    assert.deepEqual(arrange(3, ids), arrange(3, ids))
  })

  it('copes with an empty plate', () => {
    assert.deepEqual(arrange(0, []), { placed: [], sauce: [] })
  })
})

describe('the dish carried to the studio', () => {
  it('arrives with its name and components, the hero first', () => {
    const dish = parseHandoff(JSON.stringify({ name: ' Duck ', components: [{ name: 'Jus', role: 'sauce' }, { name: 'Duck', role: 'hero' }] }))
    assert.equal(dish?.name, 'Duck')
    assert.deepEqual(handoffComponents(dish!).map((c) => [c.id, c.name, c.role]), [['c1', 'Duck', 'hero'], ['c2', 'Jus', 'sauce']])
  })

  it('ignores anything in storage that is not a dish', () => {
    for (const raw of [null, '', 'not json', '42', '{"name":1}', '{"name":"x"}']) assert.equal(parseHandoff(raw), null, String(raw))
    assert.deepEqual(parseHandoff('{"name":"x","components":[{"name":"y","role":"chef"},null]}')?.components, [])
  })
})
