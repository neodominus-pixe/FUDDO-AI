// Grants administrator access to an existing account.
//   npm run admin:grant -- chef@example.com
// Runs on the server (or your laptop) with the service key; there is deliberately no way to do this from the app.
import { createClient } from '@supabase/supabase-js'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run admin:grant -- chef@example.com')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local) first.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

// The Auth admin API has no lookup by email, so page through the accounts.
let userId = null
for (let page = 1; !userId; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
  if (error) {
    console.error(`Could not list accounts: ${error.message}`)
    process.exit(1)
  }
  userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null
  if (data.users.length < 200) break
}
if (!userId) {
  console.error('Account not found. Sign up in the app first.')
  process.exit(1)
}

const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId)
if (error) {
  console.error(`Could not grant access: ${error.message}`)
  process.exit(1)
}
console.log(`Admin access granted to ${email}.`)
