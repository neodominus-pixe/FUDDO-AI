'use client'

import { useEffect, useMemo, useState } from 'react'
import { normalizeIngredient } from '@/lib/ingredients'

export type TextureEntry = { url: string; avgColor: string | null }
/** Finished textures by normalised ingredient name. */
export type TextureMap = Record<string, TextureEntry>

type Known = Record<string, { status: 'pending' | 'ready' | 'failed'; url: string | null; avgColor: string | null }>

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The photographic textures for a list of ingredients. Looks up what already exists; when `generate` is on (a
 * signed-in chef editing, not a consultant looking) it also asks for the ones that do not, one at a time, so a
 * free image allowance is spent politely. Anything still being made is checked again every few seconds.
 * Pieces without a texture simply keep the plain colour they always had.
 */
export function useIngredientTextures(names: string[], generate: boolean): { textures: TextureMap; making: number; loaded: boolean } {
  // Equal lists must not restart the work, so everything below depends on one joined string rather than the array.
  const joined = names.join('|')
  const wanted = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const name of joined.split('|')) {
      const key = normalizeIngredient(name)
      if (key && !byKey.has(key)) byKey.set(key, name.trim())
    }
    return [...byKey.entries()].slice(0, 40)
  }, [joined])

  const [known, setKnown] = useState<Known>({})
  const [making, setMaking] = useState(0)
  // True once the first look-up has been answered (or failed): anything that needs the textures before it acts waits for it.
  const [heard, setHeard] = useState(false)

  useEffect(() => {
    if (!wanted.length) return
    let cancelled = false
    const merge = (found: Known) => {
      if (!cancelled) setKnown((prev) => ({ ...prev, ...found }))
    }

    async function read(): Promise<Known> {
      const res = await fetch(`/api/ingredients/textures?names=${encodeURIComponent(wanted.map(([, name]) => name).join('|'))}`)
      if (!res.ok) return {}
      const { textures } = (await res.json()) as { textures: Known }
      return textures ?? {}
    }

    async function run() {
      try {
        let current = await read()
        merge(current)
        if (!cancelled) setHeard(true)

        if (generate) {
          const missing = wanted.filter(([key]) => !current[key] || current[key].status === 'failed').slice(0, 16)
          if (!cancelled) setMaking(missing.length)
          for (const [key, name] of missing) {
            if (cancelled) return
            for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
              const res = await fetch('/api/ingredients/textures', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
              })
              if (res.ok) {
                const { texture } = (await res.json()) as { texture: { status: Known[string]['status']; url: string | null; avgColor: string | null } }
                merge({ [key]: texture })
                break
              }
              // A busy service or an allowance that is used up: wait as long as it asks, then try again.
              if (res.status === 429 || res.status === 503) {
                await wait(Math.min(60, Number(res.headers.get('retry-after')) || 20) * 1000)
                continue
              }
              break // Something that waiting will not fix: leave this ingredient plain.
            }
            if (!cancelled) setMaking((n) => Math.max(0, n - 1))
          }
        }

        // Whatever another request is still making: look again every few seconds for a while.
        for (let i = 0; i < 20 && !cancelled; i++) {
          current = { ...current, ...(await read()) }
          merge(current)
          if (!wanted.some(([key]) => current[key]?.status === 'pending')) break
          await wait(4000)
        }
      } catch {
        // Offline or a server hiccup: the model is still perfectly usable without photographs.
        if (!cancelled) setHeard(true)
      } finally {
        if (!cancelled) setMaking(0)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [wanted, generate])

  const textures = useMemo(() => {
    const out: TextureMap = {}
    for (const [key] of wanted) {
      const k = known[key]
      if (k?.status === 'ready' && k.url) out[key] = { url: k.url, avgColor: k.avgColor }
    }
    return out
  }, [known, wanted])

  return { textures, making, loaded: heard || wanted.length === 0 }
}
