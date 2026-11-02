import { NextResponse, type NextRequest } from 'next/server'
import { apiError, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { backend } from '@/lib/backend'
import { describePlacement, describeTweaks } from '@/lib/describe'
import { layout } from '@/lib/layout'
import { activeModelProviderId, getModelProvider } from '@/lib/providers3d'
import { generationQuota } from '@/lib/quota'
import { renderOne } from '@/lib/render'
import type { Angle, Dish, PlatingSpec } from '@/lib/types'

const ANGLES: Angle[] = ['top-down', 'three-quarter', 'side']

export const GET = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const g = await guard(req)
  if ('response' in g) return g.response
  const { id } = await params
  const project = await backend.getProject(id) // owner or administrator (Row Level Security)
  if (!project) return apiError('Project not found.', 404)

  // The card documents whatever the consultant picked; before they answer it
  // falls back to the first plating so the sheet is still previewable.
  const entry = project.spread.find((s) => s.spec.id === project.review.pickedSpecId) ?? project.spread[0]
  if (!entry) return apiError('This project has no platings.', 400)

  const dish: Dish = project.dish
  const spec: PlatingSpec = entry.spec
  const l = layout(dish, spec)

  const placement = describePlacement(dish, spec).items
  const adjustments = describeTweaks(dish, spec)
  // Portion counts, so the line knows three quenelles means three.
  const portions = Object.entries(spec.copies ?? {})
    .filter(([, n]) => n > 0)
    .map(([cid, n]) => {
      const c = dish.components.find((x) => x.id === cid)
      return c ? { name: c.name, count: n + 1 } : null
    })
    .filter(Boolean) as Array<{ name: string; count: number }>

  const garnishCount = l.elements.filter((e) => e.role === 'garnish').length
  const options = generationQuota(g.user.id)
  const views = Object.fromEntries(
    await Promise.all(
      ANGLES.map(async (angle) => {
        const r = await renderOne(dish, spec, angle, 'final', options)
        return [angle, { svg: r.svg, imageUrl: r.imageUrl }] as const
      }),
    ),
  ) as Record<Angle, { svg: string | null; imageUrl: string | null }>

  const model = await getModelProvider(activeModelProviderId).generate({ dish, spec, sourceImage: null })

  return NextResponse.json(
    {
      dishName: dish.name,
      components: dish.components.map((c) => ({ name: c.name, role: c.role })),
      name: entry.name,
      spec,
      views,
      placement,
      adjustments,
      portions,
      garnishCount,
      sauceMarks: l.sauce.marks.length + l.sauce.samples.length,
      review: project.review,
      updatedAt: project.updatedAt,
      gltf: model.gltf,
      isProvisional: !project.review.pickedSpecId,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
