import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess, readJson, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { polishFrame } from '@/lib/polish'

export const runtime = 'nodejs'
export const maxDuration = 90

// A frame is sent as a data URL; a 1024 px JPEG is a few hundred KB, so the cap is generous.
const Body = z.object({
  image: z.string().max(7_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Expected a PNG, JPEG or WebP data URL.'),
  dishName: z.string().max(120).default(''),
  components: z.array(z.string().max(80)).max(24).default([]),
})

/** Turns the editor's current 3D frame into a photographic render of the same arrangement. Signed-in chefs only. */
export const POST = route(async (req: NextRequest) => {
  const g = await guard(req)
  if ('response' in g) return g.response
  const parsed = Body.safeParse(await readJson(req, 8_000_000))
  if (!parsed.success) return apiError('Send the 3D frame as an image.', 400, 'VALIDATION_ERROR')

  const { image, dishName, components } = parsed.data
  const frame = Uint8Array.from(Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'))
  const result = await polishFrame(frame, dishName, components, g.user.id)
  return apiSuccess({
    image: `data:${result.mime};base64,${Buffer.from(result.bytes).toString('base64')}`,
    polished: result.polished,
    provider: result.provider,
  })
})
