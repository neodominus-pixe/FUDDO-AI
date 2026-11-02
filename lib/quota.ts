import 'server-only'
import { backend, BackendError } from './backend'
import { config } from './config'
import type { RenderOptions } from './render'

/**
 * Counts a chef's paid image generations against an hourly allowance, at the moment one is about to be paid
 * for. Cached pictures and the free local renderer never reach this, so viewing costs nothing.
 */
export function generationQuota(userId: string): RenderOptions {
  return {
    allowPaid: true,
    beforePaid: async () => {
      const limited = await backend.limiter.hit(`gen:${userId}`, config().generationLimitPerHour, 60 * 60_000)
      if (limited) throw new BackendError('You have reached the hourly image limit. It resets within the hour.', 429, 'quota', 3600)
    },
  }
}
