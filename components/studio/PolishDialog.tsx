'use client'

import { useEffect, useRef, useState } from 'react'

export type PolishState =
  | { status: 'working'; before: string }
  | { status: 'done'; before: string; after: string; polished: boolean }
  | { status: 'error'; before: string; message: string }

// The polished photograph next to the 3D frame it was made from, with a way to keep it. Honest about what it is:
// the arrangement is the chef's, the finish is the image model's.
export default function PolishDialog({ state, name, onClose }: { state: PolishState; name: string; onClose: () => void }) {
  const [showBefore, setShowBefore] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const shown = state.status === 'done' && !showBefore ? state.after : state.before
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plating'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Polished render" onClick={onClose}>
      <div className="surface max-h-full w-full max-w-2xl overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="display text-lg">{name}</h2>
            <p className="text-xs text-muted">
              {state.status === 'working'
                ? 'Dressing your plating as a photograph. This takes a few seconds.'
                : state.status === 'error'
                  ? 'The photograph could not be made.'
                  : state.polished
                    ? 'Your arrangement, finished as a photograph. Nothing was moved.'
                    : 'Photographic rendering is coming soon. For now this is your 3D view as it is.'}
            </p>
          </div>
          <button ref={closeRef} type="button" className="btn btn-secondary btn-sm min-h-10" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="relative mt-3 aspect-square w-full overflow-hidden rounded border border-rule bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt={state.status === 'done' && !showBefore ? `Photographic render of ${name}` : `3D view of ${name}`} className="h-full w-full object-contain" />
          {state.status === 'working' ? (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-sm text-white" role="status" aria-busy="true">
              <span className="animate-pulse">Rendering…</span>
            </div>
          ) : null}
        </div>

        {state.status === 'error' ? (
          <p className="notice-error mt-3 p-2.5 text-xs" role="alert">
            {state.message}
          </p>
        ) : null}

        {state.status === 'done' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {state.polished ? (
              <button type="button" className="btn btn-secondary btn-sm min-h-10" onClick={() => setShowBefore((v) => !v)} aria-pressed={showBefore}>
                {showBefore ? 'Show the photograph' : 'Compare with the 3D view'}
              </button>
            ) : null}
            <a className="btn btn-primary btn-sm min-h-10" href={state.after} download={`${slug}-${state.polished ? 'photo' : '3d'}.${state.after.startsWith('data:image/png') ? 'png' : 'jpg'}`}>
              Download
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}
