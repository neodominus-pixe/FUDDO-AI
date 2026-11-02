import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { anon, codeOf, configured, dish, makeProject, makeUser, PASSWORD, service, spread, type TestUser } from './helpers'

// Row Level Security, triggers and functions, exercised as real users through the same API the app uses.
// Skipped automatically when no Supabase is configured.
const suite = configured ? describe : describe.skip

suite('accounts', () => {
  const svc = service()
  after(async () => {
    await svc.rpc('clear_rate_limit', { p_key: 'noop' })
  })

  it('creates a regular-user profile on sign-up and ignores a role in client metadata', async () => {
    const email = `t-${crypto.randomUUID().slice(0, 8)}@example.test`
    const c = anon()
    const { data, error } = await c.auth.signUp({ email, password: PASSWORD, options: { data: { name: 'Self Promoter', role: 'admin' } } })
    assert.equal(error, null)
    const profile = await svc.from('profiles').select('name, role, disabled').eq('id', data.user!.id).single()
    assert.equal(profile.data?.role, 'user')
    assert.equal(profile.data?.name, 'Self Promoter')
    assert.equal(profile.data?.disabled, false)
  })

  it('lets a user rename themselves but not change their role', async () => {
    const u = await makeUser()
    const rename = await u.client.from('profiles').update({ name: 'New Name' }).eq('id', u.id).select('name')
    assert.equal(rename.data?.[0]?.name, 'New Name')
    const promote = await u.client.from('profiles').update({ role: 'admin' }).eq('id', u.id)
    assert.ok(promote.error, 'role column must not be writable')
    const check = await svc.from('profiles').select('role').eq('id', u.id).single()
    assert.equal(check.data?.role, 'user')
  })

  it('hides other people’s profiles from regular users, and shows them all to an admin', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const admin = await makeUser({ role: 'admin' })
    const seen = await a.client.from('profiles').select('id')
    assert.deepEqual(seen.data?.map((r) => r.id), [a.id])
    const all = await admin.client.from('profiles').select('id').in('id', [a.id, b.id, admin.id])
    assert.equal(all.data?.length, 3)
  })

  it('blocks public sign-up while registration is closed, but not admin-created accounts', async () => {
    const admin = await makeUser({ role: 'admin' })
    assert.equal((await admin.client.rpc('admin_set_registration', { p_open: false })).error, null)
    try {
      assert.equal((await anon().rpc('registration_open')).data, false)
      const blocked = await anon().auth.signUp({ email: `t-${crypto.randomUUID().slice(0, 8)}@example.test`, password: PASSWORD })
      assert.ok(blocked.error, 'sign-up must fail while closed')

      const email = `t-${crypto.randomUUID().slice(0, 8)}@example.test`
      // Without the server's approval an admin-created account is refused too, like anyone else's...
      assert.ok((await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })).error, 'unapproved creation refused')
      // ...with it, that one email gets through, exactly once.
      await svc.rpc('allow_registration', { p_email: email })
      assert.equal((await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })).error, null)
      const again = `t-${crypto.randomUUID().slice(0, 8)}@example.test`
      await svc.rpc('allow_registration', { p_email: again })
      assert.ok((await svc.auth.admin.createUser({ email: `other-${again}`, password: PASSWORD, email_confirm: true })).error, 'approval is per email')

      // A visitor cannot approve themselves: the allowance table is unreachable from the public API.
      const self = `t-${crypto.randomUUID().slice(0, 8)}@example.test`
      assert.ok((await anon().rpc('allow_registration', { p_email: self })).error, 'anon cannot call allow_registration')
      assert.equal((await anon().from('registration_allow').insert({ email: self, expires_at: '2999-01-01' })).error !== null, true)
      assert.ok((await anon().auth.signUp({ email: self, password: PASSWORD, options: { data: { admin_created: true } } })).error, 'forged metadata must not bypass the guard')
    } finally {
      await admin.client.rpc('admin_set_registration', { p_open: true })
    }
    assert.equal((await anon().rpc('registration_open')).data, true)
  })

  it('does not let visitors or users read or change settings directly', async () => {
    const u = await makeUser()
    assert.equal((await u.client.from('settings').update({ value: false }).eq('key', 'registration_open').select()).data?.length ?? 0, 0)
    assert.equal((await u.client.rpc('admin_set_registration', { p_open: false })).error?.code, 'PT403')
  })
})

suite('projects and row level security', () => {
  let alice: TestUser
  let bob: TestUser
  let admin: TestUser
  before(async () => {
    ;[alice, bob, admin] = await Promise.all([makeUser(), makeUser(), makeUser({ role: 'admin' })])
  })

  it('shows owners only their own projects and admins everything', async () => {
    const p = await makeProject(alice)
    assert.ok((await alice.client.from('projects').select('id').eq('id', p.id)).data?.length === 1)
    assert.equal((await bob.client.from('projects').select('id').eq('id', p.id)).data?.length, 0)
    assert.equal((await admin.client.from('projects').select('id').eq('id', p.id)).data?.length, 1)
    assert.equal((await anon().from('projects').select('id').eq('id', p.id)).data?.length ?? 0, 0)
  })

  it('refuses to create a project for someone else', async () => {
    const r = await bob.client.from('projects').insert({ owner_id: alice.id, dish: dish(), spread: spread('a') })
    assert.ok(r.error)
  })

  it('does not let one user change or delete another user’s project', async () => {
    const p = await makeProject(alice)
    const upd = await bob.client.from('projects').update({ dish: dish('Hijacked') }).eq('id', p.id).select('id')
    assert.equal(upd.data?.length ?? 0, 0)
    const del = await bob.client.from('projects').delete().eq('id', p.id).select('id')
    assert.equal(del.data?.length ?? 0, 0)
    assert.equal((await alice.client.from('projects').select('id').eq('id', p.id)).data?.length, 1)
  })

  it('stops owners changing ownership, the share link or the consultant’s answer', async () => {
    const p = await makeProject(alice)
    const r = await alice.client
      .from('projects')
      .update({
        owner_id: bob.id,
        share_id: 'guessable-share-id',
        review: { reviewer: 'forged', pickedSpecId: 'spec-1', comment: 'forged', reviewedAt: '2026-01-01T00:00:00Z' },
      })
      .eq('id', p.id)
      .select('owner_id, share_id, review')
      .single()
    assert.equal(r.error, null)
    assert.equal(r.data?.owner_id, alice.id)
    assert.equal(r.data?.share_id, p.shareId)
    assert.equal(r.data?.review.reviewer, '')
    assert.equal(r.data?.review.pickedSpecId, null)
  })

  it('derives the dish name from the dish, whatever the client sends', async () => {
    const p = await makeProject(alice)
    const r = await alice.client.from('projects').update({ dish: dish('Roast Duck'), dish_name: 'ignored' }).eq('id', p.id).select('dish_name').single()
    assert.equal(r.data?.dish_name, 'Roast Duck')
  })

  it('rejects oversized or malformed dish and spread payloads', async () => {
    const tooMany = await alice.client.from('projects').insert({ owner_id: alice.id, dish: dish(), spread: spread(...Array.from({ length: 25 }, (_, i) => `s${i}`)) })
    assert.ok(tooMany.error, 'more than 24 platings')
    const notArray = await alice.client.from('projects').insert({ owner_id: alice.id, dish: dish(), spread: { nope: true } })
    assert.ok(notArray.error, 'spread must be an array')
    const huge = await alice.client.from('projects').insert({ owner_id: alice.id, dish: { ...dish(), blob: 'x'.repeat(300_000) }, spread: spread('a') })
    assert.ok(huge.error, 'dish over the size cap')
  })

  it('lets an admin transfer a project and rotate its link, and records both', async () => {
    const p = await makeProject(alice)
    assert.equal((await admin.client.rpc('admin_update_project', { p_id: p.id, p_name: 'Renamed by admin', p_owner: bob.id })).error, null)
    const row = await service().from('projects').select('owner_id, dish_name').eq('id', p.id).single()
    assert.equal(row.data?.owner_id, bob.id)
    assert.equal(row.data?.dish_name, 'Renamed by admin')

    const wrong = await admin.client.rpc('admin_rotate_share', { p_id: p.id, p_confirm: 'not the name' })
    assert.equal(codeOf(wrong.error), 'PT400')
    const rotated = await admin.client.rpc('admin_rotate_share', { p_id: p.id, p_confirm: 'Renamed by admin' })
    assert.equal(rotated.error, null)
    assert.notEqual(rotated.data, p.shareId)

    const events = await admin.client.from('admin_events').select('action').order('id', { ascending: false }).limit(10)
    const actions = events.data?.map((e) => e.action)
    assert.ok(actions?.includes('Updated project') && actions.includes('Replaced review link'))
  })

  it('will not transfer a project to a suspended account', async () => {
    const p = await makeProject(alice)
    const target = await makeUser()
    await service().from('profiles').update({ disabled: true }).eq('id', target.id)
    assert.equal(codeOf((await admin.client.rpc('admin_update_project', { p_id: p.id, p_name: 'x', p_owner: target.id })).error), 'PT400')
  })
})

suite('consultant review (public share link)', () => {
  let owner: TestUser
  before(async () => {
    owner = await makeUser()
  })

  it('serves a project to anyone holding its link, and nothing else', async () => {
    const p = await makeProject(owner)
    const shared = await anon().rpc('get_shared_project', { p_share_id: p.shareId })
    assert.equal(shared.error, null)
    assert.equal(shared.data.dish.name, 'Test dish')
    assert.equal(shared.data.spread.length, 2)
    assert.ok(!('owner_id' in shared.data), 'owner must not leak through the share view')
    assert.equal((await anon().rpc('get_shared_project', { p_share_id: 'not-a-real-link-xyz' })).data, null)
    assert.equal((await anon().rpc('get_shared_project', { p_share_id: 'x' })).data, null)
  })

  it('records an answer and shows it to the owner', async () => {
    const p = await makeProject(owner)
    const r = await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'Chef Consultant', p_picked: 'spec-2', p_comment: 'Love the second one.' })
    assert.equal(r.error, null)
    assert.equal(r.data.pickedSpecId, 'spec-2')
    assert.ok(r.data.reviewedAt)
    const seen = await owner.client.from('projects').select('review').eq('id', p.id).single()
    assert.equal(seen.data?.review.comment, 'Love the second one.')
  })

  it('rejects an unknown link and a plating that is not in the spread', async () => {
    const p = await makeProject(owner)
    assert.equal(codeOf((await anon().rpc('submit_review', { p_share_id: 'not-a-real-link-xyz', p_reviewer: '', p_picked: null, p_comment: '' })).error), 'PT404')
    assert.equal(codeOf((await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: '', p_picked: 'spec-999', p_comment: '' })).error), 'PT400')
  })

  it('truncates over-long fields instead of storing them', async () => {
    const p = await makeProject(owner)
    const r = await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'r'.repeat(500), p_picked: null, p_comment: 'c'.repeat(9000) })
    assert.equal(r.data.reviewer.length, 80)
    assert.equal(r.data.comment.length, 2000)
  })

  it('limits how many answers one link can receive per hour', async () => {
    const p = await makeProject(owner)
    let limited = false
    for (let i = 0; i < 62 && !limited; i++) {
      const r = await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'x', p_picked: null, p_comment: String(i) })
      if (codeOf(r.error) === 'PT429') limited = true
    }
    assert.ok(limited, 'the database must throttle a hammered link')
  })

  it('drops a pick when the owner later removes that plating', async () => {
    const p = await makeProject(owner, ['keep', 'drop'])
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: 'drop', p_comment: 'this one' })
    const upd = await owner.client.from('projects').update({ spread: spread('keep') }).eq('id', p.id).select('review').single()
    assert.equal(upd.data?.review.pickedSpecId, null)
    assert.equal(upd.data?.review.reviewedAt, null)
    assert.equal(upd.data?.review.comment, 'this one', 'the comment stays; only the stale pick goes')
  })
})

suite('administration', () => {
  let admin: TestUser
  let other: TestUser
  before(async () => {
    ;[admin, other] = await Promise.all([makeUser({ role: 'admin' }), makeUser()])
  })

  it('refuses every admin function to a regular user and to a visitor', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['admin_overview', {}],
      ['admin_revoke_sessions', { p_id: other.id }],
      ['admin_clear_attempts', { p_id: other.id }],
      ['admin_set_registration', { p_open: true }],
      ['admin_check_profile_update', { p_id: other.id, p_role: 'user', p_disabled: false }],
      ['admin_record', { p_action: 'x', p_target: 'y' }],
    ]
    for (const [fn, args] of calls) {
      const user = await other.client.rpc(fn, args)
      assert.equal(codeOf(user.error), 'PT403', `${fn} as user`)
      const visitor = await anon().rpc(fn, args)
      assert.ok(visitor.error, `${fn} as visitor`)
    }
  })

  it('returns the overview an admin needs', async () => {
    const r = await admin.client.rpc('admin_overview')
    assert.equal(r.error, null)
    assert.ok(Array.isArray(r.data.users) && Array.isArray(r.data.projects) && Array.isArray(r.data.events))
    const me = r.data.users.find((u: { id: string }) => u.id === admin.id)
    assert.equal(me.role, 'admin')
    assert.equal(me.email, admin.email)
    assert.equal(typeof r.data.registrationOpen, 'boolean')
  })

  it('will not let an admin suspend or demote themselves', async () => {
    const r = await admin.client.rpc('admin_check_profile_update', { p_id: admin.id, p_role: 'user', p_disabled: false })
    assert.equal(codeOf(r.error), 'PT400')
    const s = await admin.client.rpc('admin_check_profile_update', { p_id: admin.id, p_role: 'admin', p_disabled: true })
    assert.equal(codeOf(s.error), 'PT400')
  })

  it('never lets two admins demote each other into a workspace with no administrator', async () => {
    const [x, y] = await Promise.all([makeUser({ role: 'admin' }), makeUser({ role: 'admin' })])
    const demote = (by: TestUser, target: TestUser) =>
      by.client.rpc('admin_apply_profile_update', { p_id: target.id, p_name: 'Demoted', p_email: target.email, p_role: 'user', p_disabled: false })
    const results = await Promise.all([demote(x, y), demote(y, x)])
    const succeeded = results.filter((r) => r.error === null).length
    assert.equal(succeeded, 1, 'exactly one of the simultaneous demotions may win')
    const left = await service().from('profiles').select('role').in('id', [x.id, y.id]).eq('role', 'admin')
    assert.equal(left.data?.length, 1)
  })

  it('applies a role and status change atomically, ends sessions, and audits it', async () => {
    const victim = await makeUser({ name: 'Victim' })
    const apply = await admin.client.rpc('admin_apply_profile_update', {
      p_id: victim.id, p_name: 'Renamed', p_email: victim.email, p_role: 'user', p_disabled: true,
    })
    assert.equal(apply.error, null)
    const row = await service().from('profiles').select('name, disabled').eq('id', victim.id).single()
    assert.equal(row.data?.disabled, true)
    assert.equal(row.data?.name, 'Renamed')

    // A suspended account can no longer read or write anything, even with a token that is still valid.
    const denied = await victim.client.from('projects').insert({ owner_id: victim.id, dish: dish(), spread: spread('a') })
    assert.ok(denied.error, 'suspended account must be blocked by policy')
    // The person can still read their own profile (the app uses it to notice the suspension); nothing else.
    const own = await victim.client.from('profiles').select('id, disabled')
    assert.deepEqual(own.data, [{ id: victim.id, disabled: true }])

    const events = await admin.client.from('admin_events').select('action, target').order('id', { ascending: false }).limit(5)
    assert.ok(events.data?.some((e) => e.action === 'Updated account'))
  })

  it('reports and clears sign-in throttles for an account', async () => {
    const svc = service()
    const target = await makeUser()
    const key = `acct:${await sha(target.email)}:${await sha('1.2.3.4')}`
    for (let i = 0; i < 9; i++) await svc.rpc('hit_rate_limit', { p_key: key, p_limit: 8, p_window: '15 minutes' })
    assert.equal((await svc.rpc('is_rate_limited', { p_key: key, p_limit: 8 })).data, true)
    assert.equal((await admin.client.rpc('admin_clear_attempts', { p_id: target.id })).error, null)
    assert.equal((await svc.rpc('is_rate_limited', { p_key: key, p_limit: 8 })).data, false)
  })

  it('lets only the server touch the rate limiter', async () => {
    const u = await makeUser()
    for (const c of [u.client, anon()]) {
      assert.ok((await c.rpc('hit_rate_limit', { p_key: 'x', p_limit: 1, p_window: '1 minute' })).error, 'hit_rate_limit')
      assert.ok((await c.rpc('is_rate_limited', { p_key: 'x', p_limit: 1 })).error, 'is_rate_limited')
      assert.ok((await c.rpc('clear_rate_limit', { p_key: 'x' })).error, 'clear_rate_limit')
      assert.equal((await c.from('rate_limits').select('key')).data?.length ?? 0, 0)
    }
  })

  it('keeps the audit log, render cache and rate table private', async () => {
    const u = await makeUser()
    assert.equal((await u.client.from('admin_events').select('id')).data?.length ?? 0, 0)
    assert.ok((await u.client.from('admin_events').insert({ actor_name: 'x', action: 'y', target: 'z' })).error)
    assert.equal((await u.client.from('render_cache').select('hash')).data?.length ?? 0, 0)
    assert.ok((await u.client.from('render_cache').insert({ hash: 'h', image_url: 'u', provider: 'p', quality: 'q' })).error)
  })
})

suite('rate limiter windowing', () => {
  it('counts hits, reports the limit, and resets after the window', async () => {
    const svc = service()
    const key = `test:${crypto.randomUUID()}`
    assert.equal((await svc.rpc('hit_rate_limit', { p_key: key, p_limit: 3, p_window: '2 seconds' })).data, false)
    assert.equal((await svc.rpc('hit_rate_limit', { p_key: key, p_limit: 3, p_window: '2 seconds', p_cost: 2 })).data, false) // 3
    assert.equal((await svc.rpc('hit_rate_limit', { p_key: key, p_limit: 3, p_window: '2 seconds' })).data, true) // 4
    assert.equal((await svc.rpc('is_rate_limited', { p_key: key, p_limit: 3 })).data, true)
    await new Promise((r) => setTimeout(r, 2200))
    assert.equal((await svc.rpc('is_rate_limited', { p_key: key, p_limit: 3 })).data, false, 'expired window is forgotten')
    assert.equal((await svc.rpc('hit_rate_limit', { p_key: key, p_limit: 3, p_window: '2 seconds' })).data, false, 'and starts fresh')
  })
})

async function sha(value: string) {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}
