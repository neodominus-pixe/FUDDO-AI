'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Masthead from '@/components/Masthead'
import RefineView, { type ClientRender } from '@/components/RefineView'
import ComponentList from '@/components/ComponentList'
import PlatingThumb from '@/components/studio/PlatingThumb'
import SpreadSnapshots, { type Snapshot, type SnapItem } from '@/components/studio/SpreadSnapshots'
import PageContainer from '@/components/PageContainer'
import { useHydrated, useOrigin } from '@/lib/client/hooks'
import { prepareUpload } from '@/lib/client/resize-image'
import type { Component, Dish, PlatingSpec } from '@/lib/types'

type CostLine = { id: string; label: string; usdPerImage: number; batchCost: number; note: string; quality?: string }
type Review = { reviewer: string; pickedSpecId: string | null; comment: string; reviewedAt: string | null }

// Pre-filled so the loop can be exercised immediately without typing a menu in.
const STARTER: Component[] = [
  { id: 'c1', name: 'Seared duck breast', role: 'hero', imagePath: null },
  { id: 'c2', name: 'Celeriac puree', role: 'support', imagePath: null },
  { id: 'c3', name: 'Charred baby leek', role: 'support', imagePath: null },
  { id: 'c4', name: 'Red wine jus', role: 'sauce', imagePath: null },
  { id: 'c5', name: 'Micro chervil', role: 'garnish', imagePath: null },
]

export default function Home() {
  const [dishName, setDishName] = useState('Duck breast, celeriac, red wine')
  const [components, setComponents] = useState<Component[]>(STARTER)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [renders, setRenders] = useState<ClientRender[]>([])
  const [costs, setCosts] = useState<CostLine[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ClientRender | null>(null)
  const [imagesMade, setImagesMade] = useState(0)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(null)
  const origin = useOrigin()
  const [review, setReview] = useState<Review | null>(null)
  const [copied, setCopied] = useState(false)
  const [spentUsd, setSpentUsd] = useState(0)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [suggesting, setSuggesting] = useState(false)
  const [suggestNote, setSuggestNote] = useState<string | null>(null)
  // The styles a named dish comes in (a pizza is a margherita, a pepperoni, a four cheese…), and the one in use.
  const [styles, setStyles] = useState<{ family: string; list: string[]; current: string } | null>(null)
  // Set the moment the chef edits the list themselves, so auto-suggest never
  // overwrites work someone has already done.
  const [componentsTouched, setComponentsTouched] = useState(false)
  // Accumulated rather than recomputed: a spread runs at low quality and the spec
  // card at high, so images x one flat price would be wrong.
  const [wouldSpend, setWouldSpend] = useState<Record<string, number>>({})
  const [providerLabels, setProviderLabels] = useState<Record<string, string>>({})
  const [sessionEstimate, setSessionEstimate] = useState<Array<{ id: string; label: string; total: number }>>([])

  function addWould(list?: Array<{ id: string; label: string; batchCost: number }>) {
    if (!list?.length) return
    setWouldSpend((w) => {
      const next = { ...w }
      for (const c of list) next[c.id] = (next[c.id] ?? 0) + c.batchCost
      return next
    })
    setProviderLabels((l) => {
      const next = { ...l }
      for (const c of list) next[c.id] = c.label
      return next
    })
  }
  const [provider, setProvider] = useState('mock')
  // Each card is a picture of the plating's 3D scene, drawn in the background, one after another. A card is redrawn when
  // its plating changes, which is what the key records.
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({})

  const rendersRef = useRef<ClientRender[]>([])
  useEffect(() => {
    rendersRef.current = renders
  }, [renders])

  // The server sends fully-formed buttons, but their handlers only attach once
  // React hydrates. Until then a press does nothing at all -- brief on a laptop,
  // seconds on a phone over mobile data. Hold the actions disabled until they
  // actually work rather than looking ready and silently swallowing the click.
  const hydrated = useHydrated()

  const dish: Dish = useMemo(
    () => ({ id: 'dish-1', name: dishName, components, createdAt: new Date().toISOString() }),
    [dishName, components],
  )

  // While the consultant has the link open, watch for their choice landing.
  useEffect(() => {
    if (!projectId || review?.reviewedAt) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}?meta=1`)
        if (!res.ok) return
        const { project } = await res.json()
        if (project?.review?.reviewedAt) setReview(project.review)
      } catch {
        // Transient failure; the next tick will retry.
      }
    }, 8000)
    return () => clearInterval(timer)
  }, [projectId, review?.reviewedAt])

  const snapItems = useMemo<SnapItem[]>(() => renders.map((r) => ({ id: r.spec.id, key: JSON.stringify(r.spec), spec: r.spec })), [renders])
  const pendingSnaps = snapItems.filter((i) => snapshots[i.id]?.key !== i.key).length

  const canGenerate = hydrated && dishName.trim().length > 0 && components.length > 0 && !loading
  const photoCount = components.filter((c) => c.imagePath).length

  function update(id: string, patch: Partial<Component>) {
    setComponentsTouched(true)
    setComponents((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  // Reads the dish name and fills the component list from it.
  async function suggest(auto = false, variant?: string) {
    const name = dishName.trim()
    if (!name || suggesting) return
    setSuggesting(true)
    setError(null)
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName: name, variant }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not read that dish name.')
      if (!data.components?.length) return
      setComponents(data.components)
      setPreviews({})
      setSuggestNote(data.note ?? null)
      setStyles(data.family && data.variants?.length > 1 ? { family: data.family, list: data.variants, current: data.variant ?? data.variants[0] } : null)
      // An automatic fill has not been edited by hand, so a later name change may
      // still refresh it. An explicit click means the chef chose this list.
      setComponentsTouched(!auto)
    } catch (e) {
      if (!auto) setError(e instanceof Error ? e.message : 'Could not read that dish name.')
    } finally {
      setSuggesting(false)
    }
  }

  // Component order is stack order, bottom first. A burger needs the bun at the
  // base, and nothing else in the app lets you express that.
  function reorder(from: number, to: number) {
    setComponentsTouched(true)
    setComponents((cs) => {
      if (from === to || from < 0 || to < 0 || from >= cs.length || to >= cs.length) return cs
      const next = [...cs]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  // Reference photos are what make the result the chef's actual dish rather than
  // a generic one, so they are stored server-side and travel with the project.
  async function attach(id: string, file: File | undefined) {
    if (!file) return
    setUploading((u) => ({ ...u, [id]: true }))
    try {
      // Shrink a camera photo first: faster on mobile data, and far below the server's size limit.
      const ready = await prepareUpload(file)
      setPreviews((p) => ({ ...p, [id]: URL.createObjectURL(ready) }))
      const body = new FormData()
      body.append('file', ready)
      const res = await fetch('/api/upload', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.')
      update(id, { imagePath: data.path })
      setPreviews((p) => ({ ...p, [id]: data.path }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
      setPreviews((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
    } finally {
      setUploading((u) => ({ ...u, [id]: false }))
    }
  }

  function detach(id: string) {
    update(id, { imagePath: null })
    setPreviews((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
  }

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish, count: 12 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed.')
      setRenders(data.renders)
      setCosts(data.wouldHaveCost)
      setImagesMade((n) => n + data.renders.length)
      setSpentUsd((v) => v + (data.actualCostUsd ?? 0))
      setProvider(data.provider ?? 'mock')
      addWould(data.wouldHaveCost)
      setSessionEstimate(data.sessionEstimate ?? [])
      // A new spread is a new review; drop any previous link and verdict.
      setProjectId(null)
      setShareId(null)
      setReview(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const spreadPayload = (list: ClientRender[]) => list.map((r) => ({ name: r.name ?? 'Plating', spec: r.spec }))

  async function saveAndShare() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish, spread: spreadPayload(renders) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save.')
      setProjectId(data.id)
      setShareId(data.shareId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  // Refinements write straight back to the saved spread, so a link already sent
  // to a consultant always shows the current state of the platings.
  function handleSpecCommit(spec: PlatingSpec) {
    const next = rendersRef.current.map((r) => (r.specId === spec.id ? { ...r, spec } : r))
    rendersRef.current = next
    setRenders(next)
    if (!projectId) return
    void fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dish, spread: spreadPayload(next) }),
    })
  }

  function handleRendered(r: ClientRender) {
    setRenders((rs) => rs.map((x) => (x.specId === r.specId ? { ...r, name: x.name } : x)))
  }

  const shareUrl = shareId && origin ? `${origin}/review/${shareId}` : ''
  const pickedRender = review?.pickedSpecId ? renders.find((r) => r.spec.id === review.pickedSpecId) : null

  return (
    <main className="min-h-screen bg-paper text-ink">
      <Masthead
        eyebrow="Menu development"
        right={
          <>
            <span className="numeric">{imagesMade}</span> image{imagesMade === 1 ? '' : 's'} this session
            &nbsp;&middot;&nbsp; {provider === 'mock' ? 'mock renderer' : provider}
            &nbsp;&middot;&nbsp; <span className="numeric">${spentUsd.toFixed(2)}</span> spent
          </>
        }
      />

      <PageContainer className="py-6 md:py-8">
        {selected ? (
          <RefineView
            dish={dish}
            initial={selected}
            onBack={() => setSelected(null)}
            onSpend={(usd, would) => {
              setImagesMade((n) => n + 1)
              setSpentUsd((v) => v + usd)
              addWould(would)
            }}
            onSpecCommit={handleSpecCommit}
            onRendered={handleRendered}
            onAddComponent={(component) => {
              setComponentsTouched(true)
              setComponents((cs) => [...cs, component])
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[430px_1fr] md:items-start">
            <section className="space-y-3">
              <div className="surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="dish-name" className="eyebrow">
                    1 &middot; Your dish
                  </label>
                  <button
                    onClick={() => void suggest(false)}
                    disabled={!hydrated || suggesting || !dishName.trim()}
                    className="link-brand text-xs disabled:opacity-40"
                  >
                    {suggesting ? 'Reading…' : 'Fill in components'}
                  </button>
                </div>
                <input
                  id="dish-name"
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                  onBlur={() => {
                    // Fill automatically only while the list is still untouched.
                    if (!componentsTouched) void suggest(true)
                  }}
                  className="mt-2 field text-base md:text-sm"
                  placeholder="Duck breast, celeriac, red wine — or just: burger"
                />
                {suggestNote ? <p className="mt-2 text-xs leading-relaxed text-muted">{suggestNote}</p> : null}
                {styles ? (
                  <div className="mt-3" role="group" aria-label={`${styles.family} styles`}>
                    <p className="eyebrow mb-2">{styles.family} style</p>
                    <div className="flex flex-wrap gap-1.5">
                      {styles.list.map((label) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={label === styles.current}
                          data-active={label === styles.current}
                          onClick={() => void suggest(false, label)}
                          disabled={suggesting}
                          className="segmented min-h-9 px-3 text-xs data-[active=true]:bg-brand data-[active=true]:text-on-brand disabled:opacity-60"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex items-center justify-between">
                  <h2 className="eyebrow">2 &middot; What is on the plate</h2>
                  <button
                    onClick={() => {
                      setComponentsTouched(true)
                      setComponents((cs) => [...cs, { id: `c${Date.now()}`, name: '', role: 'support', imagePath: null }])
                    }}
                    className="link-brand text-xs"
                  >
                    + Add
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Bottom of the stack first. Drag to reorder.{' '}
                  {photoCount > 0
                    ? `${photoCount} of ${components.length} have photos.`
                    : 'A photo makes the plating use your food, not stock food.'}
                </p>
                <ComponentList
                  components={components}
                  previews={previews}
                  uploading={uploading}
                  onChange={update}
                  onReorder={reorder}
                  onRemove={(id) => {
                    setComponentsTouched(true)
                    setComponents((cs) => cs.filter((x) => x.id !== id))
                  }}
                  onAttach={attach}
                  onDetach={detach}
                />
              </div>

              {error ? <p className="notice-error p-2.5 text-xs" role="alert">{error}</p> : null}

              <div className="sticky bottom-0 z-20 -mx-1 bg-paper/90 px-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
                <button onClick={generate} disabled={!canGenerate} className="btn btn-primary btn-md w-full">
                  {loading ? 'Generating spread…' : renders.length ? 'Regenerate 12 platings' : '3 · Generate 12 platings'}
                </button>
              </div>
            </section>

            <section className="min-w-0">
              {renders.length ? <SpreadSnapshots dish={dish} items={snapItems} done={snapshots} onSnap={(id, snapshot) => setSnapshots((prev) => (prev[id]?.key === snapshot.key && prev[id]?.url && !snapshot.url ? prev : { ...prev, [id]: snapshot }))} /> : null}
              {review?.reviewedAt && pickedRender ? (
                <div className="notice-approved mb-4 p-4">
                  <p className="text-sm font-medium text-approved">
                    {review.reviewer || 'The consultant'} picked &ldquo;{pickedRender.name}&rdquo;
                  </p>
                  {review.comment ? (
                    <p className="mt-1 text-xs leading-relaxed text-approved">&ldquo;{review.comment}&rdquo;</p>
                  ) : null}
                  <button onClick={() => setSelected(pickedRender)} className="btn btn-approve btn-sm mt-3">
                    Open it in the editor
                  </button>
                </div>
              ) : null}

              {renders.length > 0 ? (
                <div className="surface mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Pick a plating to refine, or send the spread for review.</p>
                    {shareUrl ? (
                      <p className="text-xs text-muted">
                        {review?.reviewedAt ? 'Choice received.' : 'Waiting for their choice…'} No account needed on their side.
                      </p>
                    ) : null}
                  </div>
                  {shareUrl ? (
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                      <input
                        readOnly
                        aria-label="Review link"
                        value={shareUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded border border-rule-strong bg-sunken px-2 py-1.5 font-mono text-xs sm:w-56 sm:flex-none"
                      />
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(shareUrl)
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1500)
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        {copied ? 'Copied' : 'Copy link'}
                      </button>
                      <a href={`/card/${projectId}`} className="btn btn-secondary btn-sm">
                        Spec card
                      </a>
                    </div>
                  ) : (
                    <button onClick={saveAndShare} disabled={!hydrated || saving} className="btn btn-primary btn-sm">
                      {saving ? 'Saving…' : 'Save & get review link'}
                    </button>
                  )}
                </div>
              ) : null}

              {loading ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-hidden="true">
                  {Array.from({ length: 12 }, (_, i) => (
                    <div key={i} className="plate-card animate-pulse">
                      <div className="plate-well aspect-square w-full" />
                      <div className="space-y-1.5 border-t border-rule px-3.5 py-3">
                        <div className="h-3 w-2/3 rounded bg-sunken" />
                        <div className="h-2.5 w-1/2 rounded bg-sunken" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : renders.length === 0 ? (
                <div className="grid min-h-80 place-items-center rounded border border-dashed border-rule-strong px-8 text-center">
                  <div className="max-w-sm">
                    <h2 className="display text-2xl">Twelve ways to plate one dish</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      Check the components on the left, then generate a spread to send your consultant &mdash;
                      without plating twelve times to get there.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                {pendingSnaps > 0 ? (
                  <p className="mb-2 text-xs text-muted" role="status">
                    Drawing the 3D previews&hellip; {renders.length - pendingSnaps} of {renders.length}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {renders.map((r, i) => {
                    const isPick = review?.pickedSpecId === r.spec.id
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelected(r)}
                        data-picked={isPick}
                        style={{ animationDelay: `${Math.min(i, 11) * 45}ms` }}
                        className="plate-card rise-in min-w-0"
                      >
                        <PlatingThumb render={r} snapshot={snapshots[r.spec.id]} className="plate-well aspect-square w-full" />
                        <div className="border-t border-rule px-3 py-2.5">
                          <h3 className="display text-sm leading-snug">
                            {r.name}
                            {isPick ? (
                              <span className="ml-2 font-sans text-xs uppercase tracking-wider text-approved">picked</span>
                            ) : null}
                          </h3>
                          <p className="truncate text-xs text-muted">
                            {r.spec.plate.replace(/-/g, ' ')} &middot; {r.spec.height}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
                </>
              )}

              {costs.length ? (
                <details className="surface mt-6 p-4">
                  <summary className="eyebrow cursor-pointer">What this session would have cost</summary>
                  <p className="mt-2 text-xs text-muted">
                    {imagesMade} images so far. You paid ${spentUsd.toFixed(2)}
                    {provider === 'mock' ? ' — mock renderer.' : '.'}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {Object.entries(wouldSpend).map(([id, total]) => (
                      <li key={id} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-ink">{providerLabels[id] ?? id}</span>
                        <span className="font-mono text-ink">${total.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                  {sessionEstimate.length ? (
                    <p className="mt-3 border-t border-rule pt-3 text-xs leading-relaxed text-muted">
                      A finished session is ~30 images &mdash; spread and refinements at low quality, the chosen
                      plating at high &mdash; about $
                      {Math.min(...sessionEstimate.map((s) => s.total)).toFixed(2)} at the cheapest provider.
                    </p>
                  ) : null}
                </details>
              ) : null}
            </section>
          </div>
        )}
      </PageContainer>
    </main>
  )
}
