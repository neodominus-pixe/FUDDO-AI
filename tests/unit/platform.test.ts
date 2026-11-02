import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapLimit } from '@/lib/concurrency'
import { sniffImage } from '@/lib/image-sniff'
import { memoryLimiter } from '@/lib/backend/limiter'
import { sessionCookie, REMEMBER_SECONDS } from '@/lib/backend/cookies'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/policy'
import { CreateProjectSchema, DishSchema, PatchProjectSchema, PlatingSpecSchema, ReviewSchema, SigninSchema, SignupSchema } from '@/lib/schemas'

const goodSpec = { id: 's1', composition: 'centered', plate: 'round-white', sauce: 'pooled', height: 'medium', garnish: 'moderate', notes: '', overrides: {}, seed: 5 }
const goodDish = { id: 'd', name: 'Duck', components: [{ id: 'c1', name: 'Duck', role: 'hero', imagePath: null }], createdAt: '2026-01-01' }

describe('sign-up and sign-in schemas', () => {
  it('enforces the password policy on sign-up but never on sign-in', () => {
    const base = { name: 'A', email: 'a@b.co' }
    assert.ok(!SignupSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MIN - 1) }).success)
    assert.ok(SignupSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MIN) }).success)
    assert.ok(SignupSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MAX) }).success)
    assert.ok(!SignupSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MAX + 1) }).success)
    assert.ok(SigninSchema.safeParse({ email: 'a@b.co', password: 'short' }).success, 'an old short password gets "incorrect", not a policy hint')
    assert.ok(!SigninSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(PASSWORD_MAX + 1) }).success, 'but a huge one is refused before hashing')
  })

  it('normalises emails and rejects junk', () => {
    const p = SignupSchema.parse({ name: ' Alex ', email: '  Alex@Example.COM ', password: 'x'.repeat(12) })
    assert.equal(p.email, 'alex@example.com')
    assert.equal(p.name, 'Alex')
    for (const email of ['', 'no-at', 'a@', '@b.co', 'a b@c.co', 'x'.repeat(250) + '@b.co']) {
      assert.ok(!SigninSchema.safeParse({ email, password: 'x' }).success, email)
    }
  })
})

describe('dish and spec schemas', () => {
  it('accepts a normal dish and spec', () => {
    assert.ok(DishSchema.safeParse(goodDish).success)
    assert.ok(PlatingSpecSchema.safeParse(goodSpec).success)
  })

  it('rejects photo addresses that are not http(s)', () => {
    for (const imagePath of ['javascript:alert(1)', 'data:text/html;base64,AAAA', '/etc/passwd', '../../secret', 'file:///c:/x', '//evil.example/x.png']) {
      assert.ok(!DishSchema.safeParse({ ...goodDish, components: [{ ...goodDish.components[0], imagePath }] }).success, imagePath)
    }
    assert.ok(DishSchema.safeParse({ ...goodDish, components: [{ ...goodDish.components[0], imagePath: 'https://x.supabase.co/storage/v1/object/public/media/u/p.png' }] }).success)
  })

  it('accepts a scene style, and refuses one that names a table, a prop or a light that does not exist', () => {
    const scene = { table: 'marble', props: 'both', light: 'moody', focus: true }
    assert.ok(PlatingSpecSchema.safeParse({ ...goodSpec, scene }).success)
    assert.ok(PlatingSpecSchema.safeParse({ ...goodSpec, scene: {} }).success)
    for (const bad of [{ table: 'lava' }, { props: 'candles' }, { light: 'strobe' }, { focus: 'yes' }]) {
      assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, scene: bad }).success, JSON.stringify(bad))
    }
  })

  it('bounds everything a hand-written row could inflate', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, name: 'x', role: 'hero', imagePath: null }))
    assert.ok(!DishSchema.safeParse({ ...goodDish, components: many }).success)
    assert.ok(!DishSchema.safeParse({ ...goodDish, name: 'n'.repeat(121) }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, notes: 'n'.repeat(501) }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, seed: -1 }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, seed: 2 ** 32 }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, seed: 1.5 }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, overrides: { a: { x: 99, y: 0 } } }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, tweaks: { a: { s: 50 } } }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, tweaks: { a: { c: 'red' } } }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, tweaks: { a: { c: '#12345' } } }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, copies: { c1: 99 } }).success)
    assert.ok(!PlatingSpecSchema.safeParse({ ...goodSpec, composition: 'made-up' }).success)
    assert.ok(!CreateProjectSchema.safeParse({ dish: goodDish, spread: Array.from({ length: 25 }, () => ({ name: 'x', spec: goodSpec })) }).success)
  })

  it('lets owners patch the dish and spread only', () => {
    const p = PatchProjectSchema.parse({ dish: goodDish, ownerId: 'someone-else', shareId: 'mine', review: { comment: 'forged' } })
    assert.deepEqual(Object.keys(p), ['dish'], 'ownership, share link and review are stripped, not honoured')
  })

  it('cleans review answers', () => {
    const r = ReviewSchema.parse({ reviewer: '  Sam  ', comment: '  nice  ' })
    assert.deepEqual(r, { reviewer: 'Sam', pickedSpecId: null, comment: 'nice' })
    assert.ok(!ReviewSchema.safeParse({ comment: 'x'.repeat(2001) }).success)
    assert.ok(!ReviewSchema.safeParse({ reviewer: 'x'.repeat(81) }).success)
  })
})

describe('image sniffing', () => {
  const bytes = (...b: number[]) => Uint8Array.from(b)
  it('recognises real formats by their bytes', () => {
    assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)), 'image/jpeg')
    assert.equal(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)), 'image/png')
    assert.equal(sniffImage(Uint8Array.from([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBPVP8 ')])), 'image/webp')
  })
  it('refuses everything else, whatever it claims to be', () => {
    assert.equal(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>')), null)
    assert.equal(sniffImage(new TextEncoder().encode('GIF89a......')), null)
    assert.equal(sniffImage(new TextEncoder().encode('<script>alert(1)</script>')), null)
    assert.equal(sniffImage(bytes()), null)
    assert.equal(sniffImage(bytes(0xff, 0xd8)), null)
  })
})

describe('mapLimit', () => {
  it('keeps order, respects the concurrency cap and propagates errors', async () => {
    let running = 0
    let peak = 0
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, n))
      running--
      return n * 2
    })
    assert.deepEqual(out, [10, 2, 8, 4, 6, 12, 14])
    assert.ok(peak <= 3 && peak > 1)
    await assert.rejects(mapLimit([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('boom'); return n }), /boom/)
    assert.deepEqual(await mapLimit([], 4, async (n) => n), [])
  })
})

describe('in-process rate limiter', () => {
  it('treats the limit as a budget, resets after the window, and clears', async () => {
    let now = 1_000
    const l = memoryLimiter(() => now)
    assert.equal(await l.isLimited('k', 3), false)
    assert.equal(await l.hit('k', 3, 1000), false) // 1
    assert.equal(await l.hit('k', 3, 1000), false) // 2
    assert.equal(await l.isLimited('k', 3), false)
    assert.equal(await l.hit('k', 3, 1000), false) // 3: at budget, not over
    assert.equal(await l.isLimited('k', 3), true, 'budget used up')
    assert.equal(await l.hit('k', 3, 1000), true, 'the next hit is over budget')
    now += 1001
    assert.equal(await l.isLimited('k', 3), false, 'window expired')
    assert.equal(await l.hit('k', 3, 1000), false)
    await l.clear('k')
    assert.equal(await l.isLimited('k', 1), false)
  })

  it('counts a weighted hit (one spread = twelve images)', async () => {
    const l = memoryLimiter(() => 0)
    assert.equal(await l.hit('gen', 20, 1000, 12), false)
    assert.equal(await l.hit('gen', 20, 1000, 12), true)
  })

  it('keeps keys independent', async () => {
    const l = memoryLimiter(() => 0)
    for (let i = 0; i < 5; i++) await l.hit('a', 2, 1000)
    assert.equal(await l.isLimited('a', 2), true)
    assert.equal(await l.isLimited('b', 2), false)
  })
})

describe('session cookie policy', () => {
  it('is HttpOnly and lax, lasts 30 days only when remembered, and never outlives a delete', () => {
    const forever = { maxAge: 400 * 86400, expires: new Date(), path: '/x', domain: 'evil.example' }
    const remembered = sessionCookie(forever, 'token', true)
    assert.equal(remembered.httpOnly, true)
    assert.equal(remembered.sameSite, 'lax')
    assert.equal(remembered.maxAge, REMEMBER_SECONDS)
    const session = sessionCookie(forever, 'token', false)
    assert.equal('maxAge' in session, false)
    assert.equal('expires' in session, false)
    const removed = sessionCookie({ maxAge: 0 }, '', false)
    assert.equal(removed.maxAge, 0)
    assert.equal(sessionCookie({ maxAge: 0 }, 'x', true).maxAge, 0, 'deleting keeps maxAge 0 even when remembered')
  })
})
