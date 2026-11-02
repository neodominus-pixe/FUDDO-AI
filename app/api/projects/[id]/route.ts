import type { NextRequest } from 'next/server'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { backend, type SpreadEntry } from '@/lib/backend'
import { mapLimit } from '@/lib/concurrency'
import { renderOne } from '@/lib/render'
import { PatchProjectSchema } from '@/lib/schemas'
import type { Dish } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }

// Opening a project shows what is already stored. It never pays a provider for a picture that is missing.
const withRenders = (spread: SpreadEntry[], dish: Dish) =>
  mapLimit(spread, 4, async ({ name, spec }) => ({ ...(await renderOne(dish, spec, 'three-quarter', 'spread')), name }))

export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const g = await guard(req)
  if ('response' in g) return g.response
  const { id } = await params
  const project = await backend.getProject(id) // Row Level Security: owner or administrator only
  if (!project) return apiError('Project not found.', 404)

  if (req.nextUrl.searchParams.get('meta')) return apiSuccess({ project })
  return apiSuccess({ project, renders: await withRenders(project.spread, project.dish) })
})

export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const g = await guard(req)
  if ('response' in g) return g.response
  const { id } = await params

  const parsed = PatchProjectSchema.safeParse(await readJson(req))
  if (!parsed.success) return apiError('Invalid patch payload.', 400, 'VALIDATION_ERROR', parsed.error.issues)

  const project = await backend.updateProject(id, parsed.data)
  if (!project) return apiError('Project not found.', 404)
  return apiSuccess({ project })
})

export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  const g = await guard(req)
  if ('response' in g) return g.response
  const { id } = await params
  const project = await backend.getProject(id)
  if (!project) return apiError('Project not found.', 404)

  if (!(await backend.deleteProject(id))) return apiError('Unable to delete project.', 500)
  if (g.user.role === 'admin' && project.ownerId !== g.user.id) await backend.adminRecord('Deleted project', project.dish.name)
  return apiSuccess({ ok: true })
})
