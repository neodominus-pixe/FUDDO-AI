'use client'

import { useEffect, useState } from 'react'
import Masthead from './Masthead'
import type { CameraView } from './ModelViewer'
import PlatingModel from './PlatingModel'
import PlatingThumb from './studio/PlatingThumb'
import SpreadSnapshots, { type Snapshot } from './studio/SpreadSnapshots'
import type { ClientRender } from './RefineView'
import type { Dish } from '@/lib/types'

import PageContainer from './PageContainer'

type ReviewData = {
  dishName: string
  components: Array<{ id?: string; name: string; role: string; imagePath?: string | null }>
  renders: ClientRender[]
  review: { reviewer: string; pickedSpecId: string | null; comment: string; reviewedAt: string | null }
}

const CAMERA_VIEWS: Array<[CameraView, string]> = [
  ['top', 'Top'],
  ['three-quarter', '3/4'],
  ['side', 'Side'],
]

// Downloads a data URL under a tidy filename. Routed through a Blob rather than
// handing the browser the data: URL directly -- a full-resolution PNG runs to
// hundreds of kilobytes, and browsers refuse data: downloads past a size limit.
function saveDataUrl(dataUrl: string, filename: string) {
  const [meta, b64] = dataUrl.split(',')
  const type = /:(.*?);/.exec(meta)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plating'

export default function ReviewClient({ shareId }: { shareId: string }) {
  const [data, setData] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  // Each plating is shown as a picture of its 3D scene, drawn in the background once the plating is loaded.
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({})
  const [focused, setFocused] = useState<string | null>(null)
  const [view, setView] = useState<'grid' | '3d' | 'compare'>('3d')
  const [turntable, setTurntable] = useState(false)
  const [cameraCommand, setCameraCommand] = useState<{ view: CameraView; nonce: number } | null>(null)
  const [captureCommand, setCaptureCommand] = useState<{ nonce: number } | null>(null)
  // Choosing between plating directions from memory is hard; up to three can be
  // put next to each other. Three keeps well inside the browser's WebGL limit.
  const [compare, setCompare] = useState<string[]>([])
  const [reviewer, setReviewer] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/review/${shareId}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not load this review.')
        setData(json)
        setPicked(json.review.pickedSpecId)
        setFocused(json.review.pickedSpecId ?? json.renders[0]?.spec.id ?? null)
        setReviewer(json.review.reviewer)
        setComment(json.review.comment)
        setSaved(Boolean(json.review.reviewedAt))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this review.')
      }
    })()
  }, [shareId])

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch(`/api/review/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer, comment, pickedSpecId: picked }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not send your choice.')
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your choice.')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6 text-center">
        <p className="max-w-sm text-sm text-muted">{error}</p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper text-sm text-muted">
        Loading platings...
      </main>
    )
  }

  const chosen = data.renders.find((r) => r.spec.id === picked) ?? null
  const compared = compare
    .map((id) => data.renders.find((r) => r.spec.id === id))
    .filter(Boolean) as typeof data.renders

  function toggleCompare(id: string) {
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]))
  }
  const focusedRender = data.renders.find((r) => r.spec.id === focused) ?? data.renders[0]
  // The dish is only needed to build models; components carry the appearance.
  const dish: Dish = {
    id: 'review',
    name: data.dishName,
    createdAt: '',
    components: data.components.map((c, i) => ({
      id: c.id ?? `rc${i}`,
      name: c.name,
      role: c.role as Dish['components'][number]['role'],
      imagePath: c.imagePath ?? null,
    })),
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <Masthead eyebrow="Plating review" />
      <SpreadSnapshots
        dish={dish}
        items={data.renders.map((r) => ({ id: r.spec.id, key: JSON.stringify(r.spec), spec: r.spec }))}
        done={snapshots}
        onSnap={(id, snapshot) => setSnapshots((prev) => (prev[id]?.key === snapshot.key && prev[id]?.url && !snapshot.url ? prev : { ...prev, [id]: snapshot }))}
      />
      <div className="border-b border-rule bg-raised">
        <PageContainer className="flex flex-wrap items-end justify-between gap-4 py-5">
          <div>
            <h1 className="display text-2xl md:text-4xl">{data.dishName}</h1>
            <p className="mt-1.5 text-xs text-muted">
              {data.components.map((c) => c.name).filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="segmented shrink-0">
            {([['3d', '3D'], ['compare', 'Compare'], ['grid', 'Grid']] as const).map(([v, text]) => (
              <button key={v} data-active={view === v} onClick={() => setView(v)} className="px-3 py-1.5 min-h-11">
                {text}
              </button>
            ))}
          </div>
        </PageContainer>
      </div>

      <PageContainer className="py-6 md:py-8">
        {saved ? (
          <div className="notice-approved mb-6 p-4">
            <p className="text-sm font-medium text-approved">Choice sent{chosen ? `: ${chosen.name}` : ''}.</p>
            <p className="mt-1 text-xs text-approved">
              The kitchen can see your pick and notes. You can still change it below.
            </p>
          </div>
        ) : (
          <p className="mb-6 text-sm text-muted">
            Turn the plate to judge the build, then pick the one you want made for tasting.
          </p>
        )}

        {view === 'compare' ? (
          <div className="space-y-3">
            {compared.length === 0 ? (
              <p className="rounded border border-dashed border-rule-strong p-8 text-center text-sm text-muted">
                Pick two or three platings below to see them side by side.
              </p>
            ) : (
              <div
                className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
              >
                {compared.map((r) => (
                  <div key={r.id} className="overflow-hidden rounded border border-rule bg-raised">
                    <div className="plate-well h-72 w-full">
                      <PlatingModel dish={dish} spec={r.spec} shareId={shareId} turntable={turntable} />
                    </div>
                    <div className="border-t border-rule px-3 py-2.5">
                      <h3 className="display text-sm leading-snug">{r.name}</h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {r.spec.plate.replace(/-/g, ' ')} · sauce {r.spec.sauce} · {r.spec.height}
                      </p>
                      <button
                        onClick={() => setPicked(picked === r.spec.id ? null : r.spec.id)}
                        className={[
                          'btn btn-sm mt-2 w-full',
                          picked === r.spec.id ? 'btn-approve' : 'btn-secondary',
                        ].join(' ')}
                      >
                        {picked === r.spec.id ? 'Picked' : 'Pick this one'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {compared.length}/3 selected &middot; tap a plating to add or remove it
              </p>
              <button
                onClick={() => setTurntable((t) => !t)}
                data-active={turntable}
                className="segmented px-2.5 py-1 text-xs min-h-11 flex items-center data-[active=true]:bg-brand data-[active=true]:text-on-brand"
              >
                Turntable
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {data.renders.map((r) => {
                const on = compare.includes(r.spec.id)
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleCompare(r.spec.id)}
                    title={r.name}
                    className={[
                      'shrink-0 overflow-hidden rounded border-2 bg-raised transition min-h-11',
                      on ? 'border-brand' : 'border-rule hover:border-rule-strong',
                    ].join(' ')}
                  >
                    <PlatingThumb render={r} snapshot={snapshots[r.spec.id]} className="plate-well h-20 w-20" />
                    {picked === r.spec.id ? (
                      <div className="bg-approved py-0.5 text-center text-xs text-paper font-medium">picked</div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        ) : view === '3d' && focusedRender ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-rule-strong bg-raised">
              <div className="relative plate-well h-80 sm:h-96 w-full">
                <PlatingModel
                  dish={dish}
                  spec={focusedRender.spec}
                  shareId={shareId}
                  turntable={turntable}
                  cameraCommand={cameraCommand}
                  captureCommand={captureCommand}
                  onCapture={(url) =>
                    saveDataUrl(url, `${slug(data.dishName)}-${slug(focusedRender.name ?? '')}.png`)
                  }
                />
                {/* The consultant is judging a plate, not driving software: give
                    them fixed angles and a hands-off turntable. */}
                <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 rounded bg-scrim/75 p-1.5 backdrop-blur-sm">
                  <div className="segmented">
                    {CAMERA_VIEWS.map(([v, text]) => (
                      <button
                        key={v}
                        onClick={() => setCameraCommand({ view: v, nonce: Date.now() })}
                        title={`Look from ${text.toLowerCase()}`}
                        className="min-h-11"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setTurntable((t) => !t)}
                    data-active={turntable}
                    className="segmented px-2.5 py-1 text-xs min-h-11 flex items-center data-[active=true]:bg-brand data-[active=true]:text-on-brand"
                  >
                    Turntable
                  </button>
                  <button
                    onClick={() => setCaptureCommand({ nonce: Date.now() })}
                    title="Save this exact view as a PNG"
                    className="segmented px-2.5 py-1 text-xs min-h-11 flex items-center"
                  >
                    Save view
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3">
                <div>
                  <h3 className="text-sm font-medium">{focusedRender.name}</h3>
                  <p className="text-xs text-muted">
                    {focusedRender.spec.plate.replace(/-/g, ' ')} · sauce {focusedRender.spec.sauce} ·{' '}
                    {focusedRender.spec.height} build
                  </p>
                </div>
                <button
                  onClick={() => setPicked(picked === focusedRender.spec.id ? null : focusedRender.spec.id)}
                  className={[
                    'btn btn-sm',
                    picked === focusedRender.spec.id ? 'btn-approve' : 'btn-primary',
                  ].join(' ')}
                >
                  {picked === focusedRender.spec.id ? 'Picked' : 'Pick this plating'}
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {data.renders.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setFocused(r.spec.id)}
                  title={r.name}
                  className={[
                    'shrink-0 overflow-hidden rounded border-2 bg-raised transition min-h-11',
                    r.spec.id === focused ? 'border-stone-900' : 'border-rule-strong hover:border-rule-strong',
                  ].join(' ')}
                >
                  <PlatingThumb render={r} snapshot={snapshots[r.spec.id]} className="plate-well h-20 w-20" />
                  {picked === r.spec.id ? (
                    <div className="bg-approved py-0.5 text-center text-xs text-paper font-medium">picked</div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.renders.map((r) => {
              const active = picked === r.spec.id
              return (
                <div
                  key={r.id}
                  className={[
                    'min-w-0 overflow-hidden rounded-lg border-2 bg-raised transition',
                    active ? 'border-stone-900 ring-2 ring-ink/10' : 'border-rule-strong',
                  ].join(' ')}
                >
                  <button onClick={() => setPicked(active ? null : r.spec.id)} className="block w-full text-left">
                    <PlatingThumb render={r} snapshot={snapshots[r.spec.id]} className="plate-well aspect-square w-full" />
                  </button>
                  <div className="flex items-center justify-between border-t border-rule px-3 py-2">
                    <div>
                      <h3 className="text-sm font-medium">{r.name}</h3>
                      <p className="text-xs text-muted">
                        {r.spec.plate.replace(/-/g, ' ')} · sauce {r.spec.sauce}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setFocused(r.spec.id)
                        setView('3d')
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      3D
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-8 surface p-5">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-[200px_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Your name</span>
              <input
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="Consultant name"
                className="field text-base md:text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Notes for the kitchen</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="e.g. this one, but bring the sauce down and lose one leek"
                className="field text-base md:text-sm"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={saving || !picked}
              className="btn btn-primary btn-md"
            >
              {saving ? 'Sending...' : saved ? 'Update choice' : 'Send choice to kitchen'}
            </button>
            {!picked ? <p className="text-xs text-muted">Pick a plating first.</p> : null}
          </div>
        </div>
      </PageContainer>
    </main>
  )
}
