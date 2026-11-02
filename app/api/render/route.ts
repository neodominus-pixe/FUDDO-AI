import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { BackendError } from '@/lib/backend'
import { costPerBatch } from '@/lib/pricing'
import { generationQuota } from '@/lib/quota'
import { renderOne, validateDish } from '@/lib/render'
import { AngleSchema, DishSchema, PlatingSpecSchema } from '@/lib/schemas'

const RenderRequestSchema = z.object({
  dish: DishSchema,
  spec: PlatingSpecSchema,
  angle: AngleSchema.optional(),
})

export const POST = route(async (req: NextRequest) => {
  const g = await guard(req)
  if ('response' in g) return g.response

  const parsed = RenderRequestSchema.safeParse(await readJson(req))
  if (!parsed.success) return apiError('Missing or invalid plating spec / dish parameters.', 400, 'VALIDATION_ERROR', parsed.error.issues)

  const { dish, spec, angle } = parsed.data
  if (!validateDish(dish)) return apiError('Dish needs a name and at least one component.', 400)

  try {
    const render = await renderOne(dish, spec, angle ?? 'three-quarter', 'refine', generationQuota(g.user.id))
    return apiSuccess({ render, wouldHaveCost: costPerBatch(1, 'refine') })
  } catch (e) {
    if (e instanceof BackendError) throw e
    console.error('[fuddo] image provider failed:', e)
    return apiError(e instanceof Error ? e.message : 'The image provider failed.', 502)
  }
})
