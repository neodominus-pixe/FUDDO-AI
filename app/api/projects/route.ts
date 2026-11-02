import type { NextRequest } from 'next/server'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { backend } from '@/lib/backend'
import { validateDish } from '@/lib/render'
import { CreateProjectSchema } from '@/lib/schemas'

export const GET = route(async (req: Request) => {
  const g = await guard(req)
  if ('response' in g) return g.response
  // Row Level Security decides: owners get their own projects, administrators get everyone's.
  const projects = await backend.listProjects()
  return apiSuccess({
    projects: projects.map((p) => ({
      id: p.id,
      shareId: p.shareId,
      dishName: p.dish.name,
      platings: p.spread.length,
      picked: p.review.pickedSpecId,
      updatedAt: p.updatedAt,
    })),
  })
})

export const POST = route(async (req: NextRequest) => {
  const g = await guard(req)
  if ('response' in g) return g.response

  const parsed = CreateProjectSchema.safeParse(await readJson(req))
  if (!parsed.success) return apiError('Invalid project creation payload.', 400, 'VALIDATION_ERROR', parsed.error.issues)

  const { dish, spread } = parsed.data
  if (!validateDish(dish)) return apiError('Dish needs a name and at least one component.', 400)
  if (!spread.length) return apiError('Generate a spread before saving.', 400)

  const project = await backend.createProject(dish, spread)
  return apiSuccess({ id: project.id, shareId: project.shareId }, 201)
})
