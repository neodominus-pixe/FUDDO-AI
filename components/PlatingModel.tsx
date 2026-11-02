'use client'

import { useEffect, useMemo, useState } from 'react'
import ModelViewer, { type CameraCommand, type CameraPose } from './ModelViewer'
import type { LightingPreset } from './scene/look'
import { useIngredientTextures } from '@/lib/client/ingredient-textures'
import { modelKey } from '@/lib/scene/poses'
import type { Dish, PlatingSpec } from '@/lib/types'

type ModelResponse = {
  gltf: object | null
  url: string | null
  parts: number
  plateRadius: number
  costUsd: number
  latencyMs: number
  provider: string
  wouldHaveCost: Array<{ id: string; label: string; batchCost: number; batchSeconds: number }>
}

// Fetches a model for one spec and shows it. Used both in the chef's editor and
// in the consultant's review, so the two see identical geometry.
export default function PlatingModel({
  dish,
  spec,
  shareId,
  editable = false,
  selection = [],
  locked = [],
  solo = null,
  turntable = false,
  snap = true,
  guides = false,
  brush = false,
  onStroke,
  lighting = 'studio',
  cameraCommand = null,
  snapshotCommand = null,
  onSnapshot,
  captureCommand = null,
  onMove,
  onSelect,
  onCapture,
}: {
  dish: Dish
  spec: PlatingSpec
  /** Set on a review link: the model is fetched by share link (no account), from the stored spec. */
  shareId?: string
  editable?: boolean
  selection?: string[]
  locked?: string[]
  solo?: string | null
  turntable?: boolean
  snap?: boolean
  guides?: boolean
  brush?: boolean
  onStroke?: (points: Array<[number, number]>) => void
  lighting?: LightingPreset
  cameraCommand?: CameraCommand | null
  snapshotCommand?: { nonce: number } | null
  onSnapshot?: (pose: CameraPose) => void
  captureCommand?: { nonce: number } | null
  onMove?: (moves: Array<{ key: string; x: number; y: number; lift?: number }>) => void
  onSelect?: (key: string | null, additive: boolean) => void
  onCapture?: (dataUrl: string) => void
}) {
  // A model is only rebuilt when what is IN it changes. Moving, turning, resizing and recolouring pieces are
  // applied to the model that is already on screen (see ModelViewer), so they cost nothing and never flicker.
  // The result remembers which request it answered and the spec it was built for, so "busy" and "error" are
  // derived instead of being set from inside the effect.
  const requestKey = useMemo(() => (shareId ? `share:${shareId}:${spec.id}` : modelKey(dish, spec)), [dish, spec, shareId])
  // Photographic surfaces for the food. A chef editing makes the missing ones; a consultant only sees what exists.
  const { textures, making } = useIngredientTextures(
    useMemo(() => dish.components.map((c) => c.name), [dish.components]),
    !shareId && editable,
  )
  const [result, setResult] = useState<{ key: string; data: ModelResponse | null; error: string | null; builtFor: PlatingSpec | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = shareId
          ? await fetch(`/api/review/${encodeURIComponent(shareId)}/model?spec=${encodeURIComponent(spec.id)}`)
          : await fetch('/api/model', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dish, spec }),
            })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not build the model.')
        if (!cancelled) setResult({ key: requestKey, data: json, error: null, builtFor: spec })
      } catch (e) {
        // Deliberately keep the last good model: dropping it would unmount the viewer and reset the camera.
        if (!cancelled)
          setResult((prev) => ({
            key: requestKey,
            data: prev?.data ?? null,
            builtFor: prev?.builtFor ?? null,
            error: e instanceof Error ? e.message : 'Could not build the model.',
          }))
      }
    })()
    return () => {
      cancelled = true
    }
    // requestKey already encodes everything that changes the model; depending on the objects themselves would
    // refetch whenever a parent re-renders with equal data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, shareId])

  const data = result?.data ?? null
  const busy = result?.key !== requestKey
  const error = result?.key === requestKey ? result.error : null
  const builtFor = result?.builtFor ?? null

  if (error) {
    return <div className="grid h-full place-items-center p-4 text-center text-xs text-danger">{error}</div>
  }
  if (!data) {
    return (
      <div className="grid h-full place-items-center text-xs text-muted" role="status" aria-busy="true">
        Building model...
      </div>
    )
  }

  const cheapest = data.wouldHaveCost.length
    ? data.wouldHaveCost.reduce((a, b) => (a.batchCost <= b.batchCost ? a : b))
    : null

  return (
    <div className="relative h-full w-full">
      <ModelViewer
        gltf={data.gltf}
        url={data.url}
        scene={builtFor ? { dish, baseline: builtFor, live: spec } : null}
        editable={editable}
        plateRadius={data.plateRadius}
        selection={selection}
        locked={locked}
        solo={solo}
        turntable={turntable}
        snap={snap}
        guides={guides}
        brush={brush}
        onStroke={onStroke}
        lighting={spec.scene?.light ?? lighting}
        setting={spec.scene ?? null}
        textures={textures}
        cameraCommand={cameraCommand}
        snapshotCommand={snapshotCommand}
        onSnapshot={onSnapshot}
        captureCommand={captureCommand}
        onMove={onMove}
        onSelect={onSelect}
        onCapture={onCapture}
      />
      {busy ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded bg-scrim/80 px-2 py-1 text-[10px] text-brand-ink">
          updating
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
        <span className="rounded bg-scrim/70 px-2 py-1 text-[10px] text-muted backdrop-blur-sm">
          {editable ? 'drag food to move it · drag the background to orbit' : 'drag to orbit · pinch or scroll to zoom'} &middot;{' '}
          {data.parts} parts
          {making > 0 ? ` · photographing ${making} ingredient${making === 1 ? '' : 's'}…` : ''}
        </span>
        {/* Cost is for whoever is paying the bill. The consultant opens this page
            as a client and must never see per-render provider pricing. */}
        {cheapest && editable ? (
          <span className="rounded bg-scrim/70 px-2 py-1 text-right text-[10px] text-muted backdrop-blur-sm">
            real 3D: ~${cheapest.batchCost.toFixed(2)}, ~{cheapest.batchSeconds}s
            <br />
            on {cheapest.label}
          </span>
        ) : null}
      </div>
    </div>
  )
}
