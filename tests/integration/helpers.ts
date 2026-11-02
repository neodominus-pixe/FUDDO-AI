import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// Integration tests run against a real Supabase (the local one from `npx supabase start`).
// They create their own users and projects with random names and never depend on existing data.

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const configured = Boolean(URL && ANON && SERVICE)
export const PASSWORD = 'correct-horse-battery-staple'

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
export const anon = (): SupabaseClient => createClient(URL, ANON, options)
export const service = (): SupabaseClient => createClient(URL, SERVICE, options)

export type TestUser = { id: string; email: string; client: SupabaseClient }

/** Creates a confirmed account through the Auth admin API and returns a client signed in as them. */
export async function makeUser(opts: { role?: 'user' | 'admin'; name?: string } = {}): Promise<TestUser> {
  const svc = service()
  const email = `t-${randomUUID().slice(0, 8)}@example.test`
  await svc.rpc('allow_registration', { p_email: email }) // lets the account through even if a test closed sign-up
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: opts.name ?? 'Test Chef' },
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  if (opts.role === 'admin') {
    const { error: e } = await svc.from('profiles').update({ role: 'admin' }).eq('id', data.user.id)
    if (e) throw new Error(e.message)
  }
  const client = anon()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw new Error(`sign-in failed: ${signInError.message}`)
  return { id: data.user.id, email, client }
}

export const dish = (name = 'Test dish') => ({
  id: 'dish-1',
  name,
  components: [{ id: 'c1', name: 'Duck', role: 'hero', imagePath: null }],
  createdAt: new Date().toISOString(),
})

export const spec = (id: string) => ({
  id,
  composition: 'centered',
  plate: 'round-white',
  sauce: 'pooled',
  height: 'medium',
  garnish: 'moderate',
  notes: '',
  overrides: {},
  seed: 1,
})

export const spread = (...ids: string[]) => ids.map((id) => ({ name: `Plating ${id}`, spec: spec(id) }))

export async function makeProject(owner: TestUser, ids = ['spec-1', 'spec-2']) {
  const { data, error } = await owner.client
    .from('projects')
    .insert({ owner_id: owner.id, dish: dish(), spread: spread(...ids) })
    .select('id, share_id')
    .single()
  if (error) throw new Error(`insert project failed: ${error.message}`)
  return { id: data.id as string, shareId: data.share_id as string }
}

/** PostgREST reports `raise ... using errcode = 'PT404'` as HTTP 404 with code PT404. */
export const codeOf = (error: { code?: string } | null | undefined) => error?.code
