import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { randomUUID } from 'node:crypto'
import type { AdminData } from '../admin-types'
import { config } from '../config'
import type { IngredientTexture } from '../ingredients'
import { DishSchema, SpreadEntrySchema } from '../schemas'
import type { Dish } from '../types'
import { REMEMBER_COOKIE, REMEMBER_SECONDS, sessionCookie } from './cookies'
import { databaseLimiter, memoryLimiter } from './limiter'
import {
  BackendError,
  type Backend,
  type CachedRender,
  type Project,
  type RateLimiter,
  type Review,
  type SharedProject,
  type SpreadEntry,
  type TextureStore,
  type User,
} from './types'

// Supabase implementation of the Backend contract.
//   Auth        Supabase Auth (GoTrue), session in HttpOnly cookies managed by @supabase/ssr
//   Data        Postgres behind Row Level Security; user-scoped calls use the caller's own session
//   Service key only for things no user may do: the Auth admin API, the shared rate limiter, the render cache

const MEDIA_BUCKET = 'media'
const MAX_PHOTO_BYTES = 12 * 1024 * 1024
const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

type ProjectRow = {
  id: string
  owner_id: string | null
  share_id: string
  dish: Dish
  spread: SpreadEntry[]
  review: Review
  created_at: string
  updated_at: string
}

type DbError = { code?: string; message: string; status?: number }

/** PostgREST turns `raise ... using errcode = 'PT404'` into an HTTP 404; recover the status and the intended message. */
function fail(error: DbError, what = 'database'): never {
  const match = /^PT(\d{3})$/.exec(error.code ?? '')
  if (match) throw new BackendError(error.message, Number(match[1]), error.code)
  console.error(`[fuddo] ${what} error:`, error.code, error.message)
  throw new BackendError('Something went wrong on the server. Please try again.', 500, error.code)
}

function rpcResult<T>(result: { data: T | null; error: DbError | null }, what?: string): T {
  if (result.error) fail(result.error, what)
  return result.data as T
}

/** Remember the choice for this browser before the session cookie is written, so the cookie gets the right lifetime. */
async function rememberChoice(remember: boolean) {
  const jar = await cookies()
  jar.set(REMEMBER_COOKIE, remember ? '1' : '0', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REMEMBER_SECONDS,
  })
}

async function userClient(): Promise<SupabaseClient> {
  const c = config()
  const jar = await cookies()
  const remember = jar.get(REMEMBER_COOKIE)?.value === '1'
  return createServerClient(c.supabaseUrl, c.anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list: { name: string; value: string; options: object }[]) => {
        for (const { name, value, options } of list) {
          try {
            jar.set(name, value, sessionCookie(options as Record<string, unknown>, value, remember))
          } catch {
            // Server Components cannot write cookies; proxy.ts refreshes the session on the way in.
          }
        }
      },
    },
  })
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const

function anonClient(): SupabaseClient {
  const c = config()
  return createClient(c.supabaseUrl, c.anonKey, noSession)
}

let service: SupabaseClient | null | undefined
function serviceClient(): SupabaseClient | null {
  if (service !== undefined) return service
  const c = config()
  service = c.serviceKey ? createClient(c.supabaseUrl, c.serviceKey, noSession) : null
  return service
}

function requireService(): SupabaseClient {
  const s = serviceClient()
  if (!s) throw new BackendError('This needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.', 503, 'no_service_key')
  return s
}

const rowToProject = (row: ProjectRow): Project => ({
  id: row.id,
  ownerId: row.owner_id ?? undefined,
  shareId: row.share_id,
  dish: row.dish,
  spread: row.spread,
  review: row.review,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const PROJECT_COLUMNS = 'id, owner_id, share_id, dish, spread, review, created_at, updated_at'

// One lookup per request, however many layouts and pages ask who is signed in.
const readCurrentUser = cache(async (): Promise<User | null> => {
  const sb = await userClient()
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return null
  const { data: profile } = await sb.from('profiles').select('name, role, disabled, created_at').eq('id', data.user.id).maybeSingle()
  if (!profile || profile.disabled) return null
  return {
    id: data.user.id,
    name: profile.name,
    email: data.user.email ?? '',
    role: profile.role,
    createdAt: profile.created_at,
  }
})

type TextureRow = {
  key: string
  name: string
  status: 'pending' | 'ready' | 'failed'
  path: string | null
  avg_color: string | null
  source: 'generated' | 'uploaded'
  error: string | null
  updated_at: string
}
const TEXTURE_COLUMNS = 'key, name, status, path, avg_color, source, error, updated_at'

const rowToTexture = (row: TextureRow): IngredientTexture => ({
  key: row.key,
  name: row.name,
  status: row.status,
  url: row.path ? (serviceClient() ?? anonClient()).storage.from(MEDIA_BUCKET).getPublicUrl(row.path).data.publicUrl : null,
  avgColor: row.avg_color,
  source: row.source,
  error: row.error,
  updatedAt: row.updated_at,
})

const textures: TextureStore = {
  async lookup(keys) {
    const wanted = [...new Set(keys)].slice(0, 100)
    if (!wanted.length) return []
    // With the service key the answer includes textures that are still being made; without it, only finished ones.
    const sb = serviceClient() ?? anonClient()
    const { data, error } = await sb.from('ingredient_textures').select(TEXTURE_COLUMNS).in('key', wanted)
    if (error) fail(error, 'textures')
    return ((data ?? []) as TextureRow[]).map(rowToTexture)
  },

  async claim(key, name, userId) {
    const s = requireService()
    return rpcResult<boolean>(await s.rpc('claim_ingredient_texture', { p_key: key, p_name: name, p_user: userId }), 'textures')
  },

  async complete(key, bytes, mime, meta) {
    const s = requireService()
    const path = `ingredients/${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'}-${randomUUID().slice(0, 8)}.${EXT[mime] ?? 'png'}`
    const up = await s.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: '31536000' })
    if (up.error) fail({ message: up.error.message }, 'storage')
    const { data, error } = await s
      .from('ingredient_textures')
      .update({ status: 'ready', path, mime, avg_color: meta.avgColor ?? null, source: meta.source, model: meta.model, prompt: meta.prompt, error: null })
      .eq('key', key)
      .select(TEXTURE_COLUMNS)
      .single()
    if (error) fail(error, 'textures')
    return rowToTexture(data as TextureRow)
  },

  async fail(key, message) {
    const s = requireService()
    const { error } = await s.from('ingredient_textures').update({ status: 'failed', error: message.slice(0, 300) }).eq('key', key)
    if (error) fail(error, 'textures')
  },

  async release(key) {
    const s = requireService()
    const { error } = await s.from('ingredient_textures').delete().eq('key', key).eq('status', 'pending')
    if (error) fail(error, 'textures')
  },

  async adminList() {
    const sb = await userClient()
    const { data, error } = await sb.from('ingredient_textures').select(TEXTURE_COLUMNS).order('updated_at', { ascending: false }).limit(500)
    if (error) fail(error, 'textures')
    return ((data ?? []) as TextureRow[]).map(rowToTexture)
  },

  async adminDelete(key) {
    const sb = await userClient()
    const s = requireService()
    // Checked as the caller first: only an administrator can see every row, so only one finds it to delete.
    const found = await sb.from('ingredient_textures').select('key, path').eq('key', key).maybeSingle()
    if (found.error) fail(found.error, 'textures')
    const me = await readCurrentUser()
    if (me?.role !== 'admin') throw new BackendError('Administrator access required.', 403)
    if (found.data?.path) await s.storage.from(MEDIA_BUCKET).remove([found.data.path])
    const { error } = await s.from('ingredient_textures').delete().eq('key', key)
    if (error) fail(error, 'textures')
  },
}

const limiter: RateLimiter = {
  isLimited: (key, limit) => limiterImpl().isLimited(key, limit),
  hit: (key, limit, windowMs, cost) => limiterImpl().hit(key, limit, windowMs, cost),
  clear: (key) => limiterImpl().clear(key),
}
let limiterCache: RateLimiter | undefined
function limiterImpl(): RateLimiter {
  const s = serviceClient()
  return (limiterCache ??= s ? databaseLimiter(s) : memoryLimiter())
}

export const supabaseBackend: Backend = {
  kind: 'supabase',
  textures,
  limiter,

  // Accounts -----------------------------------------------------------------

  currentUser: readCurrentUser,

  async registrationOpen() {
    const { data, error } = await anonClient().rpc('registration_open')
    if (error) fail(error, 'settings')
    return data !== false
  },

  async signUp({ name, email, password }, remember) {
    await rememberChoice(remember)
    const sb = await userClient()
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } })
    if (error) {
      if (error.code === 'user_already_exists') throw new BackendError('Unable to create this account. Try signing in.', 409, error.code)
      if (error.code === 'weak_password') throw new BackendError(error.message, 400, error.code)
      if (error.status === 429) throw new BackendError('Too many attempts. Try again later.', 429, error.code)
      console.error('[fuddo] signUp failed:', error.code, error.message)
      throw new BackendError('Unable to create this account.', error.status && error.status < 500 ? error.status : 400, error.code)
    }
    if (!data.session) return { pending: true as const } // email confirmation required
    const user = await readCurrentUserUncached(sb)
    if (!user) throw new BackendError('Unable to create this account.', 500)
    return { user }
  },

  async signIn({ email, password }, remember) {
    await rememberChoice(remember)
    const sb = await userClient()
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      if (error?.code === 'email_not_confirmed') throw new BackendError('Confirm your email address first, then sign in.', 403, error.code)
      if (error?.status === 429) throw new BackendError('Too many attempts. Try again later.', 429, error.code)
      // Wrong password, unknown account and suspended account all look the same from outside.
      throw new BackendError('Incorrect email or password.', 401, 'invalid_credentials')
    }
    const user = await readCurrentUserUncached(sb)
    if (!user) {
      await sb.auth.signOut({ scope: 'local' })
      throw new BackendError('Incorrect email or password.', 401, 'invalid_credentials')
    }
    return user
  },

  async signOut() {
    const sb = await userClient()
    await sb.auth.signOut({ scope: 'local' }) // revokes this session and clears the cookies
  },

  async requestPasswordReset(email, redirectTo) {
    const sb = await userClient()
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo })
    // Deliberately silent: the caller must not learn whether the address is registered, nor whether the mail server pushed back.
    if (error) console.error('[fuddo] password reset request failed:', error.code, error.message)
  },

  async exchangeRecoveryCode(code) {
    const sb = await userClient()
    const { error } = await sb.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[fuddo] recovery code rejected:', error.code, error.message)
      return false
    }
    // A suspended account must not be able to sign back in through a reset link.
    const user = await readCurrentUserUncached(sb)
    if (!user) {
      await sb.auth.signOut({ scope: 'local' })
      return false
    }
    return true
  },

  async changePassword(password) {
    const user = await readCurrentUser()
    if (!user) throw new BackendError('This reset link has expired. Request a new one.', 401)
    const sb = await userClient()
    const { error } = await sb.auth.updateUser({ password })
    if (error) {
      if (error.code === 'weak_password' || error.code === 'same_password') throw new BackendError(error.message, 400, error.code)
      console.error('[fuddo] password change failed:', error.code, error.message)
      throw new BackendError('Could not change the password. Please try again.', 400, error.code)
    }
    // Anyone who had the old password (or a stolen session) is signed out; this browser stays signed in.
    await sb.auth.signOut({ scope: 'others' })
  },

  // Projects -----------------------------------------------------------------

  async listProjects() {
    const sb = await userClient()
    const { data, error } = await sb.from('projects').select(PROJECT_COLUMNS).order('updated_at', { ascending: false })
    if (error) fail(error)
    return (data as ProjectRow[]).map(rowToProject)
  },

  async getProject(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null
    const sb = await userClient()
    const { data, error } = await sb.from('projects').select(PROJECT_COLUMNS).eq('id', id).maybeSingle()
    if (error) fail(error)
    return data ? rowToProject(data as ProjectRow) : null
  },

  async createProject(dish, spread) {
    const user = await readCurrentUser()
    if (!user) throw new BackendError('Please sign in.', 401)
    const sb = await userClient()
    const { data, error } = await sb.from('projects').insert({ owner_id: user.id, dish, spread }).select(PROJECT_COLUMNS).single()
    if (error) fail(error)
    return rowToProject(data as ProjectRow)
  },

  async updateProject(id, patch) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null
    // Nothing to change (every field in the request was one owners may not set): report the project as it is.
    if (patch.dish === undefined && patch.spread === undefined) return supabaseBackend.getProject(id)
    const sb = await userClient()
    const { data, error } = await sb.from('projects').update(patch).eq('id', id).select(PROJECT_COLUMNS).maybeSingle()
    if (error) fail(error)
    return data ? rowToProject(data as ProjectRow) : null
  },

  async deleteProject(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false
    const sb = await userClient()
    const { data, error } = await sb.from('projects').delete().eq('id', id).select('id')
    if (error) fail(error)
    return (data?.length ?? 0) > 0
  },

  // Consultant review ----------------------------------------------------------

  async getSharedProject(shareId): Promise<SharedProject | null> {
    const { data, error } = await anonClient().rpc('get_shared_project', { p_share_id: shareId })
    if (error) fail(error)
    if (!data) return null
    // The owner writes this JSON straight to Postgres with their own session, so it is untrusted input
    // by the time a consultant's request reaches the layout engine.
    const dish = DishSchema.safeParse((data as { dish: unknown }).dish)
    const spread = SpreadEntrySchema.array().safeParse((data as { spread: unknown }).spread)
    if (!dish.success || !spread.success) return null
    // Count the view (debounced in the database). Never let a counter problem stop a consultant seeing the spread.
    void anonClient().rpc('record_link_view', { p_share_id: shareId }).then(() => undefined, () => undefined)
    const raw = data as { id: string; review: Review }
    return { id: raw.id, dish: dish.data, spread: spread.data, review: raw.review }
  },

  async submitReview(shareId, review) {
    const result = await anonClient().rpc('submit_review', {
      p_share_id: shareId,
      p_reviewer: review.reviewer,
      p_picked: review.pickedSpecId,
      p_comment: review.comment,
    })
    return rpcResult<Review>(result, 'review')
  },

  // Images -------------------------------------------------------------------

  async uploadPhoto(bytes, mime) {
    const user = await readCurrentUser()
    if (!user) throw new BackendError('Please sign in.', 401)
    const sb = await userClient()
    const path = `${user.id}/${randomUUID()}.${EXT[mime]}`
    const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: '31536000' })
    if (error) fail({ message: error.message }, 'storage')
    return { url: sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl, bytes: bytes.byteLength }
  },

  async readPhoto(url) {
    const prefix = `${config().supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/`
    // Only fetch what this app put in its own bucket, so an attacker-supplied URL can never make the
    // server request an arbitrary address (SSRF).
    if (!url.startsWith(prefix) || !/^[A-Za-z0-9/_.-]+$/.test(url.slice(prefix.length)) || url.includes('..')) return null
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const mime = (res.headers.get('content-type') ?? '').split(';')[0]
      if (!res.ok || !PHOTO_MIME.has(mime)) return null
      const bytes = new Uint8Array(await res.arrayBuffer())
      return bytes.byteLength <= MAX_PHOTO_BYTES ? { bytes, mime } : null
    } catch {
      return null
    }
  },

  async getCachedRender(hash) {
    const s = serviceClient()
    if (!s) return null
    const { data, error } = await s.from('render_cache').select('hash, image_url, provider, quality, cost_usd, latency_ms').eq('hash', hash).maybeSingle()
    if (error || !data) return null
    return { hash: data.hash, imageUrl: data.image_url, provider: data.provider, quality: data.quality, costUsd: Number(data.cost_usd), latencyMs: data.latency_ms }
  },

  async putCachedRender(entry, bytes, mime): Promise<CachedRender> {
    const s = requireService()
    const path = `generated/${entry.hash}.${EXT[mime] ?? 'png'}`
    const up = await s.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: true, cacheControl: '31536000' })
    if (up.error) fail({ message: up.error.message }, 'storage')
    const imageUrl = s.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
    const { error } = await s.from('render_cache').upsert({
      hash: entry.hash,
      image_url: imageUrl,
      provider: entry.provider,
      quality: entry.quality,
      cost_usd: entry.costUsd,
      latency_ms: entry.latencyMs,
    })
    if (error) fail(error, 'render cache')
    return { ...entry, imageUrl }
  },

  // Administration -------------------------------------------------------------

  async adminOverview() {
    const sb = await userClient()
    const data = rpcResult<Omit<AdminData, 'imageProvider' | 'modelProvider'>>(await sb.rpc('admin_overview'), 'admin')
    const c = config()
    return { ...data, imageProvider: c.imageProvider, modelProvider: c.modelProvider }
  },

  async adminCreateUser({ name, email, password, role }) {
    const sb = await userClient()
    rpcResult(await sb.rpc('admin_record', { p_action: 'Creating account', p_target: email }), 'admin') // also proves the caller is an admin
    const svc = requireService()
    // Approve this exact email for the next two minutes so the registration guard lets it through while sign-up is closed.
    const allowed = await svc.rpc('allow_registration', { p_email: email })
    if (allowed.error) fail(allowed.error, 'admin')
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
    if (error || !data.user) {
      if (error?.code === 'email_exists') throw new BackendError('An account already uses that email.', 409, error.code)
      if (error?.code === 'weak_password') throw new BackendError(error.message, 400, error.code)
      console.error('[fuddo] createUser failed:', error?.code, error?.message)
      throw new BackendError('Unable to create the account.', 500)
    }
    if (role === 'admin') {
      const { error: roleError } = await svc.from('profiles').update({ role: 'admin' }).eq('id', data.user.id)
      if (roleError) fail(roleError, 'admin')
    }
  },

  async adminUpdateUser({ id, name, email, role, disabled }) {
    const sb = await userClient()
    rpcResult(await sb.rpc('admin_check_profile_update', { p_id: id, p_role: role, p_disabled: disabled }), 'admin')
    const svc = requireService()
    const { error } = await svc.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
      // Banning stops the refresh token from working; the database function below also ends the session.
      ban_duration: disabled ? '876000h' : 'none',
    })
    if (error) {
      if (error.code === 'email_exists') throw new BackendError('An account already uses that email.', 409, error.code)
      console.error('[fuddo] updateUser failed:', error.code, error.message)
      throw new BackendError('Unable to save changes. Please try again.', 500)
    }
    rpcResult(await sb.rpc('admin_apply_profile_update', { p_id: id, p_name: name, p_email: email, p_role: role, p_disabled: disabled }), 'admin')
  },

  async adminSetPassword(id, password) {
    const sb = await userClient()
    rpcResult(await sb.rpc('admin_record', { p_action: 'Changing a password', p_target: id }), 'admin')
    const svc = requireService()
    const { error } = await svc.auth.admin.updateUserById(id, { password })
    if (error) {
      if (error.code === 'weak_password') throw new BackendError(error.message, 400, error.code)
      console.error('[fuddo] setPassword failed:', error.code, error.message)
      throw new BackendError('Unable to change the password.', 500)
    }
    rpcResult(await sb.rpc('admin_revoke_sessions', { p_id: id }), 'admin')
  },

  async adminRevokeSessions(id) {
    rpcResult(await (await userClient()).rpc('admin_revoke_sessions', { p_id: id }), 'admin')
  },

  async adminClearAttempts(id) {
    rpcResult(await (await userClient()).rpc('admin_clear_attempts', { p_id: id }), 'admin')
  },

  async adminSetRegistration(open) {
    rpcResult(await (await userClient()).rpc('admin_set_registration', { p_open: open }), 'admin')
  },

  async adminUpdateProject({ id, name, ownerId }) {
    rpcResult(await (await userClient()).rpc('admin_update_project', { p_id: id, p_name: name, p_owner: ownerId }), 'admin')
  },

  async adminRotateShare(id, confirm) {
    rpcResult(await (await userClient()).rpc('admin_rotate_share', { p_id: id, p_confirm: confirm }), 'admin')
  },

  async adminRecord(action, target) {
    rpcResult(await (await userClient()).rpc('admin_record', { p_action: action, p_target: target }), 'admin')
  },
}

/** Same lookup as currentUser(), for the client that just signed in and so has fresh cookies not yet in the request. */
async function readCurrentUserUncached(sb: SupabaseClient): Promise<User | null> {
  const { data } = await sb.auth.getUser()
  if (!data.user) return null
  const { data: profile } = await sb.from('profiles').select('name, role, disabled, created_at').eq('id', data.user.id).maybeSingle()
  if (!profile || profile.disabled) return null
  return { id: data.user.id, name: profile.name, email: data.user.email ?? '', role: profile.role, createdAt: profile.created_at }
}
