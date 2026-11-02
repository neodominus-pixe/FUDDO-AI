'use client'

import type { BrushStroke } from '@/lib/types'

// The sauce brush's controls: switch it on, pick how wide it paints, and see (and remove) what has been painted. A
// stroke is sauce in addition to the sauce style, so this works on a pooled plate, a drizzled one, or none at all.

export const BRUSH_WIDTHS: Array<[number, string]> = [
  [0.6, 'Fine'],
  [1, 'Medium'],
  [1.8, 'Broad'],
]

export default function BrushBar({
  on,
  onToggle,
  width,
  onWidth,
  strokes,
  onRemove,
  onClear,
  canPaint,
  where,
  selected,
  onSelect,
}: {
  on: boolean
  onToggle: () => void
  width: number
  onWidth: (w: number) => void
  strokes: BrushStroke[]
  onRemove: (index: number) => void
  onClear: () => void
  /** False where painting is not possible, e.g. a 2D view that is not looking straight down. */
  canPaint: boolean
  where: '2d' | '3d'
  /** Which strokes are selected, by their place in the list. */
  selected: number[]
  onSelect: (index: number, additive: boolean) => void
}) {
  return (
    <div className="mb-3 space-y-2" aria-label="Sauce brush">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={on}
          data-active={on}
          className="segmented flex min-h-11 items-center gap-1.5 px-3 text-xs data-[active=true]:bg-brand data-[active=true]:text-on-brand"
          title="Paint sauce with the brush"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20c0-3 2-4 4-4 1 0 2 .6 2 2 0 2-2 2-6 2zM9 15l9-9a2 2 0 013 3l-9 9" />
          </svg>
          Sauce brush
        </button>

        {on ? (
          <div className="segmented" role="group" aria-label="Brush width">
            {BRUSH_WIDTHS.map(([w, label]) => (
              <button key={w} type="button" data-active={Math.abs(width - w) < 0.01} className="min-h-11" onClick={() => onWidth(w)}>
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {strokes.length ? (
          <button type="button" onClick={onClear} className="link-brand min-h-11 text-xs">
            Clear {strokes.length} stroke{strokes.length === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>

      {on ? (
        <p className="text-xs text-muted" role="status">
          {canPaint
            ? where === '3d'
              ? 'Drag across the plate to paint a stroke of sauce. Hold Alt and drag to turn the view instead.'
              : 'Drag across the plate to paint a stroke of sauce.'
            : 'Painting needs the Top-down view. Switch to it to draw.'}
        </p>
      ) : null}

      {strokes.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Painted strokes">
          {strokes.map((s, i) => (
            <li key={i} data-selected={selected.includes(i)} className={`flex items-center rounded border text-xs ${selected.includes(i) ? 'border-brand bg-brand/15' : 'border-rule bg-sunken'}`}>
              <button type="button" className="min-h-8 px-2" aria-pressed={selected.includes(i)} title="Select this stroke, then drag it on the plate or use the arrow keys" onClick={(e) => onSelect(i, e.shiftKey || e.metaKey || e.ctrlKey)}>
                Stroke {i + 1} · {BRUSH_WIDTHS.reduce((best, w) => (Math.abs(w[0] - s.w) < Math.abs(best[0] - s.w) ? w : best))[1].toLowerCase()}
              </button>
              <button type="button" onClick={() => onRemove(i)} className="grid h-8 w-8 place-items-center text-faint hover:text-danger" aria-label={`Remove stroke ${i + 1}`}>
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
