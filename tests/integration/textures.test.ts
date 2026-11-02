import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import { anon, configured, makeUser, service } from './helpers'

// The ingredient texture library: who may read it, who may write it, and that two chefs asking for the same
// missing texture at once result in exactly one maker.
const suite = configured ? describe : describe.skip

const key = () => `test-${randomUUID().slice(0, 8)}`
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64'))

suite('ingredient texture library', () => {
  it('lets anyone read a finished texture, and nothing else', async () => {
    const svc = service()
    const ready = key()
    const pending = key()
    await svc.from('ingredient_textures').insert([
      { key: ready, name: 'Ready', status: 'ready', path: `ingredients/${ready}.png`, mime: 'image/png' },
      { key: pending, name: 'Pending', status: 'pending' },
    ])
    const user = await makeUser()
    for (const client of [anon(), user.client]) {
      const rows = (await client.from('ingredient_textures').select('key').in('key', [ready, pending])).data ?? []
      assert.deepEqual(rows.map((r) => r.key), [ready], 'only the finished one is visible')
    }
    await svc.from('ingredient_textures').delete().in('key', [ready, pending])
  })

  it('lets an administrator see everything', async () => {
    const svc = service()
    const pending = key()
    await svc.from('ingredient_textures').insert({ key: pending, name: 'Pending', status: 'pending' })
    const admin = await makeUser({ role: 'admin' })
    const rows = (await admin.client.from('ingredient_textures').select('key').eq('key', pending)).data ?? []
    assert.equal(rows.length, 1)
    await svc.from('ingredient_textures').delete().eq('key', pending)
  })

  it('refuses writes from anyone but the server', async () => {
    const user = await makeUser()
    const k = key()
    for (const client of [anon(), user.client]) {
      assert.ok((await client.from('ingredient_textures').insert({ key: k, name: 'Mine', status: 'ready', path: 'x' })).error, 'cannot insert')
      assert.equal((await client.from('ingredient_textures').update({ name: 'Hijacked' }).eq('key', k).select()).data?.length ?? 0, 0, 'cannot update')
      assert.equal((await client.from('ingredient_textures').delete().eq('key', k).select()).data?.length ?? 0, 0, 'cannot delete')
      assert.ok((await client.rpc('claim_ingredient_texture', { p_key: k, p_name: 'Mine', p_user: null })).error, 'cannot claim')
    }
  })

  it('refuses a key that is not normalised, and a ready texture with no image', async () => {
    const svc = service()
    assert.ok((await svc.from('ingredient_textures').insert({ key: 'Duck Breast', name: 'x' })).error, 'upper case')
    assert.ok((await svc.from('ingredient_textures').insert({ key: ' duck', name: 'x' })).error, 'padded')
    assert.ok((await svc.from('ingredient_textures').insert({ key: key(), name: 'x', status: 'ready' })).error, 'ready needs a path')
  })

  it('gives the work to exactly one of several simultaneous askers', async () => {
    const svc = service()
    const k = key()
    const answers = await Promise.all(
      Array.from({ length: 8 }, () => svc.rpc('claim_ingredient_texture', { p_key: k, p_name: 'Duck', p_user: null })),
    )
    assert.equal(answers.filter((a) => a.data === true).length, 1)
    assert.ok(answers.every((a) => !a.error))
    await svc.from('ingredient_textures').delete().eq('key', k)
  })

  it('does not hand out a texture that is ready, or being made or recently failed, but takes over a stalled claim', async () => {
    const svc = service()
    const claim = async (k: string) => (await svc.rpc('claim_ingredient_texture', { p_key: k, p_name: 'x', p_user: null })).data
    const done = key()
    await svc.from('ingredient_textures').insert({ key: done, name: 'x', status: 'ready', path: 'ingredients/x.png' })
    assert.equal(await claim(done), false, 'ready')

    const busy = key()
    assert.equal(await claim(busy), true)
    assert.equal(await claim(busy), false, 'someone is making it')

    const stalled = key()
    await svc.from('ingredient_textures').insert({ key: stalled, name: 'x', status: 'pending', claimed_at: new Date(Date.now() - 10 * 60_000).toISOString() })
    assert.equal(await claim(stalled), true, 'a claim that never finished is given up')

    const failedRecently = key()
    await svc.from('ingredient_textures').insert({ key: failedRecently, name: 'x', status: 'failed', error: 'boom' })
    assert.equal(await claim(failedRecently), false, 'not retried straight away')

    await svc.from('ingredient_textures').delete().in('key', [done, busy, stalled, failedRecently])
  })

  it('stores a texture in the public bucket where anyone can fetch it', async () => {
    const svc = service()
    const k = key()
    const path = `ingredients/${k}.png`
    const up = await svc.storage.from('media').upload(path, PNG, { contentType: 'image/png' })
    assert.equal(up.error, null, up.error?.message)
    await svc.from('ingredient_textures').insert({ key: k, name: 'Pixel', status: 'ready', path, mime: 'image/png' })
    const url = svc.storage.from('media').getPublicUrl(path).data.publicUrl
    const res = await fetch(url)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
    await svc.storage.from('media').remove([path])
    await svc.from('ingredient_textures').delete().eq('key', k)
  })

  it('does not let a chef write into the ingredients folder of the bucket', async () => {
    const user = await makeUser()
    const up = await user.client.storage.from('media').upload(`ingredients/${key()}.png`, PNG, { contentType: 'image/png' })
    assert.ok(up.error, 'only the server writes there')
  })
})
