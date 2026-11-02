import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { costPerModelBatch } from '@/lib/pricing'
import { activeModelProviderId, getModelProvider } from '@/lib/providers3d'
import { validateDish } from '@/lib/render'
import { DishSchema, PlatingSpecSchema } from '@/lib/schemas'

const ModelRequestSchema = z.object({
  dish: DishSchema,
  spec: PlatingSpecSchema,
  sourceImage: z.string().max(600).nullable().optional(),
})

export const POST = route(async (req: NextRequest) => {
  const g = await guard(req)
  if ('response' in g) return g.response

  const parsed = ModelRequestSchema.safeParse(await readJson(req))
  if (!parsed.success) return apiError('Missing or invalid plating spec / dish parameters.', 400, 'VALIDATION_ERROR', parsed.error.issues)

  const { dish, spec, sourceImage } = parsed.data
  if (!validateDish(dish)) return apiError('Dish needs a name and at least one component.', 400)

  const provider = getModelProvider(activeModelProviderId)
  const result = await provider.generate({ dish, spec, sourceImage: sourceImage ?? null })

  return apiSuccess({
    provider: provider.id,
    specId: spec.id,
    gltf: result.gltf,
    url: result.url,
    parts: result.parts,
    plateRadius: result.plateRadius,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    wouldHaveCost: costPerModelBatch(1),
  })
})
