import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { anon, codeOf, configured, makeUser, PASSWORD, service } from './helpers'

// Roles as a real list (user_role enum) and pre-assigning a role by email (role_invites).
const suite = configured ? describe : describe.skip

const email = (tag = 'r') => `${tag}-${crypto.randomUUID().slice(0, 8)}@example.test`

/** Creates an account the way the Supabase dashboard's "Add user" does. */
async function addUser(address: string, confirmed: boolean) {
  const svc = service()
  await svc.rpc('allow_registration', { p_email: address })
  const { data, error } = await svc.auth.admin.createUser({ email: address, password: PASSWORD, email_confirm: confirmed })
  assert.equal(error, null, error?.message)
  return data.user!.id
}
const roleOf = async (id: string) => (await service().from('profiles').select('role').eq('id', id).single()).data?.role
const inviteExists = async (address: string) => ((await service().from('role_invites').select('email').eq('email', address)).data?.length ?? 0) > 0

suite('role is a list, defaulting to user', () => {
  it('starts everyone as a user', async () => {
    const u = await makeUser()
    assert.equal(await roleOf(u.id), 'user')
  })

  it('only accepts values from the list', async () => {
    const u = await makeUser()
    const svc = service()
    assert.ok((await svc.from('profiles').update({ role: 'chef' }).eq('id', u.id)).error, 'chef does not exist yet')
    assert.ok((await svc.from('profiles').update({ role: 'Admin' }).eq('id', u.id)).error, 'case matters')
    assert.ok((await svc.from('profiles').update({ role: 'superuser' }).eq('id', u.id)).error)
    assert.equal((await svc.from('profiles').update({ role: 'admin' }).eq('id', u.id)).error, null)
    assert.equal(await roleOf(u.id), 'admin')
  })

  it('the admin function refuses an unknown role with a clear error, and accepts a real one', async () => {
    const [admin, target] = await Promise.all([makeUser({ role: 'admin' }), makeUser()])
    const args = (role: string) => ({ p_id: target.id, p_name: 'Renamed', p_email: target.email, p_role: role, p_disabled: false })
    assert.equal(codeOf((await admin.client.rpc('admin_apply_profile_update', args('chef'))).error), 'PT400')
    assert.equal(codeOf((await admin.client.rpc('admin_check_profile_update', { p_id: target.id, p_role: 'nonsense', p_disabled: false })).error), 'PT400')
    assert.equal((await admin.client.rpc('admin_apply_profile_update', args('admin'))).error, null)
    assert.equal(await roleOf(target.id), 'admin')
    const ev = await admin.client.from('admin_events').select('details').eq('target_id', target.id).eq('action', 'Updated account').order('id', { ascending: false }).limit(1).single()
    assert.equal(ev.data?.details.role, 'admin')
    assert.equal(ev.data?.details.previousRole, 'user')
  })

  it('still protects the last administrator and self-demotion, now with the enum', async () => {
    const admin = await makeUser({ role: 'admin' })
    const demoteSelf = await admin.client.rpc('admin_check_profile_update', { p_id: admin.id, p_role: 'user', p_disabled: false })
    assert.equal(codeOf(demoteSelf.error), 'PT400')
  })

  it('shows the role in the admin overview', async () => {
    const admin = await makeUser({ role: 'admin' })
    const overview = (await admin.client.rpc('admin_overview')).data
    assert.equal(overview.users.find((u: { id: string }) => u.id === admin.id).role, 'admin')
  })
})

suite('deciding a role before the person exists', () => {
  it('makes an invited, confirmed account an admin, and uses the invite up', async () => {
    const address = email('boss')
    const svc = service()
    // Typed with capitals and spaces, the way someone would in the Table Editor.
    assert.equal((await svc.from('role_invites').insert({ email: `  ${address.toUpperCase()}  `, role: 'admin', note: 'co-founder' })).error, null)
    assert.ok(await inviteExists(address), 'stored lower-cased')

    const id = await addUser(address, true)
    assert.equal(await roleOf(id), 'admin')
    assert.equal(await inviteExists(address), false, 'the invite is consumed')
  })

  it('leaves an account without an invite as a user', async () => {
    assert.equal(await roleOf(await addUser(email('plain'), true)), 'user')
  })

  it('does not give the role to an unconfirmed sign-up, but does the moment the email is confirmed', async () => {
    const address = email('later')
    const svc = service()
    await svc.from('role_invites').insert({ email: address, role: 'admin' })

    const id = await addUser(address, false)
    assert.equal(await roleOf(id), 'user', 'nobody can claim an invited address just by typing it')
    assert.ok(await inviteExists(address), 'the invite waits')

    assert.equal((await svc.auth.admin.updateUserById(id, { email_confirm: true })).error, null)
    assert.equal(await roleOf(id), 'admin')
    assert.equal(await inviteExists(address), false)
  })

  it('works for the plain user role too, and ignores invites for other addresses', async () => {
    const mine = email('mine')
    const other = email('other')
    await service().from('role_invites').insert([{ email: mine, role: 'user' }, { email: other, role: 'admin' }])
    assert.equal(await roleOf(await addUser(mine, true)), 'user')
    assert.ok(await inviteExists(other), 'someone else’s invite is untouched')
    await service().from('role_invites').delete().eq('email', other)
  })

  it('is invisible and untouchable for everyone but you', async () => {
    const u = await makeUser()
    const address = email('secret')
    await service().from('role_invites').insert({ email: address, role: 'admin' })
    for (const client of [u.client, anon()]) {
      assert.equal((await client.from('role_invites').select('email')).data?.length ?? 0, 0, 'cannot read')
      assert.ok((await client.from('role_invites').insert({ email: email('self'), role: 'admin' })).error, 'cannot create')
      assert.equal((await client.from('role_invites').update({ role: 'user' }).eq('email', address).select()).data?.length ?? 0, 0, 'cannot change')
      assert.equal((await client.from('role_invites').delete().eq('email', address).select()).data?.length ?? 0, 0, 'cannot delete')
    }
    assert.ok(await inviteExists(address), 'still there')
    await service().from('role_invites').delete().eq('email', address)
  })

  it('rejects an invalid email or role', async () => {
    const svc = service()
    assert.ok((await svc.from('role_invites').insert({ email: 'not-an-email', role: 'admin' })).error)
    assert.ok((await svc.from('role_invites').insert({ email: email(), role: 'wizard' })).error)
  })
})
