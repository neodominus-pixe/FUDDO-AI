// Imports the data from the original (SQLite) version of FUDDO AI into Supabase.
//
//   npm run import:legacy -- --db path/to/studio.sqlite [--uploads path/to/public/uploads] [--dry-run]
//
// What moves:
//   accounts   email, name, role, suspended status. Passwords cannot move: the old scrypt hashes are not a format
//              Supabase Auth accepts. Each account gets a random password nobody knows; people choose their own with
//              "Forgot password?" on the sign-in page (or an administrator sets one in /admin).
//   projects   dish, spread, review and timestamps. Review links keep the SAME share id, so links you already sent
//              to consultants still work.
//   photos     component photos found in --uploads are uploaded to Supabase Storage and the project is updated to
//              point at the new address.
// Safe to run twice: accounts and projects that already exist are skipped. The SQLite file is opened read-only.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const { values: args } = parseArgs({
  options: {
    db: { type: 'string' },
    uploads: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
})

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

if (!args.db) fail('Usage: npm run import:legacy -- --db path/to/studio.sqlite [--uploads path/to/public/uploads] [--dry-run]')
if (!existsSync(args.db)) fail(`Database not found: ${args.db}`)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local) first.')

const dry = args['dry-run']
const supabase = createClient(url, key, { auth: { persistSession: false } })
const legacy = new DatabaseSync(args.db, { readOnly: true })

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const report = { users: { created: 0, existing: 0, failed: 0 }, projects: { created: 0, existing: 0, failed: 0 }, photos: { moved: 0, missing: 0 } }

// ---------------------------------------------------------------------------------------- accounts
const oldUsers = legacy.prepare('SELECT id, email, name, role, disabled, createdAt FROM users ORDER BY createdAt').all()
const idMap = new Map() // old user id -> new auth user id

async function findUserId(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return hit.id
    if (data.users.length < 200) return null
  }
}

for (const u of oldUsers) {
  const email = String(u.email).trim().toLowerCase()
  if (dry) {
    console.log(`[dry-run] account ${email} (${u.role}${u.disabled ? ', suspended' : ''})`)
    report.users.created++
    continue
  }
  try {
    await supabase.rpc('allow_registration', { p_email: email }) // lets the account through even if sign-up is closed
    const created = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomBytes(24).toString('base64url'),
      user_metadata: { name: u.name },
    })
    let id = created.data.user?.id
    if (created.error) {
      if (created.error.code !== 'email_exists') throw new Error(created.error.message)
      id = await findUserId(email)
      report.users.existing++
    } else {
      report.users.created++
    }
    if (!id) throw new Error('account exists but could not be found')
    idMap.set(u.id, id)

    const { error } = await supabase
      .from('profiles')
      .update({ role: u.role === 'admin' ? 'admin' : 'user', disabled: Boolean(u.disabled), name: String(u.name).slice(0, 100) })
      .eq('id', id)
    if (error) throw new Error(error.message)
    if (u.disabled) await supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' })
  } catch (error) {
    report.users.failed++
    console.error(`  account ${email}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------------------- photos
const uploadsDir = args.uploads
async function movePhoto(imagePath, ownerId) {
  if (!imagePath || !imagePath.startsWith('/uploads/')) return imagePath // already a full address, or none
  const file = uploadsDir && path.join(uploadsDir, path.basename(imagePath))
  const mime = MIME[path.extname(imagePath).toLowerCase()]
  if (!file || !existsSync(file) || !mime) {
    report.photos.missing++
    return null // the photo is gone; the component simply has none
  }
  if (dry) {
    report.photos.moved++
    return imagePath
  }
  const target = `${ownerId ?? 'legacy'}/legacy-${path.basename(imagePath)}`
  const { error } = await supabase.storage.from('media').upload(target, readFileSync(file), { contentType: mime, upsert: true })
  if (error) {
    report.photos.missing++
    return null
  }
  report.photos.moved++
  return supabase.storage.from('media').getPublicUrl(target).data.publicUrl
}

// ---------------------------------------------------------------------------------------- projects
const oldProjects = legacy.prepare('SELECT id, ownerId, shareId, dishJson, spreadJson, reviewJson, createdAt, updatedAt FROM projects ORDER BY createdAt').all()

for (const p of oldProjects) {
  try {
    const dish = JSON.parse(p.dishJson)
    const spread = JSON.parse(p.spreadJson)
    const review = JSON.parse(p.reviewJson)
    const ownerId = p.ownerId ? (idMap.get(p.ownerId) ?? null) : null

    if (!dry) {
      const existing = await supabase.from('projects').select('id').eq('share_id', p.shareId).maybeSingle()
      if (existing.data) {
        report.projects.existing++
        continue
      }
    }
    for (const c of dish.components ?? []) c.imagePath = await movePhoto(c.imagePath, ownerId)

    if (dry) {
      console.log(`[dry-run] project "${dish.name}" (${spread.length} platings, link ${p.shareId})`)
      report.projects.created++
      continue
    }
    const { error } = await supabase.from('projects').insert({
      owner_id: ownerId,
      share_id: p.shareId, // unchanged, so links already sent keep working
      dish,
      spread,
      review,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })
    if (error) throw new Error(error.message)
    report.projects.created++
  } catch (error) {
    report.projects.failed++
    console.error(`  project ${p.id}: ${error.message}`)
  }
}

legacy.close()

const { users, projects, photos } = report
console.log(`\n${dry ? 'Dry run: nothing was written.\n' : ''}Accounts  ${users.created} ${dry ? 'would be ' : ''}created, ${users.existing} already existed, ${users.failed} failed`)
console.log(`Projects  ${projects.created} ${dry ? 'would be ' : ''}created, ${projects.existing} already existed, ${projects.failed} failed`)
console.log(`Photos    ${photos.moved} ${dry ? 'would be ' : ''}moved, ${photos.missing} not found`)
if (!dry && users.created) {
  console.log('\nImported accounts have random passwords. Tell people to use "Forgot password?" on the sign-in page.')
}
if (users.failed || projects.failed) process.exit(2)
