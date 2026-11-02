'use client'

import { useEffect, useMemo, useState } from 'react'
import ModelViewer from '../ModelViewer'
import { useIngredientTextures } from '@/lib/client/ingredient-textures'
import { shrinkDataUrl } from '@/lib/client/resize-image'
import { buildPlatingModel } from '@/lib/model3d'
import type { Dish, PlatingSpec } from '@/lib/types'

export type SnapView = 'three-quarter' | 'top' | 'side' | 'flat-top'
export type SnapItem = { id: string; /** Identifies exactly what was drawn, so a changed plating is drawn again. */ key: string; spec: PlatingSpec; view?: SnapView }
export type Snapshot = { key: string; /** Null when the 3D view could not be drawn here. */ url: string | null }

const DEFAULT_SIZE = 560
// The first picture also pays for starting the graphics up and fetching the photographs, so it is given longer.
const STUCK_AFTER_MS = 45_000

/**
 * Draws each plating of a spread from its 3D scene, so the cards show what the editor shows: the same shapes, lighting,
 * shadows and photographic surfaces. One hidden viewer builds a model after another locally (no server round trip) and
 * takes a picture of each, in order, and calls `onSnap` as each is ready, so the cards fill in one by one.
 * It stops, and releases its graphics context, once everything is drawn.
 */
export default function SpreadSnapshots({
  dish,
  items,
  done,
  onSnap,
  size = DEFAULT_SIZE,
  outputMax = 640,
  zoom = 0.8,
}: {
  dish: Dish
  items: SnapItem[]
  done: Record<string, Snapshot>
  onSnap: (id: string, snapshot: Snapshot) => void
  /** Pixels a side of the hidden stage, before the screen's pixel ratio. */
  size?: number
  /** The longest side of the picture handed back. */
  outputMax?: number
  /** How close the camera stands, as a fraction of the usual distance. */
  zoom?: number
}) {
  // Callers may hand over a new but equal dish on every render; what matters is what is in it.
  const dishKey = JSON.stringify([dish.name, dish.components])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steady = useMemo(() => dish, [dishKey])
  const names = useMemo(() => steady.components.map((c) => c.name), [steady])
  // Photographs are only used if they already exist; drawing a card never makes one.
  const { textures, loaded } = useIngredientTextures(names, false)
  const next = items.find((i) => done[i.id]?.key !== i.key)
  const nextKey = next ? `${next.id}|${next.key}` : ''

  // The model for the plating being drawn, built here in the browser from the same engine the server uses.
  const model = useMemo(() => {
    if (!next) return null
    try {
      return buildPlatingModel(steady, next.spec)
    } catch {
      return null
    }
    // `next` is identified by nextKey: a new object with the same content must not rebuild the model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steady, nextKey])

  const [asked, setAsked] = useState<{ nonce: number; id: string; key: string } | null>(null)
  // A picture is only ever taken for the plating that is on the stage: a request made for an earlier one is let go.
  const capture = asked && next && asked.id === next.id && asked.key === next.key ? asked : null

  // A card that cannot be drawn (no graphics, a model that will not build, a stage that never settles) gives up and
  // falls back to its flat drawing, rather than holding up the rest of the spread.
  useEffect(() => {
    if (!next || !loaded) return
    const { id, key } = next
    if (!model) {
      onSnap(id, { key, url: null })
      return
    }
    const timer = setTimeout(() => onSnap(id, { key, url: null }), STUCK_AFTER_MS)
    return () => clearTimeout(timer)
    // The timer belongs to one plating; nextKey changes when it is done.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextKey, loaded, model])

  if (!next || !model || !loaded) return null

  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 -z-10 opacity-0" style={{ width: size, height: size }}>
      <ModelViewer
        gltf={model.gltf}
        plateRadius={model.plateRadius}
        scene={{ dish: steady, baseline: next.spec, live: next.spec }}
        textures={textures}
        reframe
        zoom={zoom}
        lighting={next.spec.scene?.light ?? 'studio'}
        setting={next.spec.scene ?? null}
        reframeView={next.view ?? 'three-quarter'}
        onReady={() => setAsked({ nonce: Date.now(), id: next.id, key: next.key })}
        captureCommand={capture ? { nonce: capture.nonce } : null}
        onCapture={(frame) => {
          const target = capture
          if (!target) return
          setAsked(null)
          shrinkDataUrl(frame, outputMax, 0.9)
            .then((url) => onSnap(target.id, { key: target.key, url }))
            .catch(() => onSnap(target.id, { key: target.key, url: null }))
        }}
      />
    </div>
  )
}
