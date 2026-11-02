import type { Angle, Dish, PlatingSpec } from '../types'
import type { ImageQuality, ProviderId } from '../pricing'

export type GenerateRequest = {
  dish: Dish
  spec: PlatingSpec
  angle: Angle
  prompt: string
  // Resolved from the render's purpose, so a provider never has to guess whether
  // this image is a throwaway option or the one going on the spec card.
  quality: ImageQuality
}

export type GenerateResult = {
  svg: string | null
  // A provider that produces a raster image hands back its bytes. render.ts stores them and caches the
  // URL, so a provider never has to know where images live.
  image: { bytes: Uint8Array; mime: string } | null
  costUsd: number
  latencyMs: number
}

// Every provider implements this. Swapping to a paid model is one new file
// plus one line in the registry -- no changes anywhere else in the app.
export interface ImageProvider {
  id: ProviderId
  generate(req: GenerateRequest): Promise<GenerateResult>
}
