import { z } from 'zod'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { backend } from '@/lib/backend'
import { ensureTexture } from '@/lib/textures/service'

export const runtime = 'nodejs'
export const maxDuration = 60

/** The whole texture library, including ones still being made and ones that failed. */
export const GET = route(async (req: Request) => {
  const g = await guard(req, { admin: true })
  if ('response' in g) return g.response
  return apiSuccess({ textures: await backend.textures.adminList() })
})

const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), key: z.string().min(1).max(80) }),
  // Throws the picture away and makes a new one: for a texture that came out wrong.
  z.object({ action: z.literal('regenerate'), key: z.string().min(1).max(80), name: z.string().trim().min(1).max(120) }),
])

export const POST = route(async (req: Request) => {
  const g = await guard(req, { admin: true })
  if ('response' in g) return g.response
  const parsed = Action.safeParse(await readJson(req, 4_000))
  if (!parsed.success) return apiError('Invalid request.', 400, 'VALIDATION_ERROR')
  const a = parsed.data
  await backend.textures.adminDelete(a.key)
  if (a.action === 'delete') {
    await backend.adminRecord('Deleted texture', a.key)
    return apiSuccess({})
  }
  await backend.adminRecord('Regenerated texture', a.key)
  const texture = await ensureTexture(a.name, g.user.id)
  return apiSuccess({ texture })
})
