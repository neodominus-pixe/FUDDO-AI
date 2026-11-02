// Per-image list prices, USD. These move often -- treat them as a starting
// point and correct them against your provider's current pricing page.
// Everything downstream reads from this table, so updating it here is enough.
export type ProviderId = 'mock' | 'gemini-image' | 'gpt-image' | 'flux-kontext'

export type ImageQuality = 'low' | 'medium' | 'high'

export type ProviderPricing = {
  id: ProviderId
  label: string
  // Price at the default (medium) setting, used for the provider comparison.
  usdPerImage: number
  // Providers that charge by output quality. Cost tracking must follow the
  // quality actually requested, or a low-quality run reports a medium-quality bill.
  byQuality?: Record<ImageQuality, number>
  note: string
}

export const PRICING: Record<ProviderId, ProviderPricing> = {
  mock: {
    id: 'mock',
    label: 'Mock (no API calls)',
    usdPerImage: 0,
    note: 'Local render. Costs nothing; shows what each real provider would have charged.',
  },
  'gemini-image': {
    id: 'gemini-image',
    label: 'Google Gemini Image',
    usdPerImage: 0.04,
    note: 'Strongest multi-photo reference conditioning.',
  },
  'gpt-image': {
    id: 'gpt-image',
    label: 'OpenAI gpt-image',
    usdPerImage: 0.08,
    byQuality: { low: 0.02, medium: 0.08, high: 0.19 },
    note: 'Good mask-based editing; pricier per image. Charged by output quality.',
  },
  'flux-kontext': {
    id: 'flux-kontext',
    label: 'Flux Kontext (fal.ai)',
    usdPerImage: 0.04,
    note: 'Best in-place editing; weaker multi-reference composition.',
  },
}

export const BILLABLE: ProviderId[] = ['gemini-image', 'gpt-image', 'flux-kontext']

export function configuredQuality(): ImageQuality {
  const q = (process.env.IMAGE_QUALITY ?? 'medium').toLowerCase()
  return q === 'low' || q === 'high' ? q : 'medium'
}

// What a render is FOR decides what it needs to look like. A consultant choosing
// between twelve arrangements is not judging photography, so a spread renders
// cheap; only the plating they actually pick gets rendered properly. This is the
// difference between roughly $2.40 and $1.10 for one menu-development session.
export type RenderPurpose = 'spread' | 'refine' | 'final'

const DEFAULT_QUALITY: Record<RenderPurpose, ImageQuality> = {
  spread: 'low',
  refine: 'low',
  final: 'high',
}

export function qualityForPurpose(purpose: RenderPurpose): ImageQuality {
  const override = {
    spread: process.env.QUALITY_SPREAD,
    refine: process.env.QUALITY_REFINE,
    final: process.env.QUALITY_FINAL,
  }[purpose]
  const v = (override ?? '').toLowerCase()
  if (v === 'low' || v === 'medium' || v === 'high') return v
  return DEFAULT_QUALITY[purpose]
}

// What one image costs on a provider at the quality this install is configured
// for. Providers with flat pricing ignore the quality argument.
export function priceForImage(id: ProviderId, q: ImageQuality = configuredQuality()) {
  const p = PRICING[id]
  return p.byQuality?.[q] ?? p.usdPerImage
}

// What one generation of N platings costs on each provider.
export function costPerBatch(imageCount: number, purpose: RenderPurpose = 'spread') {
  const q = qualityForPurpose(purpose)
  return BILLABLE.map((id) => ({
    ...PRICING[id],
    quality: q,
    purpose,
    usdPerImage: priceForImage(id, q),
    batchCost: +(priceForImage(id, q) * imageCount).toFixed(4),
  }))
}

export type SessionShape = {
  platingsPerSpread: number // initial grid the consultant picks from
  refineRenders: number     // re-renders while iterating on the chosen plating
  finalAngles: number       // extra angles rendered for the spec card
}

export const TYPICAL_SESSION: SessionShape = {
  platingsPerSpread: 12,
  refineRenders: 15,
  finalAngles: 3,
}

export function imagesPerSession(s: SessionShape = TYPICAL_SESSION) {
  return s.platingsPerSpread + s.refineRenders + s.finalAngles
}

// Monthly cost-of-goods for one account, and the margin at a given price.
// A whole session priced at the quality each stage actually runs at, rather than
// one flat rate times thirty.
export function sessionEstimate(shape: SessionShape = TYPICAL_SESSION) {
  return BILLABLE.map((id) => {
    const total =
      priceForImage(id, qualityForPurpose('spread')) * shape.platingsPerSpread +
      priceForImage(id, qualityForPurpose('refine')) * shape.refineRenders +
      priceForImage(id, qualityForPurpose('final')) * shape.finalAngles
    return { id, label: PRICING[id].label, total: +total.toFixed(4) }
  })
}

export function monthlyProjection(
  sessionsPerMonth: number,
  providerId: ProviderId,
  pricePerSeatUsd: number,
  shape: SessionShape = TYPICAL_SESSION,
) {
  const images = imagesPerSession(shape) * sessionsPerMonth
  const cogs = images * PRICING[providerId].usdPerImage
  const gross = pricePerSeatUsd - cogs
  return {
    images,
    cogs: +cogs.toFixed(2),
    gross: +gross.toFixed(2),
    marginPct: pricePerSeatUsd > 0 ? +((gross / pricePerSeatUsd) * 100).toFixed(1) : 0,
  }
}

// ---------------------------------------------------------------------------
// Image-to-3D. Same caveat as above: verify against current pricing pages.
// These are per-model, and an order of magnitude cheaper than commissioning a
// 3D artist -- but the geometry quality is correspondingly lower.
export type ModelProviderId = 'mock-3d' | 'meshy' | 'tripo' | 'rodin'

export type ModelPricing = {
  id: ModelProviderId
  label: string
  usdPerModel: number
  typicalSeconds: number
  note: string
}

export const MODEL_PRICING: Record<ModelProviderId, ModelPricing> = {
  'mock-3d': {
    id: 'mock-3d',
    label: 'Mock 3D (no API calls)',
    usdPerModel: 0,
    typicalSeconds: 0,
    note: 'Built locally from the layout engine. Free, instant, and cleaner than real image-to-3D.',
  },
  meshy: {
    id: 'meshy',
    label: 'Meshy image-to-3D',
    usdPerModel: 0.2,
    typicalSeconds: 90,
    note: 'Good all-rounder. Thin garnish and sauce degrade badly.',
  },
  tripo: {
    id: 'tripo',
    label: 'Tripo image-to-3D',
    usdPerModel: 0.15,
    typicalSeconds: 70,
    note: 'Fastest and cheapest; softest geometry.',
  },
  rodin: {
    id: 'rodin',
    label: 'Rodin / Hyper3D',
    usdPerModel: 0.35,
    typicalSeconds: 150,
    note: 'Best surface detail of the three; slowest and priciest.',
  },
}

export const BILLABLE_MODELS: ModelProviderId[] = ['meshy', 'tripo', 'rodin']

export function costPerModelBatch(count: number) {
  return BILLABLE_MODELS.map((id) => ({
    ...MODEL_PRICING[id],
    batchCost: +(MODEL_PRICING[id].usdPerModel * count).toFixed(4),
    batchSeconds: MODEL_PRICING[id].typicalSeconds * count,
  }))
}
