import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { BackendError } from '@/lib/backend'
import { mapLimit } from '@/lib/concurrency'
import { costPerBatch, sessionEstimate } from '@/lib/pricing'
import { generationQuota } from '@/lib/quota'
import { renderOne, validateDish } from '@/lib/render'
import { AngleSchema, DishSchema } from '@/lib/schemas'
import { buildSpread } from '@/lib/spec'

const GenerateSchema = z.object({
  dish: DishSchema,
  count: z.number().int().min(1).max(24).optional(),
  angle: AngleSchema.optional(),
})

export const POST = route(async (req: NextRequest) => {
  const g = await guard(req)
  if ('response' in g) return g.response

  const parsed = GenerateSchema.safeParse(await readJson(req))
  if (!parsed.success) return apiError('Dish needs a name and valid component structures.', 400, 'VALIDATION_ERROR', parsed.error.issues)

  const { dish, count: rawCount, angle: rawAngle } = parsed.data
  if (!validateDish(dish)) return apiError('Dish needs a name and at least one component.', 400)

  const count = rawCount ?? 12
  const angle = rawAngle ?? 'three-quarter'
  const spread = buildSpread(count)
  const options = generationQuota(g.user.id)

  // A few at a time: fast enough for a spread, gentle enough not to trip a provider's own rate limit.
  let renders
  try {
    renders = await mapLimit(spread, 4, async ({ name, spec }) => ({ ...(await renderOne(dish, spec, angle, 'spread', options)), name }))
  } catch (e) {
    if (e instanceof BackendError) throw e
    console.error('[fuddo] image provider failed:', e)
    return apiError(e instanceof Error ? e.message : 'The image provider failed.', 502)
  }

  return apiSuccess({
    renders,
    provider: renders[0]?.provider ?? 'mock',
    actualCostUsd: renders.reduce((s, r) => s + r.costUsd, 0),
    wouldHaveCost: costPerBatch(renders.length, 'spread'),
    sessionEstimate: sessionEstimate(),
  })
})
