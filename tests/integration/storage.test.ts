import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { anon, configured, makeUser, service } from './helpers'

// Storage policies for the public "media" bucket: users write only inside their own folder, only images,
// and nothing under generated/ (which belongs to the server).
const suite = configured ? describe : describe.skip

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const png = () => new Blob([PNG], { type: 'image/png' })
const name = () => `${crypto.randomUUID()}.png`

suite('media bucket', () => {
  it('lets a user upload into their own folder, and anyone read it by URL', async () => {
    const u = await makeUser()
    const path = `${u.id}/${name()}`
    const up = await u.client.storage.from('media').upload(path, png(), { contentType: 'image/png' })
    assert.equal(up.error, null)
    const url = u.client.storage.from('media').getPublicUrl(path).data.publicUrl
    const res = await fetch(url)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
  })

  it('refuses uploads into someone else’s folder, into generated/, and from visitors', async () => {
    const a = await makeUser()
    const b = await makeUser()
    assert.ok((await a.client.storage.from('media').upload(`${b.id}/${name()}`, png(), { contentType: 'image/png' })).error, 'another user’s folder')
    assert.ok((await a.client.storage.from('media').upload(`generated/${name()}`, png(), { contentType: 'image/png' })).error, 'server-only folder')
    assert.ok((await a.client.storage.from('media').upload(name(), png(), { contentType: 'image/png' })).error, 'bucket root')
    assert.ok((await anon().storage.from('media').upload(`${a.id}/${name()}`, png(), { contentType: 'image/png' })).error, 'visitor')
  })

  it('accepts only images', async () => {
    const u = await makeUser()
    const bad = await u.client.storage.from('media').upload(`${u.id}/${crypto.randomUUID()}.html`, new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), { contentType: 'text/html' })
    assert.ok(bad.error, 'html refused')
    const gif = await u.client.storage.from('media').upload(`${u.id}/${crypto.randomUUID()}.gif`, new Blob([Uint8Array.from([71, 73, 70])], { type: 'image/gif' }), { contentType: 'image/gif' })
    assert.ok(gif.error, 'gif refused')
  })

  it('lets a user delete their own files but not other people’s', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const path = `${a.id}/${name()}`
    assert.equal((await a.client.storage.from('media').upload(path, png(), { contentType: 'image/png' })).error, null)

    const theirs = await b.client.storage.from('media').remove([path])
    assert.equal(theirs.data?.length ?? 0, 0, 'b removed nothing')
    assert.equal((await fetch(a.client.storage.from('media').getPublicUrl(path).data.publicUrl)).status, 200, 'still there')

    const mine = await a.client.storage.from('media').remove([path])
    assert.equal(mine.data?.length, 1)
    assert.ok((await fetch(a.client.storage.from('media').getPublicUrl(path).data.publicUrl)).status >= 400, 'gone')
  })

  it('cannot overwrite another user’s file even by knowing its path', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const path = `${a.id}/${name()}`
    await a.client.storage.from('media').upload(path, png(), { contentType: 'image/png' })
    assert.ok((await b.client.storage.from('media').upload(path, png(), { contentType: 'image/png', upsert: true })).error)
  })

  it('lets the server (and only the server) write generated images', async () => {
    const path = `generated/${name()}`
    const up = await service().storage.from('media').upload(path, png(), { contentType: 'image/png', upsert: true })
    assert.equal(up.error, null)
    assert.equal((await fetch(service().storage.from('media').getPublicUrl(path).data.publicUrl)).status, 200)
    await service().storage.from('media').remove([path])
  })

  it('suspended accounts cannot upload', async () => {
    const u = await makeUser()
    await service().from('profiles').update({ disabled: true }).eq('id', u.id)
    assert.ok((await u.client.storage.from('media').upload(`${u.id}/${name()}`, png(), { contentType: 'image/png' })).error)
  })
})
