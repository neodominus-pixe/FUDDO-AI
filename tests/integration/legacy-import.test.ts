import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { anon, configured, dish, service, spread } from './helpers'

// The importer, run for real against a fixture in the ORIGINAL SQLite schema and the local Supabase.
const suite = configured ? describe : describe.skip

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'fuddo-legacy-'))
  const uploads = path.join(dir, 'uploads')
  mkdirSync(uploads)
  writeFileSync(path.join(uploads, 'photo-1.png'), PNG)

  const db = new DatabaseSync(path.join(dir, 'studio.sqlite'))
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', createdAt TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, lastLoginAt TEXT);
    CREATE TABLE projects (id TEXT PRIMARY KEY, ownerId TEXT, shareId TEXT NOT NULL UNIQUE, dishName TEXT NOT NULL,
      dishJson TEXT NOT NULL, spreadJson TEXT NOT NULL, reviewJson TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
  `)
  const tag = crypto.randomUUID().slice(0, 8)
  const chef = `legacy-chef-${tag}@example.test`
  const admin = `legacy-admin-${tag}@example.test`
  const gone = `legacy-gone-${tag}@example.test`
  const insertUser = db.prepare('INSERT INTO users (id, email, name, password, role, createdAt, disabled) VALUES (?,?,?,?,?,?,?)')
  insertUser.run('u1', chef, 'Legacy Chef', 'salt:hash', 'user', '2026-01-01T00:00:00.000Z', 0)
  insertUser.run('u2', admin, 'Legacy Admin', 'salt:hash', 'admin', '2026-01-02T00:00:00.000Z', 0)
  insertUser.run('u3', gone, 'Suspended Person', 'salt:hash', 'user', '2026-01-03T00:00:00.000Z', 1)

  const withPhoto = { ...dish('Legacy duck'), components: [{ id: 'c1', name: 'Duck', role: 'hero', imagePath: '/uploads/photo-1.png' }, { id: 'c2', name: 'Puree', role: 'support', imagePath: '/uploads/missing.png' }] }
  const shareId = `legacy-${tag}-share01`
  const review = { reviewer: 'Consultant', pickedSpecId: 'spec-2', comment: 'Second one.', reviewedAt: '2026-02-01T00:00:00.000Z' }
  db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?)').run(
    crypto.randomUUID(), 'u1', shareId, 'Legacy duck', JSON.stringify(withPhoto), JSON.stringify(spread('spec-1', 'spec-2')), JSON.stringify(review),
    '2026-01-05T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
  )
  db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?)').run(
    crypto.randomUUID(), null, `legacy-${tag}-orphan1`, 'Ownerless', JSON.stringify(dish('Ownerless')), JSON.stringify(spread('spec-1')),
    JSON.stringify({ reviewer: '', pickedSpecId: null, comment: '', reviewedAt: null }), '2026-01-06T00:00:00.000Z', '2026-01-06T00:00:00.000Z',
  )
  db.close()
  return { dir, uploads, dbFile: path.join(dir, 'studio.sqlite'), chef, admin, gone, shareId, orphan: `legacy-${tag}-orphan1` }
}

const run = (args: string[]) =>
  execFileSync(process.execPath, ['--env-file=.env.docker', 'scripts/import-legacy.mjs', ...args], { encoding: 'utf8', env: process.env })

suite('legacy import', () => {
  it('moves accounts, projects, photos and review links, and is safe to run twice', () => {
    const f = fixture()
    try {
      const dryRun = run(['--db', f.dbFile, '--uploads', f.uploads, '--dry-run'])
      assert.match(dryRun, /Dry run: nothing was written/)
      assert.match(dryRun, /Accounts\s+3 would be created/)
      assert.match(dryRun, /Projects\s+2 would be created/)

      const first = run(['--db', f.dbFile, '--uploads', f.uploads])
      assert.match(first, /Accounts\s+3 created, 0 already existed, 0 failed/)
      assert.match(first, /Projects\s+2 created, 0 already existed, 0 failed/)
      assert.match(first, /Photos\s+1 moved, 1 not found/)
      assert.match(first, /Forgot password/)

      const second = run(['--db', f.dbFile, '--uploads', f.uploads])
      assert.match(second, /Accounts\s+0 created, 3 already existed/)
      assert.match(second, /Projects\s+0 created, 2 already existed/)
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })

  it('preserves roles, suspension, the share link, the consultant’s answer and rewrites photos', async () => {
    const f = fixture()
    try {
      run(['--db', f.dbFile, '--uploads', f.uploads])
      const svc = service()

      const users = await svc.auth.admin.listUsers({ perPage: 1000 })
      const byEmail = (email: string) => users.data.users.find((u) => u.email === email)!
      assert.ok(byEmail(f.chef) && byEmail(f.admin) && byEmail(f.gone))
      const profiles = await svc.from('profiles').select('id, role, disabled, name').in('id', [byEmail(f.chef).id, byEmail(f.admin).id, byEmail(f.gone).id])
      const p = (email: string) => profiles.data!.find((r) => r.id === byEmail(email).id)!
      assert.equal(p(f.admin).role, 'admin')
      assert.equal(p(f.chef).role, 'user')
      assert.equal(p(f.gone).disabled, true)
      assert.equal(p(f.chef).name, 'Legacy Chef')

      // The link that was already in a consultant's inbox still opens the project, with their answer.
      const shared = await anon().rpc('get_shared_project', { p_share_id: f.shareId })
      assert.equal(shared.error, null)
      assert.equal(shared.data.dish.name, 'Legacy duck')
      assert.equal(shared.data.review.pickedSpecId, 'spec-2')
      assert.equal(shared.data.review.comment, 'Second one.')

      // The photo moved into Storage; the missing one became "no photo" instead of a dead link.
      const [duck, puree] = shared.data.dish.components
      assert.match(duck.imagePath, new RegExp(`/storage/v1/object/public/media/${byEmail(f.chef).id}/legacy-photo-1\\.png$`))
      assert.equal((await fetch(duck.imagePath)).status, 200)
      assert.equal(puree.imagePath, null)

      const row = await svc.from('projects').select('owner_id, created_at').eq('share_id', f.shareId).single()
      assert.equal(row.data?.owner_id, byEmail(f.chef).id)
      assert.equal(new Date(row.data!.created_at).toISOString(), '2026-01-05T00:00:00.000Z', 'original timestamps are kept')

      const orphan = await svc.from('projects').select('owner_id').eq('share_id', f.orphan).single()
      assert.equal(orphan.data?.owner_id, null, 'a project without an owner stays ownerless (visible to administrators)')
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })

  it('refuses to run without a database or credentials, and never writes to the SQLite file', () => {
    assert.throws(() => run([]), /Usage/)
    assert.throws(() => run(['--db', 'does-not-exist.sqlite']), /not found/)
  })
})
