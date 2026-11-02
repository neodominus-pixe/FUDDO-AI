import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fingerprint, goldenCases } from './golden-cases'

// The 3D engine's exact output, for ~130 inputs, compared with the recorded fingerprints.
// A change means the geometry changed. If that was the point, run `npm run golden:update` and review the diff.
describe('3D engine golden fingerprints', () => {
  const recorded: Record<string, string> = JSON.parse(readFileSync(new URL('./golden-3d.json', import.meta.url), 'utf8'))
  const cases = goldenCases()

  it('covers every shape family, direction, plate and sauce', () => {
    assert.ok(cases.length >= 120, `${cases.length} cases`)
    assert.deepEqual(Object.keys(recorded).sort(), cases.map((c) => c.name).sort(), 'the recorded set matches the case list')
  })

  for (const c of cases) {
    it(c.name, () => assert.equal(fingerprint(c), recorded[c.name]))
  }
})
