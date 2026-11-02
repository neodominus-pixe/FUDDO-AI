// Re-records the 3D engine's golden fingerprints (tests/unit/golden-3d.json).
//   npm run golden:update
// Only run this when the geometry is meant to change, then review the diff.
import { writeFileSync } from 'node:fs'
import { fingerprint, goldenCases } from '../tests/unit/golden-cases'

const out: Record<string, string> = {}
for (const c of goldenCases()) out[c.name] = fingerprint(c)
writeFileSync(new URL('../tests/unit/golden-3d.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log(`Recorded ${Object.keys(out).length} fingerprints.`)
