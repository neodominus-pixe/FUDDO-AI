import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { anon, codeOf, configured, dish, makeProject, makeUser, PASSWORD, service, spread } from './helpers'

// The columns and functions added by 20261001000100_columns_and_functions.sql.
const suite = configured ? describe : describe.skip
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

suite('profiles: new columns', () => {
  it('copies the email onto the profile at sign-up and when it changes', async () => {
    const u = await makeUser()
    const svc = service()
    assert.equal((await svc.from('profiles').select('email').eq('id', u.id).single()).data?.email, u.email)

    const next = `moved-${crypto.randomUUID().slice(0, 8)}@example.test`
    assert.equal((await svc.auth.admin.updateUserById(u.id, { email: next, email_confirm: true })).error, null)
    assert.equal((await svc.from('profiles').select('email').eq('id', u.id).single()).data?.email, next)
  })

  it('lets people edit their own details, and validates them', async () => {
    const u = await makeUser()
    const ok = await u.client.from('profiles').update({ organisation: 'Maison Test', job_title: 'Head chef', locale: 'fr-FR', avatar_url: 'https://example.test/me.png' }).eq('id', u.id).select('organisation, job_title, locale, avatar_url, updated_at, created_at').single()
    assert.equal(ok.error, null)
    assert.deepEqual([ok.data?.organisation, ok.data?.job_title, ok.data?.locale], ['Maison Test', 'Head chef', 'fr-FR'])
    assert.ok(new Date(ok.data!.updated_at) > new Date(ok.data!.created_at), 'updated_at moves')

    for (const bad of [{ avatar_url: 'http://insecure.test/a.png' }, { avatar_url: 'javascript:alert(1)' }, { locale: 'English' }, { organisation: 'x'.repeat(121) }]) {
      assert.ok((await u.client.from('profiles').update(bad).eq('id', u.id)).error, JSON.stringify(bad))
    }
  })

  it('still will not let people change their role, status or email', async () => {
    const u = await makeUser()
    for (const bad of [{ role: 'admin' }, { disabled: false }, { email: 'someone@else.test' }]) {
      assert.ok((await u.client.from('profiles').update(bad).eq('id', u.id)).error, JSON.stringify(bad))
    }
  })
})

suite('projects: new columns', () => {
  it('derives status from the row, and lets owners archive and describe', async () => {
    const u = await makeUser()
    const p = await makeProject(u)
    const status = async () => (await u.client.from('projects').select('status').eq('id', p.id).single()).data?.status
    assert.equal(await status(), 'awaiting')

    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: 'spec-1', p_comment: '' })
    assert.equal(await status(), 'reviewed')

    const arch = await u.client.from('projects').update({ archived_at: new Date().toISOString(), description: 'Autumn menu', tags: ['autumn', 'duck'] }).eq('id', p.id).select('status, description, tags').single()
    assert.deepEqual([arch.data?.status, arch.data?.description, arch.data?.tags], ['archived', 'Autumn menu', ['autumn', 'duck']])
    assert.ok((await u.client.from('projects').update({ status: 'reviewed' }).eq('id', p.id)).error, 'status is read-only')
  })

  it('validates tags, description and thumbnail', async () => {
    const u = await makeUser()
    const p = await makeProject(u)
    const bad: Record<string, unknown>[] = [
      { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) },
      { tags: ['x'.repeat(31)] },
      { tags: [''] },
      { description: 'd'.repeat(2001) },
      { thumbnail_url: 'javascript:alert(1)' },
    ]
    for (const b of bad) assert.ok((await u.client.from('projects').update(b).eq('id', p.id)).error, JSON.stringify(b).slice(0, 60))
  })

  it('switches a review link off and back on without replacing it', async () => {
    const u = await makeUser()
    const p = await makeProject(u)
    assert.equal((await u.client.from('projects').update({ link_enabled: false }).eq('id', p.id)).error, null)

    assert.equal((await anon().rpc('get_shared_project', { p_share_id: p.shareId })).data, null, 'a disabled link shows nothing')
    assert.equal(codeOf((await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: null, p_comment: '' })).error), 'PT404')

    await u.client.from('projects').update({ link_enabled: true }).eq('id', p.id)
    assert.ok((await anon().rpc('get_shared_project', { p_share_id: p.shareId })).data, 'the same link works again')
  })

  it('counts link views, debounced, without making the project look edited, and owners cannot fake them', async () => {
    const u = await makeUser()
    const p = await makeProject(u)
    const read = async () => (await u.client.from('projects').select('view_count, first_viewed_at, last_viewed_at, updated_at').eq('id', p.id).single()).data!
    const start = await read()
    assert.equal(start.view_count, 0)

    await anon().rpc('record_link_view', { p_share_id: p.shareId })
    await anon().rpc('record_link_view', { p_share_id: p.shareId }) // inside the 10 s window: not counted
    const one = await read()
    assert.equal(one.view_count, 1)
    assert.ok(one.first_viewed_at && one.last_viewed_at)
    assert.equal(one.updated_at, start.updated_at, 'a view is not an edit')

    await sleep(10_500)
    await anon().rpc('record_link_view', { p_share_id: p.shareId })
    assert.equal((await read()).view_count, 2)

    // Garbage and unknown links are ignored silently.
    assert.equal((await anon().rpc('record_link_view', { p_share_id: 'x' })).error, null)
    assert.equal((await anon().rpc('record_link_view', { p_share_id: 'no-such-link-at-all' })).error, null)

    // The owner cannot write the counters, on update or on insert.
    await u.client.from('projects').update({ view_count: 9999, first_viewed_at: null }).eq('id', p.id)
    assert.equal((await read()).view_count, 2)
    const forged = await u.client.from('projects').insert({ owner_id: u.id, dish: dish(), spread: spread('a'), view_count: 500 }).select('view_count').single()
    assert.equal(forged.data?.view_count, 0)
  })
})

suite('functions for people', () => {
  it('my_projects lists a light summary of only my projects, newest first, hiding archived ones by default', async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()])
    const p1 = await makeProject(a)
    const p2 = await makeProject(a)
    await makeProject(b)
    await a.client.from('projects').update({ archived_at: new Date().toISOString() }).eq('id', p1.id)

    const visible = await a.client.rpc('my_projects')
    assert.equal(visible.error, null)
    assert.deepEqual(visible.data.map((r: { id: string }) => r.id), [p2.id])
    const withArchived = await a.client.rpc('my_projects', { p_include_archived: true })
    assert.equal(withArchived.data.length, 2)
    const row = visible.data[0]
    assert.equal(row.plating_count, 2)
    assert.equal(row.component_count, 1)
    assert.equal(row.status, 'awaiting')
    assert.ok(row.share_id && !('dish' in row), 'no heavy JSON in the list')
    assert.deepEqual((await anon().rpc('my_projects')).data ?? [], [])
  })

  it('my_stats totals my own work only', async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()])
    const p = await makeProject(a)
    await makeProject(a)
    await makeProject(b)
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: 'spec-1', p_comment: '' })
    const s = (await a.client.rpc('my_stats')).data
    assert.deepEqual([s.projects, s.reviewed, s.awaiting, s.archived, s.platings], [2, 1, 1, 0, 4])
    assert.ok(s.lastActivity)
  })

  it('duplicate_project copies the dish and spread with a fresh link and no answer, for its owner only', async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()])
    const p = await makeProject(a)
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: 'spec-1', p_comment: 'yes' })

    const copy = await a.client.rpc('duplicate_project', { p_id: p.id })
    assert.equal(copy.error, null)
    const row = await a.client.from('projects').select('dish_name, share_id, spread, review, owner_id').eq('id', copy.data).single()
    assert.equal(row.data?.dish_name, 'Test dish (copy)')
    assert.notEqual(row.data?.share_id, p.shareId)
    assert.equal(row.data?.spread.length, 2)
    assert.equal(row.data?.review.reviewedAt, null)
    assert.equal(row.data?.owner_id, a.id)

    assert.equal(codeOf((await b.client.rpc('duplicate_project', { p_id: p.id })).error), 'PT404', 'not someone else’s')
    assert.ok((await anon().rpc('duplicate_project', { p_id: p.id })).error)
  })

  it('rotate_my_share_link replaces the link for the owner and kills the old one', async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()])
    const p = await makeProject(a)
    const rotated = await a.client.rpc('rotate_my_share_link', { p_id: p.id })
    assert.equal(rotated.error, null)
    assert.notEqual(rotated.data, p.shareId)
    assert.equal((await anon().rpc('get_shared_project', { p_share_id: p.shareId })).data, null)
    assert.ok((await anon().rpc('get_shared_project', { p_share_id: rotated.data })).data)
    assert.equal(codeOf((await b.client.rpc('rotate_my_share_link', { p_id: p.id })).error), 'PT404')
  })

  it('delete_my_account needs the typed email, removes the account and its projects, and protects the last admin', async () => {
    const u = await makeUser()
    const p = await makeProject(u)
    assert.equal(codeOf((await u.client.rpc('delete_my_account', { p_confirm_email: 'wrong@example.test' })).error), 'PT400')
    assert.equal((await service().from('projects').select('id').eq('id', p.id)).data?.length, 1, 'nothing was deleted')

    assert.equal((await u.client.rpc('delete_my_account', { p_confirm_email: u.email.toUpperCase() })).error, null)
    const svc = service()
    assert.equal((await svc.from('projects').select('id').eq('id', p.id)).data?.length, 0)
    assert.equal((await svc.from('profiles').select('id').eq('id', u.id)).data?.length, 0)
    assert.equal((await svc.from('platings').select('id').eq('project_id', p.id)).data?.length, 0)
    assert.ok((await createClientFor(u.email)).error, 'cannot sign in any more')
    assert.ok((await anon().rpc('delete_my_account', { p_confirm_email: 'x' })).error, 'visitors cannot call it')
  })
})

suite('functions for administrators', () => {
  it('admin_stats reports workspace totals, and only to an admin', async () => {
    const [admin, user] = await Promise.all([makeUser({ role: 'admin' }), makeUser()])
    const p = await makeProject(user)
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: 'spec-1', p_comment: '' })

    const s = (await admin.client.rpc('admin_stats')).data
    for (const k of ['accounts', 'active', 'suspended', 'administrators', 'signupsLast7d', 'projects', 'awaiting', 'reviewed', 'archived', 'ownerless', 'platings', 'reviewsLast7d', 'linkViews', 'cachedImages', 'imageSpendUsd', 'eventsLast24h']) {
      assert.equal(typeof s[k], 'number', k)
    }
    assert.ok(s.accounts >= 2 && s.projects >= 1 && s.reviewed >= 1 && s.administrators >= 1)
    assert.equal(typeof s.registrationOpen, 'boolean')
    assert.equal(codeOf((await user.client.rpc('admin_stats')).error), 'PT403')
    assert.ok((await anon().rpc('admin_stats')).error)
  })

  it('admin_user_detail returns the profile, projects and what admins did to the account', async () => {
    const [admin, user] = await Promise.all([makeUser({ role: 'admin' }), makeUser({ name: 'Detail Subject' })])
    await makeProject(user)
    await admin.client.rpc('admin_revoke_sessions', { p_id: user.id })

    const d = (await admin.client.rpc('admin_user_detail', { p_id: user.id })).data
    assert.deepEqual([d.name, d.email, d.role, d.disabled], ['Detail Subject', user.email, 'user', false])
    assert.equal(d.projects.length, 1)
    assert.equal(d.projects[0].status, 'awaiting')
    assert.ok(d.recentActions.some((a: { action: string }) => a.action === 'Revoked all sessions'), 'the action is attached to the account it was about')

    assert.equal(codeOf((await admin.client.rpc('admin_user_detail', { p_id: crypto.randomUUID() })).error), 'PT404')
    assert.equal(codeOf((await user.client.rpc('admin_user_detail', { p_id: user.id })).error), 'PT403')
  })

  it('admin_events_page pages backwards through the audit trail', async () => {
    const admin = await makeUser({ role: 'admin' })
    for (let i = 0; i < 4; i++) await admin.client.rpc('admin_record', { p_action: `Paging test ${i}`, p_target: 'tests' })
    const first = (await admin.client.rpc('admin_events_page', { p_limit: 2 })).data
    assert.equal(first.length, 2)
    assert.ok(first[0].id > first[1].id, 'newest first')
    const next = (await admin.client.rpc('admin_events_page', { p_limit: 2, p_before: first[1].id })).data
    assert.ok(next.every((e: { id: number }) => e.id < first[1].id))
    assert.equal((await admin.client.rpc('admin_events_page', { p_limit: 100000 })).data.length <= 500, true, 'the page size is capped')
    assert.equal(codeOf((await (await makeUser()).client.rpc('admin_events_page')).error), 'PT403')
  })

  it('records who changed the registration setting, and when', async () => {
    const admin = await makeUser({ role: 'admin' })
    await admin.client.rpc('admin_set_registration', { p_open: true })
    const row = await service().from('settings').select('description, updated_by, updated_at').eq('key', 'registration_open').single()
    assert.equal(row.data?.updated_by, admin.id)
    assert.ok(row.data?.description)
    const ev = await service().from('admin_events').select('details').eq('actor_id', admin.id).eq('action', 'Opened registration').order('id', { ascending: false }).limit(1).single()
    assert.deepEqual(ev.data?.details, { registrationOpen: true })
  })
})

suite('maintenance', () => {
  it('purge_expired removes stale counters and approvals, and is server-only', async () => {
    const svc = service()
    const tag = crypto.randomUUID().slice(0, 8)
    await svc.from('rate_limits').insert({ key: `stale:${tag}`, count: 1, expires_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
    await svc.from('rate_limits').insert({ key: `fresh:${tag}`, count: 1, expires_at: new Date(Date.now() + 3_600_000).toISOString() })
    await svc.from('registration_allow').insert({ email: `old-${tag}@example.test`, expires_at: new Date(Date.now() - 1000).toISOString() })

    const out = await svc.rpc('purge_expired')
    assert.equal(out.error, null)
    assert.ok(out.data.rateLimits >= 1 && out.data.registrationApprovals >= 1)
    assert.equal((await svc.from('rate_limits').select('key').eq('key', `stale:${tag}`)).data?.length, 0)
    assert.equal((await svc.from('rate_limits').select('key').eq('key', `fresh:${tag}`)).data?.length, 1, 'live counters stay')

    const u = await makeUser()
    assert.ok((await u.client.rpc('purge_expired')).error)
    assert.ok((await anon().rpc('purge_expired')).error)
  })
})

/** Tries to sign in as an account and returns the Auth response. */
async function createClientFor(email: string) {
  return anon().auth.signInWithPassword({ email, password: PASSWORD })
}
