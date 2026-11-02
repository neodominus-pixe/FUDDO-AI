import type { ModelProviderId } from '../pricing'
import type { Dish, PlatingSpec } from '../types'

export type ModelRequest = {
  dish: Dish
  spec: PlatingSpec
  // A real image-to-3D service reconstructs geometry from a rendered picture.
  // The mock ignores this and builds from the layout directly.
  sourceImage: string | null
}

export type ModelResult = {
  gltf: object | null
  url: string | null
  costUsd: number
  latencyMs: number
  parts: number
  plateRadius: number
}

export interface ModelProvider {
  id: ModelProviderId
  generate(req: ModelRequest): Promise<ModelResult>
}
