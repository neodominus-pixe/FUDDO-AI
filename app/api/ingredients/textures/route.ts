import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { clientIp, guard, sha256 } from '@/lib/auth'
import { backend } from '@/lib/backend'
import { normalizeIngredient } from '@/lib/ingredients'
import { ensureTexture, lookupTextures } from '@/lib/textures/service'

export const runtime = 'nodejs'
// Making a texture asks an image model, which can take a while.
export const maxDuration = 60

const MAX_NAMES = 40

/**
 * What is known about some ingredients' textures. Open to everyone, review links included: a texture is a generic
 * picture of a food, and the answer never makes one, so it costs nothing and reveals nothing about anyone.
 * Names are separated by "|".
 */
export const GET = route(async (req: NextRequest) => {
  if (await backend.limiter.hit(`textures-read:${sha256(clientIp(req))}`, 240, 60_000)) {
    return apiError('Too many requests. Slow down a little.', 429, undefined, undefined, { 'Retry-After': '30' })
  }
  const names = (req.nextUrl.searchParams.get('names') ?? '')
    .split('|')
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, MAX_NAMES)
  const found = await lookupTextures(names)
  const textures: Record<string, { status: string; url: string | null; avgColor: string | null; error: string | null }> = {}
  for (const t of found) textures[t.key] = { status: t.status, url: t.url, avgColor: t.avgColor, error: t.status === 'failed' ? t.error : null }
  return apiSuccess({ textures })
})

const MakeSchema = z.object({ name: z.string().trim().min(1).max(120) })

/** Makes the texture for one ingredient if nobody has yet, and answers with its state. Signed-in chefs only. */
export const POST = route(async (req: NextRequest) => {
  const g = await guard(req)
  if ('response' in g) return g.response
  const parsed = MakeSchema.safeParse(await readJson(req, 2_000))
  if (!parsed.success) return apiError('Enter an ingredient name.', 400, 'VALIDATION_ERROR')
  if (!normalizeIngredient(parsed.data.name)) return apiError('Enter an ingredient name.', 400, 'VALIDATION_ERROR')
  const texture = await ensureTexture(parsed.data.name, g.user.id)
  return apiSuccess({ texture: { key: texture.key, status: texture.status, url: texture.url, avgColor: texture.avgColor, error: texture.error } })
})
