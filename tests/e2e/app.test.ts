import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { BASE, PASSWORD, PNG, Session, resetSignupThrottle, sampleDish, signUp, uniqueEmail } from './helpers'

// End-to-end against a running app (E2E_BASE_URL, default http://localhost:3111) wired to a local Supabase.
// Everything goes through the real HTTP API with real cookies.

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const service = () => createClient(SB_URL, SERVICE, { auth: { persistSession: false } })

let up = false
before(async () => {
  try {
    up = (await fetch(BASE + '/api/auth/me')).ok
  } catch {
    up = false
  }
})
const suite = (name: string, fn: () => void) => describe(name, { skip: process.env.E2E === '0' }, fn)

suite('authentication', () => {
  it('creates an account, sets an HttpOnly session cookie, and reports who is signed in', async () => {
    assert.ok(up, `the app must be running at ${BASE}`)
    await resetSignupThrottle()
    const s = new Session()
    const email = uniqueEmail()
    const res = await s.post('/api/auth/signup', { name: 'First Chef', email, password: PASSWORD })
    assert.equal(res.status, 201)
    assert.equal(res.data.user.email, email)
    assert.equal(res.data.user.role, 'user')
    assert.ok(!JSON.stringify(res.data).includes(PASSWORD))

    const auth = s.lastSetCookie.filter((c) => c.startsWith('sb-'))
    assert.ok(auth.length > 0, 'a Supabase session cookie is set')
    for (const c of auth) {
      assert.match(c, /HttpOnly/i)
      assert.match(c, /SameSite=Lax/i)
      assert.doesNotMatch(c, /Max-Age=\d{4,}|Expires=/i, 'without "remember me" the cookie ends with the browser session')
    }

    const me = await s.get('/api/auth/me')
    assert.equal(me.data.user.email, email)
  })

  it('remembers the session for 30 days only when asked', async () => {
    await resetSignupThrottle()
    const s = new Session()
    const email = uniqueEmail()
    await s.post('/api/auth/signup', { name: 'Remembered', email, password: PASSWORD })
    const out = new Session()
    const res = await out.post('/api/auth/signin', { email, password: PASSWORD, remember: true })
    assert.equal(res.status, 200)
    const auth = out.lastSetCookie.filter((c) => c.startsWith('sb-'))
    assert.ok(auth.length > 0)
    for (const c of auth) assert.match(c, /Max-Age=2592000/i)
  })

  it('rejects weak passwords, bad emails and oversized input with clear errors', async () => {
    const s = new Session()
    const short = await s.post('/api/auth/signup', { name: 'X', email: uniqueEmail(), password: 'short' })
    assert.equal(short.status, 400)
    assert.match(short.data.error, /12/)
    assert.equal((await s.post('/api/auth/signup', { name: 'X', email: 'not-an-email', password: PASSWORD })).status, 400)
    assert.equal((await s.post('/api/auth/signup', { name: 'x'.repeat(101), email: uniqueEmail(), password: PASSWORD })).status, 400)
    assert.equal((await s.post('/api/auth/signup', { name: 'X', email: uniqueEmail(), password: 'p'.repeat(129) })).status, 400)
  })

  it('does not reveal whether an email is registered', async () => {
    const { email } = await signUp()
    await resetSignupThrottle()
    const dup = await new Session().post('/api/auth/signup', { name: 'Again', email, password: PASSWORD })
    assert.equal(dup.status, 409)
    assert.match(dup.data.error, /Unable to create this account/)
    const wrongPassword = await new Session().post('/api/auth/signin', { email, password: 'wrong-password-123' })
    const unknown = await new Session().post('/api/auth/signin', { email: uniqueEmail(), password: 'wrong-password-123' })
    assert.equal(wrongPassword.status, 401)
    assert.equal(unknown.status, 401)
    assert.equal(wrongPassword.data.error, unknown.data.error, 'identical message for both')
  })

  it('refuses state-changing requests without a matching Origin', async () => {
    const s = new Session()
    const noOrigin = await s.request('/api/auth/signin', { method: 'POST', json: { email: uniqueEmail(), password: 'x' }, origin: null })
    assert.equal(noOrigin.status, 403)
    const foreign = await s.post('/api/auth/signin', { email: uniqueEmail(), password: 'x' }, { origin: 'https://evil.example' })
    assert.equal(foreign.status, 403)
  })

  it('locks out only the guesser, not the account’s owner on another connection', async () => {
    const { email } = await signUp()
    await resetSignupThrottle()
    const attacker = new Session()
    let last = 0
    for (let i = 0; i < 9; i++) last = (await attacker.post('/api/auth/signin', { email, password: `wrong-guess-${i}-xxxxx` })).status
    assert.equal(last, 429, 'the eighth failure from one address on one account is throttled')
    const retry = await attacker.post('/api/auth/signin', { email, password: PASSWORD })
    assert.equal(retry.status, 429)
    assert.ok(retry.headers.get('retry-after'))
    // Other accounts are untouched by this address's failures on this one...
    const { email: other } = await signUp()
    assert.equal((await new Session().post('/api/auth/signin', { email: other, password: PASSWORD })).status, 200)
  })

  it('caps sign-ups per address', async () => {
    await resetSignupThrottle()
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await new Session().post('/api/auth/signup', { name: 'Burst', email: uniqueEmail(), password: PASSWORD })).status)
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(201))
    assert.equal(statuses[10], 429)
    await resetSignupThrottle()
  })

  it('signs out for real: the old cookie stops working', async () => {
    const { s } = await signUp()
    const stolen = new Map(s.cookies)
    assert.equal((await s.post('/api/auth/signout', {})).status, 200)
    assert.equal((await s.get('/api/auth/me')).data.user, null)
    const replay = new Session()
    replay.cookies = stolen
    assert.equal((await replay.get('/api/auth/me')).data.user, null, 'a copied session cookie is dead after sign-out')
  })

  it('guards the signed-in pages and the APIs', async () => {
    const anon = new Session()
    for (const path of ['/studio', '/admin']) {
      const res = await anon.get(path)
      assert.ok([302, 303, 307, 308].includes(res.status), `${path} redirects`)
      assert.match(res.headers.get('location') ?? '', /\/auth\?next=/)
    }
    assert.equal((await anon.get('/api/projects')).status, 401)
    assert.equal((await anon.post('/api/generate', { dish: sampleDish() })).status, 401)
    assert.equal((await anon.request('/api/upload', { method: 'POST' })).status, 401)
  })
})

const MAIL = process.env.E2E_MAIL_URL ?? 'http://127.0.0.1:55324'

/** The newest message sent to an address, from the local mail catcher (Mailpit). */
async function waitForMail(to: string, timeoutMs = 10_000): Promise<{ text: string; html: string } | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const list = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as { messages?: Array<{ ID: string }> }
    const id = list.messages?.[0]?.ID
    if (id) {
      const m = (await (await fetch(`${MAIL}/api/v1/message/${id}`)).json()) as { Text: string; HTML: string }
      return { text: m.Text, html: m.HTML }
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}
const mailCount = async (to: string) =>
  ((await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as { messages?: unknown[] }).messages?.length ?? 0

suite('password recovery', () => {
  it('lets someone who forgot their password choose a new one, and revokes every other session', async () => {
    const { s: original, email } = await signUp('Forgetful Chef')
    const browser = new Session() // a fresh browser: the one that asks for the link is the one that uses it

    const asked = await browser.post('/api/auth/forgot', { email })
    assert.equal(asked.status, 200)
    assert.match(asked.data.message, /If that address has an account/)

    const mail = await waitForMail(email)
    assert.ok(mail, 'a reset email arrived')
    const link = mail.text.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/)?.[0]?.replace(/[)>\].,]+$/, '')
    assert.ok(link, 'the email contains a reset link')

    // The link goes through Supabase, which redirects to our confirm route with a one-time code.
    const verified = await browser.request(link)
    const location = verified.headers.get('location') ?? ''
    assert.match(location, /\/auth\/confirm\?code=/)
    const confirmPath = location.replace(/^https?:\/\/[^/]+/, '')

    const confirmed = await browser.get(confirmPath)
    assert.ok([302, 303, 307].includes(confirmed.status))
    assert.match(confirmed.headers.get('location') ?? '', /\/auth\/reset$/)
    assert.match((await browser.get('/auth/reset')).text, /Choose a new password/)

    // A weak replacement is refused; a good one is accepted.
    assert.equal((await browser.post('/api/auth/reset', { password: 'short' })).status, 400)
    const NEW = 'a-completely-new-password-77'
    assert.equal((await browser.post('/api/auth/reset', { password: NEW })).status, 200)

    assert.equal((await new Session().post('/api/auth/signin', { email, password: PASSWORD })).status, 401, 'old password no longer works')
    assert.equal((await new Session().post('/api/auth/signin', { email, password: NEW })).status, 200, 'new password works')
    assert.equal((await original.get('/api/auth/me')).data.user, null, 'the session from before the reset was ended')
    assert.equal((await browser.get('/api/auth/me')).data.user.email, email, 'this browser stays signed in')

    // The link is single use.
    const replay = await new Session().get(confirmPath)
    assert.match(replay.headers.get('location') ?? '', /\/auth\?mode=forgot&error=link/)
  })

  it('does not reveal which addresses have accounts, and only sends a few emails per address', async () => {
    const { email } = await signUp('Real Account')
    const stranger = uniqueEmail()
    const a = await new Session().post('/api/auth/forgot', { email })
    const b = await new Session().post('/api/auth/forgot', { email: stranger })
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.deepEqual(a.data, b.data, 'identical answer whether or not the account exists')
    assert.ok(await waitForMail(email))
    await new Promise((r) => setTimeout(r, 800))
    assert.equal(await mailCount(stranger), 0, 'nothing is sent to an unknown address')

    for (let i = 0; i < 4; i++) await new Session().post('/api/auth/forgot', { email })
    await new Promise((r) => setTimeout(r, 1500))
    assert.ok((await mailCount(email)) <= 3, 'a mailbox cannot be flooded through this form')
    assert.equal((await new Session().post('/api/auth/forgot', { email: 'not-an-email' })).status, 200, 'even nonsense gets the same answer')
  })

  it('refuses a reset without a valid link, and junk codes', async () => {
    const s = new Session()
    assert.equal((await s.post('/api/auth/reset', { password: 'a-perfectly-fine-password-1' })).status, 401)
    const noCode = await s.get('/auth/confirm')
    assert.match(noCode.headers.get('location') ?? '', /error=link/)
    const junk = await s.get('/auth/confirm?code=not-a-real-code')
    assert.match(junk.headers.get('location') ?? '', /error=link/)
    const page = await s.get('/auth/reset')
    assert.match(page.headers.get('location') ?? '', /\/auth\?mode=forgot/)
  })
})

suite('projects, sharing and review', () => {
  it('runs the whole chef → consultant loop', async () => {
    const { s } = await signUp('Chef Owner')

    const gen = await s.post('/api/generate', { dish: sampleDish() })
    assert.equal(gen.status, 200)
    assert.equal(gen.data.renders.length, 12)
    assert.equal(gen.data.provider, 'mock')
    assert.ok(gen.data.renders.every((r: { svg: string | null }) => r.svg?.startsWith('<svg')))

    const spread = gen.data.renders.map((r: { name: string; spec: unknown }) => ({ name: r.name, spec: r.spec }))
    const created = await s.post('/api/projects', { dish: sampleDish(), spread })
    assert.equal(created.status, 201)
    const { id, shareId } = created.data
    assert.ok(shareId.length >= 12)

    // The owner can open it.
    const opened = await s.get(`/api/projects/${id}?meta=1`)
    assert.equal(opened.data.project.dish.name, sampleDish().name)

    // A consultant, with no account at all, can review it.
    const consultant = new Session()
    const view = await consultant.get(`/api/review/${shareId}`)
    assert.equal(view.status, 200)
    assert.equal(view.data.renders.length, 12)
    assert.equal(view.data.dishName, sampleDish().name)
    assert.deepEqual(view.data.components.map((c: { id: string }) => c.id), sampleDish().components.map((c) => c.id), 'the page can draw each plating exactly as the chef left it')
    assert.ok(!JSON.stringify(view.data).includes('owner'), 'the share view exposes no owner')

    // ...including the 3D view: it must not depend on being signed in (the chef's own /api/model does).
    const model = await consultant.get(`/api/review/${shareId}/model?spec=${spread[0].spec.id}`)
    assert.equal(model.status, 200)
    assert.ok(model.data.gltf?.asset, 'a real glTF document')
    assert.ok(model.data.parts > 3)
    assert.equal((await consultant.get(`/api/review/${shareId}/model?spec=not-a-plating`)).status, 404)
    assert.equal((await consultant.get(`/api/review/no-such-link-at-all/model?spec=${spread[0].spec.id}`)).status, 404)
    assert.equal((await consultant.post('/api/model', { dish: sampleDish(), spec: spread[0].spec })).status, 401)

    const pick = spread[3].spec.id
    const answer = await consultant.post(`/api/review/${shareId}`, { reviewer: 'Consultant', pickedSpecId: pick, comment: 'This one.' })
    assert.equal(answer.status, 200)
    assert.equal(answer.data.review.pickedSpecId, pick)

    // Opening the link was counted, and the chef's own project JSON is unchanged by it.
    const views = await createClient(SB_URL, SERVICE, { auth: { persistSession: false } }).from('projects').select('view_count').eq('id', id).single()
    assert.ok((views.data?.view_count ?? 0) >= 1, 'the consultant’s visit was counted')

    // The chef sees the answer.
    const after = await s.get(`/api/projects/${id}?meta=1`)
    assert.equal(after.data.project.review.pickedSpecId, pick)
    assert.equal(after.data.project.review.comment, 'This one.')

    // The spec card resolves to the picked plating.
    const card = await s.get(`/api/card/${id}`)
    assert.equal(card.status, 200)
    assert.equal(card.data.isProvisional, false)
    assert.equal(card.data.spec.id, pick)
    assert.ok(card.data.gltf?.asset)

    // Refining writes back, and the pick survives while its plating exists.
    const refined = { ...spread[3].spec, notes: 'more sauce' }
    const patched = await s.patch(`/api/projects/${id}`, { dish: sampleDish(), spread: spread.map((e: { spec: { id: string } }, i: number) => (i === 3 ? { ...e, spec: refined } : e)) })
    assert.equal(patched.status, 200)
    assert.equal(patched.data.project.review.pickedSpecId, pick)

    // Removing the picked plating drops the stale pick.
    const trimmed = await s.patch(`/api/projects/${id}`, { spread: spread.filter((_: unknown, i: number) => i !== 3) })
    assert.equal(trimmed.data.project.review.pickedSpecId, null)

    // Deleting removes the share link too.
    assert.equal((await s.delete(`/api/projects/${id}`)).status, 200)
    assert.equal((await consultant.get(`/api/review/${shareId}`)).status, 404)
  })

  it('keeps projects private to their owner', async () => {
    const a = await signUp('Alice')
    const b = await signUp('Bob')
    const gen = await a.s.post('/api/generate', { dish: sampleDish(), count: 2 })
    const spread = gen.data.renders.map((r: { name: string; spec: unknown }) => ({ name: r.name, spec: r.spec }))
    const { id } = (await a.s.post('/api/projects', { dish: sampleDish(), spread })).data

    assert.equal((await b.s.get(`/api/projects/${id}`)).status, 404)
    assert.equal((await b.s.get(`/api/card/${id}`)).status, 404)
    assert.equal((await b.s.patch(`/api/projects/${id}`, { dish: { ...sampleDish(), name: 'Bob was here' } })).status, 404)
    assert.equal((await b.s.delete(`/api/projects/${id}`)).status, 404)
    assert.deepEqual((await b.s.get('/api/projects')).data.projects, [])
    assert.equal((await a.s.get('/api/projects')).data.projects.length, 1)
  })

  it('will not let an owner reassign a project or pick their own share link through the API', async () => {
    const a = await signUp('Alice')
    const b = await signUp('Bob')
    const gen = await a.s.post('/api/generate', { dish: sampleDish(), count: 2 })
    const spread = gen.data.renders.map((r: { name: string; spec: unknown }) => ({ name: r.name, spec: r.spec }))
    const { id, shareId } = (await a.s.post('/api/projects', { dish: sampleDish(), spread })).data
    const res = await a.s.patch(`/api/projects/${id}`, { ownerId: b.id, shareId: 'guessable-share-link', review: { reviewer: 'forged', pickedSpecId: spread[0].spec.id, comment: 'forged', reviewedAt: '2026-01-01T00:00:00Z' } })
    assert.equal(res.status, 200)
    const after = (await a.s.get(`/api/projects/${id}?meta=1`)).data.project
    assert.equal(after.shareId, shareId)
    assert.equal(after.review.reviewer, '')
    assert.deepEqual((await b.s.get('/api/projects')).data.projects, [])
  })

  it('validates review answers and throttles a hammered link', async () => {
    const { s } = await signUp()
    const gen = await s.post('/api/generate', { dish: sampleDish(), count: 2 })
    const spread = gen.data.renders.map((r: { name: string; spec: unknown }) => ({ name: r.name, spec: r.spec }))
    const { shareId } = (await s.post('/api/projects', { dish: sampleDish(), spread })).data
    const c = new Session()
    assert.equal((await c.post(`/api/review/${shareId}`, { pickedSpecId: 'not-in-this-spread' })).status, 400)
    assert.equal((await c.post(`/api/review/${shareId}`, { comment: 'x'.repeat(2001) })).status, 400)
    assert.equal((await c.post('/api/review/no-such-link-at-all', { comment: 'hi' })).status, 404)
    assert.equal((await c.post(`/api/review/${shareId}`, { comment: 'hi' }, { origin: 'https://evil.example' })).status, 403)
    let limited = 0
    for (let i = 0; i < 25; i++) if ((await c.post(`/api/review/${shareId}`, { comment: `n${i}` })).status === 429) limited++
    assert.ok(limited > 0, 'one connection cannot flood a link')
  })

  it('rejects hostile dish and spec payloads', async () => {
    const { s } = await signUp()
    const bad = (dish: unknown) => s.post('/api/generate', { dish })
    assert.equal((await bad({ ...sampleDish(), name: '' })).status, 400)
    assert.equal((await bad({ ...sampleDish(), components: [] })).status, 400)
    assert.equal((await bad({ ...sampleDish(), components: Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, name: 'x', role: 'hero', imagePath: null })) })).status, 400)
    assert.equal((await bad({ ...sampleDish(), components: [{ id: 'c1', name: 'x', role: 'hero', imagePath: 'javascript:alert(1)' }] })).status, 400)
    assert.equal((await s.post('/api/render', { dish: sampleDish(), spec: { nonsense: true } })).status, 400)
    assert.equal((await s.post('/api/generate', { dish: sampleDish(), count: 9999 })).status, 400)
    const huge = await s.request('/api/generate', { method: 'POST', body: JSON.stringify({ dish: sampleDish(), pad: 'x'.repeat(600_000) }), headers: { 'content-type': 'application/json' } })
    assert.equal(huge.status, 413)
  })
})

suite('uploads', () => {
  it('stores a real photo in the user’s own folder and serves it back', async () => {
    const { s, id } = await signUp()
    const form = new FormData()
    form.append('file', new File([PNG as unknown as BlobPart], 'photo.png', { type: 'image/png' }))
    const res = await s.request('/api/upload', { method: 'POST', body: form, origin: BASE })
    assert.equal(res.status, 201)
    assert.match(res.data.path, new RegExp(`/storage/v1/object/public/media/${id}/[0-9a-f-]+\\.png$`))
    const img = await fetch(res.data.path)
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/png')
  })

  it('checks what the bytes are, not what the browser claims', async () => {
    const { s } = await signUp()
    const send = (bytes: Uint8Array, type: string) => {
      const form = new FormData()
      form.append('file', new File([bytes as unknown as BlobPart], 'x.png', { type }))
      return s.request('/api/upload', { method: 'POST', body: form, origin: BASE })
    }
    assert.equal((await send(new TextEncoder().encode('<script>alert(1)</script>'), 'image/png')).status, 415)
    assert.equal((await send(new TextEncoder().encode('GIF89a not allowed'), 'image/gif')).status, 415)
    assert.equal((await s.request('/api/upload', { method: 'POST', body: new FormData(), origin: BASE })).status, 400)
  })
})

suite('ingredient textures', () => {
  // The makers share one allowance (a free image key has only a few a minute), so each test starts from a clean one.
  const resetAllowance = async (userId?: string) => {
    await service().rpc('clear_rate_limit', { p_key: 'textures:all' })
    if (userId) await service().rpc('clear_rate_limit', { p_key: `textures:user:${userId}` })
  }
  const unique = () => `test ingredient ${uniqueEmail().slice(4, 12)}`

  it('is readable by anyone, and only a signed-in chef can make one', async () => {
    await resetAllowance()
    const name = unique()
    const anon = new Session()
    const before = await anon.get(`/api/ingredients/textures?names=${encodeURIComponent(name)}`)
    assert.equal(before.status, 200)
    assert.deepEqual(before.data.textures, {}, 'nothing is made by looking')

    assert.equal((await anon.post('/api/ingredients/textures', { name })).status, 401)
    const { s } = await signUp()
    assert.equal((await s.post('/api/ingredients/textures', { name }, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await s.post('/api/ingredients/textures', { name: '   ' })).status, 400)
    assert.equal((await s.post('/api/ingredients/textures', { name: 'x'.repeat(500) })).status, 400)
  })

  it('makes a texture once, stores it publicly, and shares it however the name is typed', async () => {
    const a = await signUp('Chef A')
    await resetAllowance(a.id)
    const name = unique()
    const made = await a.s.post('/api/ingredients/textures', { name })
    assert.equal(made.status, 200, made.text)
    assert.equal(made.data.texture.status, 'ready')
    assert.match(made.data.texture.url, /\/storage\/v1\/object\/public\/media\/ingredients\/.+\.png$/)
    const img = await fetch(made.data.texture.url)
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/png')

    // Another chef, another spelling: the same picture, nothing made.
    const b = await signUp('Chef B')
    const again = await b.s.post('/api/ingredients/textures', { name: `  ${name.toUpperCase()}!  ` })
    assert.equal(again.data.texture.url, made.data.texture.url)

    // A review link has no account and can still read it.
    const read = await new Session().get(`/api/ingredients/textures?names=${encodeURIComponent(name)}`)
    const entry = Object.values(read.data.textures)[0] as { status: string; url: string }
    assert.equal(entry.status, 'ready')
    assert.equal(entry.url, made.data.texture.url)

    const { data } = await service().from('ingredient_textures').select('key').ilike('name', `%${name.slice(0, 20)}%`)
    assert.equal(data?.length, 1, 'exactly one texture exists')
  })

  it('makes one texture when several chefs ask for the same new ingredient at once', async () => {
    const chefs = await Promise.all([signUp('C1'), signUp('C2'), signUp('C3')])
    await resetAllowance()
    const name = unique()
    const answers = await Promise.all(chefs.map((c) => c.s.post('/api/ingredients/textures', { name })))
    for (const a of answers) assert.equal(a.status, 200, a.text)
    assert.ok(answers.every((a) => ['ready', 'pending'].includes(a.data.texture.status)))
    const rows = (await service().from('ingredient_textures').select('key, path').ilike('name', `%${name.slice(0, 20)}%`)).data ?? []
    assert.equal(rows.length, 1)
    const urls = new Set(answers.map((a) => a.data.texture.url).filter(Boolean))
    assert.ok(urls.size <= 1, 'whoever got a picture got the same one')
  })

  it('stops at the shared allowance, and says when to come back', async () => {
    const { s, id } = await signUp()
    await resetAllowance(id)
    let refused = null as null | Awaited<ReturnType<typeof s.post>>
    for (let i = 0; i < 9 && !refused; i++) {
      const r = await s.post('/api/ingredients/textures', { name: unique() })
      if (r.status === 429) refused = r
    }
    assert.ok(refused, 'the allowance ran out')
    assert.ok(Number(refused.headers.get('retry-after')) > 0)
    await resetAllowance(id)
  })

  it('lets only an administrator see and manage the library', async () => {
    const user = await signUp('Plain')
    assert.equal((await user.s.get('/api/admin/ingredients')).status, 403)
    assert.equal((await user.s.post('/api/admin/ingredients', { action: 'delete', key: 'anything' })).status, 403)

    const admin = await signUp('Library Admin')
    await service().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
    await resetAllowance(admin.id)
    const name = unique()
    const made = await admin.s.post('/api/ingredients/textures', { name })
    assert.equal(made.data.texture.status, 'ready')

    const list = await admin.s.get('/api/admin/ingredients')
    assert.equal(list.status, 200)
    assert.ok(list.data.textures.some((t: { key: string }) => t.key === made.data.texture.key))

    const redo = await admin.s.post('/api/admin/ingredients', { action: 'regenerate', key: made.data.texture.key, name })
    assert.equal(redo.status, 200, redo.text)
    assert.equal(redo.data.texture.status, 'ready')
    assert.notEqual(redo.data.texture.url, made.data.texture.url, 'a new picture')

    assert.equal((await admin.s.post('/api/admin/ingredients', { action: 'delete', key: made.data.texture.key })).status, 200)
    const gone = await new Session().get(`/api/ingredients/textures?names=${encodeURIComponent(name)}`)
    assert.deepEqual(gone.data.textures, {})
  })
})

suite('scene style', () => {
  it('is saved with the plating and shown to a consultant on the review link', async () => {
    const { s } = await signUp('Chef Photographer')
    const gen = await s.post('/api/generate', { dish: sampleDish() })
    const scene = { table: 'slate', props: 'cutlery', light: 'bistro', focus: true }
    const spec = { ...gen.data.renders[0].spec, scene }
    const created = await s.post('/api/projects', { dish: sampleDish(), spread: [{ name: 'Styled', spec }] })
    assert.equal(created.status, 201, created.text)
    const opened = await s.get(`/api/projects/${created.data.id}`)
    assert.deepEqual(opened.data.project.spread[0].spec.scene, scene)

    const bad = await s.post('/api/projects', { dish: sampleDish(), spread: [{ name: 'Bad', spec: { ...spec, scene: { table: 'lava' } } }] })
    assert.equal(bad.status, 400)
  })
})

suite('painted sauce', () => {
  const swoosh = [[0.3, 0.62], [0.4, 0.57], [0.5, 0.56], [0.6, 0.58], [0.7, 0.63]]

  it('is saved with the plating, shown to a consultant on the review link, and built into the 3D model', async () => {
    const { s } = await signUp('Chef Painter')
    const gen = await s.post('/api/generate', { dish: sampleDish() })
    const spec = { ...gen.data.renders[0].spec, brush: [{ w: 1.8, pts: swoosh }] }
    const created = await s.post('/api/projects', { dish: sampleDish(), spread: [{ name: 'Painted', spec }] })
    assert.equal(created.status, 201, created.text)

    const opened = await s.get(`/api/projects/${created.data.id}`)
    assert.deepEqual(opened.data.project.spread[0].spec.brush, [{ w: 1.8, pts: swoosh }], 'saved as drawn')

    const consultant = new Session()
    const view = await consultant.get(`/api/review/${created.data.shareId}`)
    assert.equal(view.status, 200)
    assert.match(view.data.renders[0].svg, /<path d="M [\d. L]+ Z"/, 'the 2D picture carries the painted ribbon')

    const withBrush = await consultant.get(`/api/review/${created.data.shareId}/model?spec=${spec.id}`)
    assert.equal(withBrush.status, 200)
    const without = await s.post('/api/model', { dish: sampleDish(), spec: { ...spec, brush: undefined } })
    const strokeKeys = (m: { gltf: { nodes: Array<{ extras?: { key?: string } }> } }) => m.gltf.nodes.map((n) => n.extras?.key).filter((k) => k?.startsWith('stroke:'))
    assert.deepEqual(strokeKeys(without.data), [])
    assert.deepEqual(strokeKeys(withBrush.data), ['stroke:0'], 'one swept piece, with a key of its own so it can be moved alone')
  })

  it('refuses strokes that are too many, too long, too wide or off the plate', async () => {
    const { s } = await signUp('Chef Careful')
    const gen = await s.post('/api/generate', { dish: sampleDish() })
    const base = gen.data.renders[0].spec
    const bad = (brush: unknown) => s.post('/api/model', { dish: sampleDish(), spec: { ...base, brush } })
    assert.equal((await bad([{ w: 1, pts: swoosh }])).status, 200)
    assert.equal((await bad(Array.from({ length: 9 }, () => ({ w: 1, pts: swoosh })))).status, 400)
    assert.equal((await bad([{ w: 5, pts: swoosh }])).status, 400)
    assert.equal((await bad([{ w: 1, pts: Array.from({ length: 65 }, () => [0.5, 0.5]) }])).status, 400)
    assert.equal((await bad([{ w: 1, pts: [[0.5, 0.5], [3, 0.5]] }])).status, 400)
  })
})

suite('polished renders', () => {
  const frame = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`

  it('needs a signed-in chef and a real image', async () => {
    assert.equal((await new Session().post('/api/polish', { image: frame })).status, 401)
    const { s } = await signUp()
    assert.equal((await s.post('/api/polish', { image: frame }, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await s.post('/api/polish', { image: 'not an image' })).status, 400)
    assert.equal((await s.post('/api/polish', { image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' })).status, 400)
    // Declared as a PNG, but not one: the bytes are checked, not the label.
    const fake = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`
    assert.equal((await s.post('/api/polish', { image: fake })).status, 415)
  })

  it('hands the frame back untouched, and says so, when photographic rendering is not switched on', async () => {
    const { s } = await signUp()
    const res = await s.post('/api/polish', { image: frame, dishName: 'Duck', components: ['Duck breast', 'Jus'] })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.data.polished, false)
    assert.equal(res.data.provider, 'none')
    assert.equal(res.data.image, frame)
  })
})

suite('administration', () => {
  it('is closed to regular users and open to administrators', async () => {
    const user = await signUp('Plain User')
    assert.equal((await user.s.get('/api/admin')).status, 403)
    assert.equal((await user.s.post('/api/admin', { action: 'settings', registrationOpen: false })).status, 403)

    const admin = await signUp('The Admin')
    await service().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
    // Their existing session picks up the new role: it is read from the database, not from the token.
    const overview = await admin.s.get('/api/admin')
    assert.equal(overview.status, 200)
    assert.ok(overview.data.users.some((u: { id: string }) => u.id === admin.id))
    assert.equal(overview.data.imageProvider, 'mock')
    assert.equal(overview.data.registrationOpen, true)
  })

  it('creates, edits, suspends and unlocks accounts, and audits each step', async () => {
    const admin = await signUp('Ops Admin')
    await service().from('profiles').update({ role: 'admin' }).eq('id', admin.id)

    const email = uniqueEmail()
    const create = await admin.s.post('/api/admin', { action: 'createUser', name: 'Made By Admin', email, role: 'user', password: PASSWORD })
    assert.equal(create.status, 200, create.text)
    const login = new Session()
    const signedIn = await login.post('/api/auth/signin', { email, password: PASSWORD })
    assert.equal(signedIn.status, 200)
    const targetId = signedIn.data.user.id as string

    assert.equal((await admin.s.post('/api/admin', { action: 'createUser', name: 'Dup', email, role: 'user', password: PASSWORD })).status, 409)
    assert.equal((await admin.s.post('/api/admin', { action: 'createUser', name: 'Weak', email: uniqueEmail(), role: 'user', password: 'short' })).status, 400)

    // Suspending signs them out at once and blocks new sign-ins.
    const suspend = await admin.s.post('/api/admin', { action: 'updateUser', id: targetId, name: 'Made By Admin', email, role: 'user', disabled: true })
    assert.equal(suspend.status, 200, suspend.text)
    assert.equal((await login.get('/api/auth/me')).data.user, null)
    assert.equal((await new Session().post('/api/auth/signin', { email, password: PASSWORD })).status, 401)

    // Reactivating and changing the password lets the new one in and the old one out.
    await admin.s.post('/api/admin', { action: 'updateUser', id: targetId, name: 'Made By Admin', email, role: 'user', disabled: false })
    assert.equal((await admin.s.post('/api/admin', { action: 'setPassword', id: targetId, password: 'a-brand-new-password-1' })).status, 200)
    assert.equal((await new Session().post('/api/auth/signin', { email, password: PASSWORD })).status, 401)
    assert.equal((await new Session().post('/api/auth/signin', { email, password: 'a-brand-new-password-1' })).status, 200)

    // Guard rails.
    assert.equal((await admin.s.post('/api/admin', { action: 'updateUser', id: admin.id, name: 'Ops Admin', email: admin.email, role: 'user', disabled: false })).status, 400)
    assert.equal((await admin.s.post('/api/admin', { action: 'unlockUser', id: targetId })).status, 200)
    assert.equal((await admin.s.post('/api/admin', { action: 'bogus' })).status, 400)

    const events = (await admin.s.get('/api/admin')).data.events.map((e: { action: string }) => e.action)
    for (const wanted of ['Created account', 'Updated account', 'Cleared sign-in attempt limit']) assert.ok(events.includes(wanted), `audit has "${wanted}"`)
    assert.ok(!JSON.stringify(events).includes('a-brand-new-password'), 'passwords never reach the audit log')
  })

  it('closes and reopens registration for everyone but administrators', async () => {
    const admin = await signUp('Gatekeeper')
    await service().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
    try {
      assert.equal((await admin.s.post('/api/admin', { action: 'settings', registrationOpen: false })).status, 200)
      await resetSignupThrottle()
      const blocked = await new Session().post('/api/auth/signup', { name: 'Late', email: uniqueEmail(), password: PASSWORD })
      assert.equal(blocked.status, 403)
      assert.match(blocked.data.error, /closed/i)
      const viaAdmin = await admin.s.post('/api/admin', { action: 'createUser', name: 'Invited', email: uniqueEmail(), role: 'user', password: PASSWORD })
      assert.equal(viaAdmin.status, 200, 'an administrator can still add people')
    } finally {
      await admin.s.post('/api/admin', { action: 'settings', registrationOpen: true })
    }
    await resetSignupThrottle()
    assert.equal((await new Session().post('/api/auth/signup', { name: 'On Time', email: uniqueEmail(), password: PASSWORD })).status, 201)
  })

  it('renames and transfers a project, and replaces its review link only when confirmed', async () => {
    const owner = await signUp('Owner')
    const admin = await signUp('Curator')
    await service().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
    const gen = await owner.s.post('/api/generate', { dish: sampleDish(), count: 2 })
    const spread = gen.data.renders.map((r: { name: string; spec: unknown }) => ({ name: r.name, spec: r.spec }))
    const { id, shareId } = (await owner.s.post('/api/projects', { dish: sampleDish(), spread })).data

    assert.equal((await admin.s.post('/api/admin', { action: 'rotateShare', id, confirm: 'wrong name' })).status, 400)
    assert.equal((await admin.s.post('/api/admin', { action: 'rotateShare', id, confirm: sampleDish().name })).status, 200)
    assert.equal((await new Session().get(`/api/review/${shareId}`)).status, 404, 'the old link is dead')

    assert.equal((await admin.s.post('/api/admin', { action: 'updateProject', id, name: 'Renamed', ownerId: admin.id })).status, 200)
    assert.equal((await owner.s.get(`/api/projects/${id}?meta=1`)).status, 404, 'the previous owner no longer has it')
    assert.equal((await admin.s.get(`/api/projects/${id}?meta=1`)).data.project.dish.name, 'Renamed')
  })
})

suite('response hardening', () => {
  it('sends security headers and never caches API answers', async () => {
    const res = await fetch(BASE + '/api/auth/me')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.ok(res.headers.get('referrer-policy'))
    assert.equal(res.headers.get('x-powered-by'), null)
    assert.match(res.headers.get('cache-control') ?? '', /no-store/)
  })

  it('answers malformed JSON with a clean 400, not a stack trace', async () => {
    const s = new Session()
    const res = await s.request('/api/auth/signin', { method: 'POST', body: '{"email": ', headers: { 'content-type': 'application/json' }, origin: BASE })
    assert.equal(res.status, 400)
    assert.ok(!/at .*\.ts|node_modules/.test(res.text))
  })
})
