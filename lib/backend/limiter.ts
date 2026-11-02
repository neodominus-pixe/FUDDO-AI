import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RateLimiter } from './types'

// Fixed-window counters. With the service key they live in Postgres (public.rate_limits), so every server
// instance and every restart shares one count. Without it they fall back to process memory, which is fine
// for one local server and worthless behind several: config() warns about that at startup.

export function databaseLimiter(service: SupabaseClient): RateLimiter {
  // A limiter that cannot reach its store must not lock everyone out, but the failure must not be silent.
  const soft = <T,>(fallback: T) => (error: { message: string } | null, data: T | null) => {
    if (error) {
      console.error('[fuddo] rate limiter unavailable:', error.message)
      return fallback
    }
    return (data ?? fallback) as T
  }

  return {
    async isLimited(key, limit) {
      const { data, error } = await service.rpc('is_rate_limited', { p_key: key, p_limit: limit })
      return soft(false)(error, data as boolean | null)
    },
    async hit(key, limit, windowMs, cost = 1) {
      const { data, error } = await service.rpc('hit_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window: `${Math.max(1, Math.ceil(windowMs / 1000))} seconds`,
        p_cost: cost,
      })
      return soft(false)(error, data as boolean | null)
    },
    async clear(key) {
      const { error } = await service.rpc('clear_rate_limit', { p_key: key })
      if (error) console.error('[fuddo] rate limiter unavailable:', error.message)
    },
  }
}

export function memoryLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, { count: number; expires: number }>()
  const live = (key: string) => {
    const entry = hits.get(key)
    if (entry && entry.expires < now()) {
      hits.delete(key)
      return undefined
    }
    return entry
  }
  return {
    async isLimited(key, limit) {
      return (live(key)?.count ?? 0) >= limit
    },
    async hit(key, limit, windowMs, cost = 1) {
      const entry = live(key) ?? { count: 0, expires: now() + windowMs }
      entry.count += cost
      hits.set(key, entry)
      // Keep the map from growing without bound on a long-lived process.
      if (hits.size > 5000) for (const k of hits.keys()) live(k)
      return entry.count > limit
    },
    async clear(key) {
      hits.delete(key)
    },
  }
}
