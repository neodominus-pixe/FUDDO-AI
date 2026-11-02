'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Component, ComponentRole } from '@/lib/types'

const ROLES: ComponentRole[] = ['hero', 'support', 'sauce', 'garnish']
const ROLE_HINT: Record<ComponentRole, string> = {
  hero: 'The centrepiece',
  support: 'A side or starch',
  sauce: 'Puree, jus, oil',
  garnish: 'A finishing touch',
}

type Props = {
  components: Component[]
  previews: Record<string, string>
  uploading: Record<string, boolean>
  onChange: (id: string, patch: Partial<Component>) => void
  onReorder: (from: number, to: number) => void
  onRemove: (id: string) => void
  onAttach: (id: string, file: File | undefined) => void
  onDetach: (id: string) => void
}

/**
 * The stack of components, bottom first. Order matters (a burger needs its bun at the base), so it can be
 * changed three ways: drag the handle (mouse or touch), press the arrow buttons, or use the arrow keys on the
 * handle. Every control is at least 44 px so it can be hit with a thumb.
 */
export default function ComponentList({ components, previews, uploading, onChange, onReorder, onRemove, onAttach, onDetach }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  const [announce, setAnnounce] = useState('')

  function indexAt(clientY: number) {
    const items = [...(listRef.current?.children ?? [])] as HTMLElement[]
    if (!items.length) return 0
    let best = 0
    let bestDistance = Infinity
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const distance = Math.abs(clientY - (r.top + r.height / 2))
      if (distance < bestDistance) {
        best = i
        bestDistance = distance
      }
    })
    return best
  }

  function startDrag(e: PointerEvent<HTMLButtonElement>, from: number) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ from, over: from })
  }

  function moveDrag(e: PointerEvent<HTMLButtonElement>) {
    if (drag) setDrag({ ...drag, over: indexAt(e.clientY) })
  }

  function endDrag() {
    if (!drag) return
    if (drag.over !== drag.from) {
      onReorder(drag.from, drag.over)
      const name = components[drag.from]?.name || 'Component'
      setAnnounce(`${name} moved to position ${drag.over + 1} of ${components.length}.`)
    }
    setDrag(null)
  }

  function nudge(from: number, dir: -1 | 1) {
    const to = from + dir
    if (to < 0 || to >= components.length) return
    onReorder(from, to)
    setAnnounce(`${components[from].name || 'Component'} moved to position ${to + 1} of ${components.length}.`)
  }

  function onHandleKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      nudge(index, -1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      nudge(index, 1)
    }
  }

  return (
    <>
      <ul ref={listRef} className="mt-3 space-y-1.5">
        {components.map((c, i) => {
          const dragging = drag?.from === i
          const target = drag && drag.over === i && drag.from !== i
          const label = c.name || 'component'
          return (
            <li
              key={c.id}
              className={`rounded-lg border bg-raised px-1.5 py-1 transition-shadow ${
                dragging ? 'opacity-60 shadow-lg' : ''
              } ${target ? (drag!.from < i ? 'border-b-2 border-b-brand border-rule' : 'border-t-2 border-t-brand border-rule') : 'border-rule'}`}
            >
              <div className="flex items-center gap-0.5 sm:gap-1">
                <button
                  type="button"
                  onPointerDown={(e) => startDrag(e, i)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => onHandleKey(e, i)}
                  // touch-action: none lets a finger drag the row instead of scrolling the page.
                  style={{ touchAction: 'none' }}
                  className={`flex min-h-11 min-w-6 shrink-0 select-none items-center justify-center rounded text-faint hover:text-ink focus-visible:text-ink ${
                    dragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  aria-label={`Reorder ${label}. Drag, or use the up and down arrow keys.`}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                >
                  <svg width="10" height="16" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
                    <circle cx="3" cy="3" r="1.6" />
                    <circle cx="9" cy="3" r="1.6" />
                    <circle cx="3" cy="9" r="1.6" />
                    <circle cx="9" cy="9" r="1.6" />
                    <circle cx="3" cy="15" r="1.6" />
                    <circle cx="9" cy="15" r="1.6" />
                  </svg>
                </button>
                <input
                  value={c.name}
                  onChange={(e) => onChange(c.id, { name: e.target.value })}
                  placeholder="Component name"
                  maxLength={80}
                  aria-label={`Component ${i + 1} name`}
                  className="field min-w-0 flex-1 px-2 text-base md:text-sm"
                />
                <select
                  value={c.role}
                  onChange={(e) => onChange(c.id, { role: e.target.value as ComponentRole })}
                  aria-label={`Role of ${label}`}
                  title={ROLE_HINT[c.role]}
                  className="field min-h-11 w-[6rem] shrink-0 px-1 text-sm sm:w-[6.5rem] sm:px-2 py-1 text-base md:text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {previews[c.id] ? (
                  <button
                    type="button"
                    onClick={() => onDetach(c.id)}
                    title="Remove photo"
                    aria-label={`Remove photo of ${label}${uploading[c.id] ? ' (uploading)' : ''}`}
                    className={`group relative grid h-11 w-9 shrink-0 sm:w-11 place-items-center overflow-hidden rounded ${uploading[c.id] ? 'animate-pulse' : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[c.id]} alt="" className="h-9 w-9 rounded object-cover" />
                    <span className="absolute inset-0 hidden place-items-center bg-black/55 text-lg text-white group-hover:grid group-focus-visible:grid" aria-hidden="true">
                      &times;
                    </span>
                  </button>
                ) : (
                  <label
                    title="Add a photo of this component"
                    className="grid h-11 w-9 shrink-0 cursor-pointer sm:w-11 place-items-center rounded text-faint hover:text-brand focus-within:outline focus-within:outline-2 focus-within:outline-offset-2"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                      <circle cx="12" cy="13" r="3.2" />
                    </svg>
                    <span className="sr-only">Add photo of {label}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        onAttach(c.id, e.target.files?.[0])
                        e.target.value = '' // picking the same file again should still fire
                      }}
                    />
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  className="flex min-h-11 min-w-8 shrink-0 items-center justify-center rounded text-lg text-faint transition-colors hover:text-danger"
                  aria-label={`Remove ${label}`}
                >
                  &times;
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </>
  )
}
