import { NextResponse, type NextRequest } from 'next/server'
import { apiError, route } from '@/lib/api-response'
import { clientIp, sha256 } from '@/lib/auth'
import { backend } from '@/lib/backend'
import { getModelProvider } from '@/lib/providers3d'

type Ctx = { params: Promise<{ shareId: string }> }

// The 3D model of one plating, for a consultant holding the review link (no account).
// Built here from the stored spec, never from anything the browser sends, and always with the free local
// builder: a public link must not be able to cost the chef money.
export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const { shareId } = await params
  const specId = req.nextUrl.searchParams.get('spec') ?? ''

  if (await backend.limiter.hit(`model:${sha256(clientIp(req))}:${sha256(shareId)}`, 300, 60_000)) {
    return apiError('Too many requests. Slow down a little.', 429, undefined, undefined, { 'Retry-After': '60' })
  }

  const project = await backend.getSharedProject(shareId)
  if (!project) return apiError('This review link is not valid.', 404)
  const entry = project.spread.find((s) => s.spec.id === specId)
  if (!entry) return apiError('That plating is not part of this spread.', 404)

  const provider = getModelProvider('mock-3d')
  const result = await provider.generate({ dish: project.dish, spec: entry.spec, sourceImage: null })
  return NextResponse.json(
    {
      provider: provider.id,
      specId,
      gltf: result.gltf,
      url: result.url,
      parts: result.parts,
      plateRadius: result.plateRadius,
      costUsd: 0,
      latencyMs: result.latencyMs,
      wouldHaveCost: [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
