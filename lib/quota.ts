import 'server-only'
import { backend, BackendError } from './backend'
import { config } from './config'
import type { RenderOptions } from './render'

// Requests per chef per minute on the routes that build a plate on the server. Every committed edit in the studio sends
// a model and a render, so these sit far above a chef working quickly (and match the 300 a review link already allows);
// they are here so that one account in a loop cannot slow the server down for everyone else.
const PER_MINUTE = { model: 300, render: 300, card: 30 } as const

export async function enforceRate(userId: string, action: keyof typeof PER_MINUTE) {
  const limited = await backend.limiter.hit(`${action}:${userId}`, PER_MINUTE[action], 60_000)
  if (limited) throw new BackendError('That is a lot of requests in a short time. Please wait a minute and try again.', 429, 'rate_limited', 60)
}

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
