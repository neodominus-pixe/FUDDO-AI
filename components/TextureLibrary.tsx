'use client'

import { useEffect, useState } from 'react'
import type { IngredientTexture } from '@/lib/ingredients'

// The shared library of ingredient textures, for an administrator: see what has been made, remake one that came
// out wrong, remove one that should not be there.

export default function TextureLibrary() {
  const [items, setItems] = useState<IngredientTexture[] | null>(null)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  // Bumping this reloads the list; the effect reads it, so loading never sets state during the effect itself.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/ingredients')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not load the library.')
        if (!cancelled) {
          setItems(data.textures)
          setError('')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the library.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [version])

  async function act(t: IngredientTexture, action: 'regenerate' | 'delete') {
    if (action === 'delete' && !window.confirm(`Delete the texture for "${t.name}"? It will be made again the next time someone plates it.`)) return
    setBusyKey(t.key)
    setError('')
    try {
      const res = await fetch('/api/admin/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'delete' ? { action, key: t.key } : { action, key: t.key, name: t.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'That did not work.')
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
      setVersion((v) => v + 1)
    } finally {
      setBusyKey(null)
    }
  }

  const shown = (items ?? []).filter((t) => t.name.toLowerCase().includes(filter.toLowerCase().trim()))
  const ready = (items ?? []).filter((t) => t.status === 'ready').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="admin-help max-w-xl">
          One photographic surface per ingredient, made the first time anyone plates it and then shared with everyone, including
          review links. Remake one that came out wrong. To fill the library ahead of time, run <code>npm run textures:seed</code> on
          the server.
        </p>
        <label className="admin-search">
          <span className="sr-only">Search textures</span>
          <input className="text-base md:text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search textures…" />
        </label>
      </div>

      {error ? (
        <p className="notice-error p-2.5 text-xs" role="alert">
          {error}
        </p>
      ) : null}

      {items === null && !error ? <p className="text-sm text-muted">Loading…</p> : null}
      {items && items.length === 0 ? (
        <div className="admin-empty">
          <h2>No textures yet</h2>
          <p>They appear as chefs open a plating in 3D.</p>
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <>
          <p className="text-xs text-muted">
            {ready} ready · {items.length - ready} pending or failed
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((t) => (
              <li key={t.key} className="surface overflow-hidden">
                <div className="aspect-square bg-sunken">
                  {t.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.url} alt={`Texture for ${t.name}`} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid h-full place-items-center px-2 text-center text-xs text-muted">
                      {t.status === 'failed' ? t.error ?? 'Failed' : 'Being made…'}
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-2.5">
                  <div>
                    <p className="truncate text-sm font-medium" title={t.name}>
                      {t.name}
                    </p>
                    <p className="text-xs text-muted">
                      {t.status} · {t.source}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-secondary btn-sm min-h-9 flex-1" disabled={busyKey === t.key} onClick={() => void act(t, 'regenerate')}>
                      {busyKey === t.key ? 'Working…' : 'Remake'}
                    </button>
                    <button className="btn btn-secondary btn-sm min-h-9" disabled={busyKey === t.key} onClick={() => void act(t, 'delete')} aria-label={`Delete ${t.name}`}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
