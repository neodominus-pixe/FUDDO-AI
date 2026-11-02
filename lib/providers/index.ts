import type { ProviderId } from '../pricing'
import { mockProvider } from './mock'
import { openaiProvider } from './openai'
import type { ImageProvider } from './types'

// Paid providers get registered here once you have a key. Nothing else changes.
const REGISTRY: Partial<Record<ProviderId, ImageProvider>> = {
  mock: mockProvider,
  'gpt-image': openaiProvider,
}

export function getProvider(id: ProviderId = 'mock'): ImageProvider {
  const p = REGISTRY[id]
  if (!p) throw new Error(`Provider "${id}" is not wired up yet. Currently available: ${Object.keys(REGISTRY).join(', ')}`)
  return p
}

export const activeProviderId: ProviderId = (process.env.IMAGE_PROVIDER as ProviderId) || 'mock'
