import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { suggestComponents, toComponents } from '@/lib/suggest'

const SuggestSchema = z.object({
  dishName: z.string().trim().min(1, 'Type a dish name first.').max(120),
  // One of the styles a dish offers ("Pepperoni"), when the chef chose it from the list.
  variant: z.string().trim().max(60).optional(),
})

// Behind an endpoint rather than run in the browser, so swapping the local
// parser for a model call later needs no change on the client. A key never
// reaches the browser either way.
export const POST = route(async (req: NextRequest) => {
  const g = await guard(req)
  if ('response' in g) return g.response

  const parsed = SuggestSchema.safeParse(await readJson(req, 4_000))
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Type a dish name first.', 400)

  const suggestion = suggestComponents(parsed.data.dishName, parsed.data.variant)
  return apiSuccess({
    components: toComponents(suggestion),
    source: suggestion.source,
    note: suggestion.note,
    family: suggestion.family ?? null,
    variants: suggestion.variants ?? [],
    variant: suggestion.variant ?? null,
  })
})
