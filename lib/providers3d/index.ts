import type { ModelProviderId } from '../pricing'
import { mock3dProvider } from './mock'
import type { ModelProvider } from './types'

const REGISTRY: Partial<Record<ModelProviderId, ModelProvider>> = {
  'mock-3d': mock3dProvider,
}

export function getModelProvider(id: ModelProviderId = 'mock-3d'): ModelProvider {
  const p = REGISTRY[id]
  if (!p) throw new Error(`3D provider "${id}" is not wired up yet. Available: ${Object.keys(REGISTRY).join(', ')}`)
  return p
}

export const activeModelProviderId: ModelProviderId =
  (process.env.MODEL_PROVIDER as ModelProviderId) || 'mock-3d'
