'use client'

import { useMemo, useState } from 'react'
import PlatingImage from '../PlatingImage'
import type { ClientRender } from '../RefineView'
import SpreadSnapshots, { type Snapshot, type SnapView } from './SpreadSnapshots'
import type { Angle, Dish, PlatingSpec } from '@/lib/types'

const VIEW: Record<Angle, SnapView> = { 'top-down': 'flat-top', 'three-quarter': 'three-quarter', side: 'side' }

/**
 * The 2D view of a plating: a still picture of its 3D scene from one fixed angle. Top-down is a straight-overhead view
 * whose edges are exactly the plating's own frame, so the drag handles and the brush laid over it line up with what is
 * drawn. It is redrawn whenever the plating or the angle changes; until the new picture is ready the last one stays up,
 * so editing never flashes. The flat vector drawing is only the fallback for a browser that cannot draw 3D.
 */
export default function Plating2D({
  dish,
  spec,
  angle,
  render,
  className,
  alt,
}: {
  dish: Dish
  spec: PlatingSpec
  angle: Angle
  render: ClientRender
  className?: string
  alt: string
}) {
  const view = VIEW[angle]
  const key = JSON.stringify([spec, view])
  const items = useMemo(() => [{ id: 'still', key, spec, view }], [key, spec, view])
  const [snap, setSnap] = useState<Snapshot | undefined>()
  // The last picture that did draw, kept on screen while the next one is being made.
  const [last, setLast] = useState<string | null>(null)

  // A real photograph from a paid provider, when there is one, is better than anything drawn here.
  if (render.imageUrl) return <PlatingImage svg={render.svg} imageUrl={render.imageUrl} className={className ?? ''} alt={alt} />

  const current = snap?.key === key
  const failed = current && !snap.url
  const url = current && snap.url ? snap.url : last

  return (
    <>
      <SpreadSnapshots
        dish={dish}
        items={items}
        done={snap ? { still: snap } : {}}
        size={760}
        outputMax={1100}
        zoom={1}
        onSnap={(_id, next) => {
          setSnap(next)
          if (next.url) setLast(next.url)
        }}
      />
      {failed ? (
        <PlatingImage svg={render.svg} imageUrl={null} className={className ?? ''} alt={alt} />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className={`${className ?? ''} object-cover ${current ? '' : 'opacity-80'}`} draggable={false} />
      ) : (
        <div className={`${className ?? ''} animate-pulse`} role="img" aria-label={`${alt}, drawing`} />
      )}
    </>
  )
}
