'use client'

import { useSyncExternalStore } from 'react'

// Browser facts read the React 19 way: as external stores. No effect that sets state on mount, no flash of
// wrong content, and the server render and the first client render agree because the server snapshot is explicit.

const noSubscription = () => () => {}

/** False while rendering on the server and during hydration, true afterwards. */
export const useHydrated = () => useSyncExternalStore(noSubscription, () => true, () => false)

/** This page's origin (https://host), or '' on the server. */
export const useOrigin = () => useSyncExternalStore(noSubscription, () => window.location.origin, () => '')

/** Whether a media query matches, kept live. `serverValue` is what the server render assumes. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = matchMedia(query)
      media.addEventListener('change', notify)
      return () => media.removeEventListener('change', notify)
    },
    () => matchMedia(query).matches,
    () => serverValue,
  )
}

export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')
