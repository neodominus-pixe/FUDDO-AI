import { NextResponse, type NextRequest } from 'next/server'
import { apiError, readJson, route } from '@/lib/api-response'
import { clientIp, reviewKey, sameOrigin } from '@/lib/auth'
import { backend } from '@/lib/backend'
import { mapLimit } from '@/lib/concurrency'
import { renderOne } from '@/lib/render'
import { ReviewSchema } from '@/lib/schemas'

type Ctx = { params: Promise<{ shareId: string }> }

const REVIEW_LIMIT = 20 // answers per address per link per hour

// The consultant's endpoint. Reached by share link with no account, which is the
// difference between a consultant reviewing a spread and a consultant ignoring it.
//
// Because anyone holding the link can call it, it is strictly read-only apart from the answer itself:
// rendering here never pays an image provider, it shows what the chef already generated.
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { shareId } = await params
  const project = await backend.getSharedProject(shareId)
  if (!project) return NextResponse.json({ error: 'This review link is not valid.' }, { status: 404 })

  const renders = await mapLimit(project.spread, 4, async ({ name, spec }) => ({
    ...(await renderOne(project.dish, spec, 'three-quarter', 'spread')),
    name,
  }))

  return NextResponse.json(
    {
      dishName: project.dish.name,
      // The id is what a plating's nudges and tweaks are keyed by, so the page can draw the plating exactly as the chef left it.
      components: project.dish.components.map((c) => ({ id: c.id, name: c.name, role: c.role, imagePath: c.imagePath })),
      renders,
      review: project.review,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})

export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  if (!sameOrigin(req)) return apiError('Invalid request origin.', 403)
  const { shareId } = await params

  if (await backend.limiter.hit(reviewKey(clientIp(req), shareId), REVIEW_LIMIT, 60 * 60_000)) {
    return apiError('Too many answers from this connection. Try again later.', 429, undefined, undefined, { 'Retry-After': '3600' })
  }

  const parsed = ReviewSchema.safeParse(await readJson(req, 16_000))
  if (!parsed.success) return apiError('That answer is not valid.', 400, 'VALIDATION_ERROR', parsed.error.issues)

  // Existence, "is this plating in the spread" and the per-link cap are enforced inside the database function.
  const review = await backend.submitReview(shareId, parsed.data)
  return NextResponse.json({ review })
})
