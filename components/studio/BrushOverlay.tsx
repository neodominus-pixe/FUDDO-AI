'use client'

import { useRef, useState, type PointerEvent } from 'react'
import { MAX_STROKE_POINTS, pathLength, simplify, type Pt } from '@/lib/engine/layout/brush'

// The 2D version of the brush: a transparent sheet laid over the top-down picture that turns a drag into a stroke of
// sauce, in the same 0..1 frame coordinates the picture is laid out in. Shows the line as it is drawn.
export default function BrushOverlay({ onStroke }: { onStroke: (points: Array<[number, number]>) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pts, setPts] = useState<Pt[]>([])
  const drawing = useRef(false)

  const at = (e: PointerEvent): Pt | null => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || !r.width || !r.height) return null
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return
    const p = at(e)
    if (!p) return
    // Capture keeps the stroke going if the pointer slips off the picture. If the device will not give it, paint anyway.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* not capturable */
    }
    drawing.current = true
    setPts([p])
  }

  function move(e: PointerEvent) {
    if (!drawing.current) return
    const p = at(e)
    if (!p) return
    setPts((prev) => {
      const last = prev[prev.length - 1]
      // Only once the brush has really moved, so a slow hand does not pile points up.
      return last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.006 ? prev : [...prev, p]
    })
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    const done = pts
    setPts([])
    // A tap or a flick that goes nowhere is not a stroke.
    if (done.length < 3 || pathLength(done) < 0.06) return
    const kept = simplify(done, 0.004).slice(0, MAX_STROKE_POINTS)
    onStroke(kept.map(([x, y]) => [Math.min(0.94, Math.max(0.06, x)), Math.min(0.94, Math.max(0.06, y))] as [number, number]))
  }

  return (
    <div
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drawing.current = false
        setPts([])
      }}
      className="absolute inset-0 z-20 cursor-crosshair touch-none"
      aria-label="Sauce brush canvas: drag to paint"
      role="application"
    >
      {pts.length > 1 ? (
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none h-full w-full" aria-hidden="true">
          <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#ffb066" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
    </div>
  )
}
