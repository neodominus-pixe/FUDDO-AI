import 'server-only'
import { createHash } from 'node:crypto'
import { backend } from './backend'
import { layout } from './layout'
import { resolveHex } from './palette'
import { getProvider, activeProviderId } from './providers'
import { mockProvider } from './providers/mock'
import { promptFromSpec } from './spec'
import { qualityForPurpose, type RenderPurpose } from './pricing'
import { SAUCE_KEY } from './types'
import type { Angle, Dish, ElementTweak, PlatingSpec } from './types'
import type { Layout, PlacedElement } from './layout'

export type RenderPayload = {
  id: string
  specId: string
  spec: PlatingSpec
  svg: string | null
  imageUrl: string | null
  provider: string
  costUsd: number
  latencyMs: number
  angle: Angle
  prompt: string
  quality: string
  purpose: RenderPurpose
  // Positions are returned alongside the picture so the client can put drag
  // handles exactly on top of each element without recomputing the layout.
  elements: Array<PlacedElement & { color: string; tweak: ElementTweak }>
  plateRadius: number
}

export type RenderOptions = {
  /**
   * May this call pay a provider for a picture that is not cached yet? True only for the signed-in chef's own
   * generate/refine/card requests. Everything a visitor can reach (a review link) is read-only: it shows what
   * is already stored and otherwise falls back to the free local drawing.
   */
  allowPaid?: boolean
  /** Called immediately before a paid generation, to enforce a spend allowance. Throw to refuse. */
  beforePaid?: () => Promise<void>
}

// Everything that shapes a picture. Two requests with the same key would produce the same image, so the
// second one is served from storage instead of being paid for again.
function renderHash(providerId: string, quality: string, angle: Angle, prompt: string, dish: Dish) {
  const photos = dish.components.map((c) => c.imagePath ?? '').sort()
  return createHash('sha256').update(JSON.stringify([providerId, process.env.OPENAI_IMAGE_MODEL ?? '', quality, angle, prompt, photos])).digest('hex')
}

export async function renderOne(
  dish: Dish,
  spec: PlatingSpec,
  angle: Angle,
  purpose: RenderPurpose = 'spread',
  options: RenderOptions = {},
): Promise<RenderPayload> {
  const configured = getProvider(activeProviderId)
  const prompt = promptFromSpec(dish, spec, angle)
  const quality = qualityForPurpose(purpose)
  const request = { dish, spec, angle, prompt, quality }

  let providerId: string = configured.id
  let svg: string | null = null
  let imageUrl: string | null = null
  let costUsd = 0
  let latencyMs = 0

  if (configured.id === 'mock') {
    const r = await configured.generate(request)
    svg = r.svg
    costUsd = r.costUsd
    latencyMs = r.latencyMs
  } else {
    const hash = renderHash(configured.id, quality, angle, prompt, dish)
    const cached = await backend.getCachedRender(hash)
    if (cached) {
      imageUrl = cached.imageUrl // already paid for: costs nothing now
    } else if (options.allowPaid) {
      await options.beforePaid?.()
      const r = await configured.generate(request)
      if (!r.image) throw new Error('The image provider returned no image.')
      const stored = await backend.putCachedRender(
        { hash, imageUrl: '', provider: configured.id, quality, costUsd: r.costUsd, latencyMs: r.latencyMs },
        r.image.bytes,
        r.image.mime,
      )
      imageUrl = stored.imageUrl
      costUsd = r.costUsd
      latencyMs = r.latencyMs
    } else {
      const r = await mockProvider.generate(request)
      providerId = mockProvider.id
      svg = r.svg
    }
  }

  const l = layout(dish, spec)
  return {
    id: `render-${spec.id}-${spec.seed}`,
    specId: spec.id,
    spec,
    svg,
    imageUrl,
    provider: providerId,
    costUsd,
    latencyMs,
    angle,
    prompt,
    quality,
    purpose,
    // The sauce rides along as one more addressable thing, under a reserved key.
    // It is not a component with a position of its own -- it is derived from
    // where the food ended up -- but the chef still needs to be able to take
    // hold of it, and everything that moves an element already works by key.
    elements: [
      ...l.elements.map((e) => ({
        ...e,
        color: resolveHex(e.name, e.role, spec.tweaks?.[e.key]?.c),
        tweak: spec.tweaks?.[e.key] ?? {},
      })),
      ...sauceElement(dish, spec, l),
    ],
    plateRadius: l.plate.radius,
  }
}

// One handle for the whole sauce, or nothing if this plating has no sauce on it.
function sauceElement(dish: Dish, spec: PlatingSpec, l: Layout) {
  const source = dish.components.find((c) => c.role === 'sauce')
  if (!source || (!l.sauce.marks.length && !l.sauce.samples.length)) return []
  const tweak = spec.tweaks?.[SAUCE_KEY] ?? {}
  return [
    {
      key: SAUCE_KEY,
      componentId: source.id,
      name: source.name,
      role: 'sauce' as const,
      x: l.sauce.anchor.x,
      y: l.sauce.anchor.y,
      scale: tweak.s ?? 1,
      rotation: tweak.r ?? 0,
      z: 0,
      color: resolveHex(source.name, 'sauce', tweak.c),
      tweak,
    },
  ]
}

export function validateDish(dish: unknown): dish is Dish {
  const d = dish as Dish | undefined
  return !!d && typeof d.name === 'string' && d.name.trim().length > 0 && Array.isArray(d.components) && d.components.length > 0
}
