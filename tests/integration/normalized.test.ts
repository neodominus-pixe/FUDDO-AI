import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { anon, configured, makeProject, makeUser, service, spec, type TestUser } from './helpers'

// The relational tables (dish_components, platings, reviews) and the reporting views, which mirror projects.
const suite = configured ? describe : describe.skip

const richDish = () => ({
  id: 'dish-1',
  name: 'Duck, celeriac, red wine',
  createdAt: new Date().toISOString(),
  components: [
    { id: 'c1', name: 'Seared duck breast', role: 'hero', imagePath: 'https://example.test/storage/v1/object/public/media/u/duck.png' },
    { id: 'c2', name: 'Celeriac puree', role: 'support', imagePath: null },
    { id: 'c3', name: 'Red wine jus', role: 'sauce', imagePath: null },
    { id: 'c4', name: 'Micro chervil', role: 'garnish', imagePath: null },
  ],
})

const rich = (id: string, over: Record<string, unknown> = {}) => ({
  name: `Plating ${id}`,
  spec: { ...spec(id), notes: 'lean the duck on the puree', seed: 4242, overrides: { 'c1:0': { x: 0.2, y: -0.1 } }, tweaks: { 'c2:0': { s: 1.2 } }, copies: { c2: 2 }, ...over },
})

async function create(owner: TestUser, d: unknown = richDish(), s: unknown[] = [rich('spec-1'), rich('spec-2', { composition: 'linear', plate: 'black-slate', sauce: 'dotted' })]) {
  const { data, error } = await owner.client.from('projects').insert({ owner_id: owner.id, dish: d, spread: s }).select('id, share_id').single()
  assert.equal(error, null, error?.message)
  return { id: data!.id as string, shareId: data!.share_id as string }
}

suite('relational tables follow projects', () => {
  let chef: TestUser
  before(async () => {
    chef = await makeUser()
  })

  it('projects the dish into dish_components, in stack order', async () => {
    const p = await create(chef)
    const rows = await chef.client.from('dish_components').select('component_key, name, role, image_url, position').eq('project_id', p.id).order('position')
    assert.deepEqual(rows.data?.map((r) => [r.component_key, r.name, r.role, r.position]), [
      ['c1', 'Seared duck breast', 'hero', 0],
      ['c2', 'Celeriac puree', 'support', 1],
      ['c3', 'Red wine jus', 'sauce', 2],
      ['c4', 'Micro chervil', 'garnish', 3],
    ])
    assert.match(rows.data![0].image_url, /duck\.png$/)
    assert.equal(rows.data![1].image_url, null)
  })

  it('projects each plating with its direction and the chef’s edits', async () => {
    const p = await create(chef)
    const rows = await chef.client.from('platings').select('spec_id, name, position, composition, plate, sauce, height, garnish, notes, seed, overrides, tweaks, copies').eq('project_id', p.id).order('position')
    assert.equal(rows.data?.length, 2)
    const [one, two] = rows.data!
    assert.equal(one.spec_id, 'spec-1')
    assert.equal(one.composition, 'centered')
    assert.equal(one.plate, 'round-white')
    assert.equal(one.notes, 'lean the duck on the puree')
    assert.equal(Number(one.seed), 4242)
    assert.deepEqual(one.overrides, { 'c1:0': { x: 0.2, y: -0.1 } })
    assert.deepEqual(one.tweaks, { 'c2:0': { s: 1.2 } })
    assert.deepEqual(one.copies, { c2: 2 })
    assert.deepEqual([two.composition, two.plate, two.sauce], ['linear', 'black-slate', 'dotted'])
  })

  it('keeps the shallow bowl as the plate, and still drops a plate name it does not know', async () => {
    const p = await create(chef, richDish(), [
      rich('spec-1', { plate: 'shallow-bowl' }),
      rich('spec-2', { plate: 'dinner-tray' }),
    ])
    const rows = await chef.client.from('platings').select('spec_id, plate').eq('project_id', p.id).order('position')
    assert.deepEqual(rows.data?.map((r) => [r.spec_id, r.plate]), [['spec-1', 'shallow-bowl'], ['spec-2', null]])
  })

  it('follows edits: renames, removals and additions, keeping the id of what stays', async () => {
    const p = await create(chef)
    const before = await chef.client.from('platings').select('id, spec_id').eq('project_id', p.id)
    const keepId = before.data!.find((r) => r.spec_id === 'spec-2')!.id

    const d = richDish()
    d.components = [d.components[0], { ...d.components[2], name: 'Reduced jus' }, { id: 'c9', name: 'Pickled shallot', role: 'garnish', imagePath: null }]
    const up = await chef.client.from('projects').update({ dish: d, spread: [rich('spec-2'), rich('spec-3')] }).eq('id', p.id)
    assert.equal(up.error, null)

    const comps = await chef.client.from('dish_components').select('component_key, name, position').eq('project_id', p.id).order('position')
    assert.deepEqual(comps.data?.map((r) => [r.component_key, r.name]), [['c1', 'Seared duck breast'], ['c3', 'Reduced jus'], ['c9', 'Pickled shallot']])

    const after = await chef.client.from('platings').select('id, spec_id, position').eq('project_id', p.id).order('position')
    assert.deepEqual(after.data?.map((r) => r.spec_id), ['spec-2', 'spec-3'])
    assert.equal(after.data![0].id, keepId, 'a plating that stays keeps its row (and anything pointing at it)')
  })

  it('records the consultant’s answer in reviews, pointing at the picked plating', async () => {
    const p = await create(chef)
    assert.equal((await chef.client.from('reviews').select('id').eq('project_id', p.id)).data?.length, 0, 'no answer yet, no row')

    const answer = await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'Sam Consultant', p_picked: 'spec-2', p_comment: 'The linear one.' })
    assert.equal(answer.error, null)

    const review = await chef.client.from('reviews').select('reviewer, picked_spec_id, picked_plating_id, comment, reviewed_at').eq('project_id', p.id).single()
    assert.equal(review.data?.reviewer, 'Sam Consultant')
    assert.equal(review.data?.comment, 'The linear one.')
    assert.ok(review.data?.reviewed_at)
    const picked = await chef.client.from('platings').select('spec_id, plate').eq('id', review.data!.picked_plating_id).single()
    assert.deepEqual([picked.data?.spec_id, picked.data?.plate], ['spec-2', 'black-slate'])

    // Answering again replaces, not duplicates.
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'Sam Consultant', p_picked: 'spec-1', p_comment: 'Changed my mind.' })
    const again = await chef.client.from('reviews').select('picked_spec_id, comment').eq('project_id', p.id)
    assert.deepEqual(again.data, [{ picked_spec_id: 'spec-1', comment: 'Changed my mind.' }])
  })

  it('removes the review row when the picked plating is removed', async () => {
    const p = await create(chef)
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: 'spec-2', p_comment: 'x' })
    assert.equal((await chef.client.from('reviews').select('id').eq('project_id', p.id)).data?.length, 1)
    await chef.client.from('projects').update({ spread: [rich('spec-1')] }).eq('id', p.id)
    assert.equal((await chef.client.from('reviews').select('id').eq('project_id', p.id)).data?.length, 0)
  })

  it('cascades when the project is deleted', async () => {
    const p = await create(chef)
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: 'spec-1', p_comment: '' })
    assert.equal((await chef.client.from('projects').delete().eq('id', p.id)).error, null)
    const svc = service()
    for (const table of ['dish_components', 'platings', 'reviews']) {
      assert.equal((await svc.from(table).select('id').eq('project_id', p.id)).data?.length, 0, `${table} emptied`)
    }
  })

  it('tolerates malformed JSON: only the valid pieces are projected, and the write still succeeds', async () => {
    const hostile = {
      id: 'd', name: 'Hostile', createdAt: 'x',
      components: [
        'not an object', null, 7, { name: 'no id' }, { id: '' },
        { id: 'ok', name: 'Fine', role: 'hero' },
        { id: 'ok', name: 'Duplicate id', role: 'hero' },
        { id: 'weird', name: 'x'.repeat(500), role: 'wizard', imagePath: '' },
      ],
    }
    const spreadHostile = [
      'nope', { name: 'no spec' }, { name: 'bad spec', spec: 'string' }, { name: 'no id', spec: {} },
      { name: 'Real', spec: { id: 'real', composition: 'made-up', plate: 'round-white', seed: 'not a number', overrides: 'x', tweaks: [], notes: 'n'.repeat(5000) } },
      { name: 'Seed too big', spec: { id: 'big', seed: '99999999999999999999999' } },
    ]
    const p = await create(chef, hostile, spreadHostile)
    const comps = await chef.client.from('dish_components').select('component_key, name, role').eq('project_id', p.id).order('position')
    assert.deepEqual(comps.data?.map((c) => c.component_key), ['ok', 'weird'])
    assert.equal(comps.data![0].name, 'Fine', 'the first of two duplicate ids wins')
    assert.equal(comps.data![1].role, null, 'an unknown role is dropped, not stored')
    assert.equal(comps.data![1].name.length, 200, 'long names are cut')

    const pl = await chef.client.from('platings').select('spec_id, composition, plate, seed, overrides, tweaks, notes').eq('project_id', p.id).order('position')
    assert.deepEqual(pl.data?.map((r) => r.spec_id), ['real', 'big'])
    assert.equal(pl.data![0].composition, null, 'an unknown direction is dropped')
    assert.equal(pl.data![0].plate, 'round-white')
    assert.equal(pl.data![0].seed, null, 'a non-numeric seed becomes null')
    assert.deepEqual([pl.data![0].overrides, pl.data![0].tweaks], [{}, {}], 'wrongly-typed objects become empty')
    assert.equal(pl.data![0].notes.length, 2000)
    assert.equal(pl.data![1].seed, null, 'an out-of-range seed becomes null')
  })

  it('a malformed review date does not block the write', async () => {
    const p = await makeProject(chef)
    const svc = service()
    const r = await svc.from('projects').update({ review: { reviewer: 'x', pickedSpecId: null, comment: '', reviewedAt: 'not-a-date' } }).eq('id', p.id)
    assert.equal(r.error, null)
    assert.equal((await svc.from('reviews').select('id').eq('project_id', p.id)).data?.length, 0)
  })
})

suite('relational tables: access', () => {
  it('shows each table only to people who can see the project, and nobody can write to them', async () => {
    const [alice, bob, admin] = await Promise.all([makeUser(), makeUser(), makeUser({ role: 'admin' })])
    const p = await create(alice)
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'C', p_picked: 'spec-1', p_comment: '' })

    for (const table of ['dish_components', 'platings', 'reviews']) {
      assert.ok(((await alice.client.from(table).select('id').eq('project_id', p.id)).data?.length ?? 0) > 0, `${table}: owner sees`)
      assert.equal((await bob.client.from(table).select('id').eq('project_id', p.id)).data?.length, 0, `${table}: another user does not`)
      assert.ok(((await admin.client.from(table).select('id').eq('project_id', p.id)).data?.length ?? 0) > 0, `${table}: admin sees`)
      assert.equal((await anon().from(table).select('id').eq('project_id', p.id)).data?.length ?? 0, 0, `${table}: visitor does not`)
    }

    const comp = (await alice.client.from('dish_components').select('id').eq('project_id', p.id).limit(1).single()).data!
    await alice.client.from('dish_components').update({ name: 'Hacked' }).eq('id', comp.id)
    const check = await service().from('dish_components').select('name').eq('id', comp.id).single()
    assert.notEqual(check.data?.name, 'Hacked', 'owner cannot edit the projection')
    assert.ok((await alice.client.from('platings').insert({ project_id: p.id, spec_id: 'x', position: 9 })).error, 'cannot insert')
    assert.ok((await alice.client.from('reviews').insert({ project_id: bob.id, reviewed_at: new Date().toISOString() })).error, 'cannot insert')
    const del = await alice.client.from('platings').delete().eq('project_id', p.id).select()
    assert.equal(del.data?.length ?? 0, 0, 'cannot delete')
    assert.ok(((await service().from('platings').select('id').eq('project_id', p.id)).data?.length ?? 0) === 2, 'still intact')
  })

  it('keeps the sync functions private', async () => {
    const u = await makeUser()
    const p = await makeProject(u)
    for (const c of [u.client, anon()]) assert.ok((await c.rpc('sync_project_tables', { p: { id: p.id } })).error)
  })
})

suite('reporting views', () => {
  it('project_overview summarises each project for its owner, and everyone’s for an admin', async () => {
    const [chef, other, admin] = await Promise.all([makeUser({ name: 'Overview Chef' }), makeUser(), makeUser({ role: 'admin' })])
    const p = await create(chef)
    await anon().rpc('submit_review', { p_share_id: p.shareId, p_reviewer: 'Reviewer', p_picked: 'spec-2', p_comment: 'nice' })

    const mine = await chef.client.from('project_overview').select('*').eq('id', p.id).single()
    assert.equal(mine.error, null)
    assert.equal(Number(mine.data?.component_count), 4)
    assert.equal(Number(mine.data?.photo_count), 1)
    assert.equal(Number(mine.data?.plating_count), 2)
    assert.equal(mine.data?.reviewer, 'Reviewer')
    assert.equal(mine.data?.picked_plating, 'Plating spec-2')
    assert.equal(mine.data?.owner_name, 'Overview Chef')

    assert.equal((await other.client.from('project_overview').select('id').eq('id', p.id)).data?.length, 0)
    assert.equal((await admin.client.from('project_overview').select('id').eq('id', p.id)).data?.length, 1)
    assert.ok((await anon().from('project_overview').select('id').limit(1)).error, 'visitors have no access')
  })

  it('direction_popularity counts what was offered and what was picked', async () => {
    const chef = await makeUser()
    const admin = await makeUser({ role: 'admin' })
    const unique = { composition: 'negative-space', plate: 'coupe-grey', sauce: 'smeared' }
    const a = await create(chef, richDish(), [rich('spec-1', unique), rich('spec-2')])
    await create(chef, richDish(), [rich('spec-1', unique), rich('spec-2')])
    await anon().rpc('submit_review', { p_share_id: a.shareId, p_reviewer: 'C', p_picked: 'spec-1', p_comment: '' })

    // The owner sees their own numbers.
    const mine = await chef.client.from('direction_popularity').select('*').match(unique).single()
    assert.equal(Number(mine.data?.times_offered), 2)
    assert.equal(Number(mine.data?.times_picked), 1)
    assert.equal(Number(mine.data?.pick_rate_pct), 50)

    // An administrator sees at least that, across everyone.
    const all = await admin.client.from('direction_popularity').select('times_offered').match(unique).single()
    assert.ok(Number(all.data?.times_offered) >= 2)
  })
})

suite('backfill', () => {
  it('rebuilds the tables for projects that already exist (what the migration does to old data)', async () => {
    const chef = await makeUser()
    const p = await create(chef)
    const svc = service()
    // Simulate rows that pre-date the migration: empty the projections, then run the same backfill loop.
    await svc.from('reviews').delete().eq('project_id', p.id)
    await svc.from('platings').delete().eq('project_id', p.id)
    await svc.from('dish_components').delete().eq('project_id', p.id)
    assert.equal((await svc.from('platings').select('id').eq('project_id', p.id)).data?.length, 0)
    // Touching the project re-runs the sync, exactly like the backfill loop does for each row.
    await svc.from('projects').update({ dish: richDish() }).eq('id', p.id)
    assert.equal((await svc.from('dish_components').select('id').eq('project_id', p.id)).data?.length, 4)
    assert.equal((await svc.from('platings').select('id').eq('project_id', p.id)).data?.length, 2)
  })
})

