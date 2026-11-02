'use client'

import { useMemo, useState } from 'react'
import { alignSpots, arrayPositions, distributeSpots, fromCm, gapCm, mirrorSpots, toCm, type AlignEdge, type ArrayPattern, type Placed, type Spot } from '@/lib/scene/arrange'
import { clampToPlate, computePoses, toFrame } from '@/lib/scene/poses'
import { strokeIndex, translateStrokes } from '@/lib/scene/strokes'
import { SAUCE_KEY, type Dish, type PlatingSpec } from '@/lib/types'

// The 3D editor's tools: an outliner of everything on the plate, exact position fields, and the arrange commands
// (align, distribute, mirror, repeat). Every command is a pure change to the spec, so each is one undo step, and
// it is saved, shared and rebuilt like any other edit.

const FRAME_MIN = 0.06
const FRAME_MAX = 0.94
const clampFrame = (n: number) => Math.min(FRAME_MAX, Math.max(FRAME_MIN, n))

const ALIGN: Array<[AlignEdge, string, string]> = [
  ['left', '⇤', 'Align left edges'],
  ['centerX', '↔', 'Centre across'],
  ['right', '⇥', 'Align right edges'],
  ['back', '⇡', 'Align back edges'],
  ['centerZ', '↕', 'Centre front to back'],
  ['front', '⇣', 'Align front edges'],
]

const PATTERNS: Array<[ArrayPattern, string]> = [
  ['line', 'In a line'],
  ['arc', 'In a fan'],
  ['circle', 'Round the plate'],
]

type Row = { key: string; name: string; role: string; hidden: boolean }

export type StudioToolsProps = {
  dish: Dish
  spec: PlatingSpec
  /** Every selected key; the last one is the one the position fields edit. */
  selection: string[]
  locked: string[]
  solo: string | null
  onSelect: (key: string | null, additive: boolean) => void
  onToggleLock: (key: string) => void
  onSolo: (key: string | null) => void
  onSetHidden: (key: string, hidden: boolean) => void
  /** Applies a changed spec as one undo step. */
  onApply: (next: PlatingSpec) => void
}

export default function StudioTools({ dish, spec, selection, locked, solo, onSelect, onToggleLock, onSolo, onSetHidden, onApply }: StudioToolsProps) {
  const scene = useMemo(() => computePoses(dish, spec), [dish, spec])
  const [pattern, setPattern] = useState<ArrayPattern>('line')
  const [count, setCount] = useState(3)
  const [angle, setAngle] = useState(0)

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const sauceName = dish.components.find((c) => c.role === 'sauce')?.name
    for (const [key, meta] of scene.meta) out.push({ key, name: meta.name, role: meta.role, hidden: false })
    for (const [key, t] of Object.entries(spec.tweaks ?? {})) {
      // A key already listed as on the plate is not also listed as taken off it.
      if (!t.hidden || key === SAUCE_KEY || scene.meta.has(key)) continue
      const component = dish.components.find((c) => c.id === key.split(':')[0])
      if (component) out.push({ key, name: component.name, role: component.role, hidden: true })
    }
    if (sauceName && scene.sauce) out.push({ key: SAUCE_KEY, name: sauceName, role: 'sauce', hidden: false })
    // Painted strokes are pieces of their own, listed after everything else.
    for (const b of scene.brush) out.push({ key: b.key, name: `Sauce stroke ${b.index + 1}`, role: 'sauce', hidden: false })
    return out
  }, [scene, spec.tweaks, dish.components])

  const primary = selection[selection.length - 1] ?? null
  const spotOf = (key: string): Spot | null => {
    const p = scene.poses.get(key)
    if (p) return { key, x: p.x, z: p.z, r: Math.max(p.sx, p.sz) }
    if (key === SAUCE_KEY && scene.sauce) return { key, x: scene.sauce.x, z: scene.sauce.z, r: 0.25 }
    const stroke = scene.brush.find((b) => b.key === key)
    if (stroke) return { key, x: stroke.x, z: stroke.z, r: 0.2 }
    return null
  }
  const spots = selection.map(spotOf).filter((s): s is Spot => s !== null && !locked.includes(s.key))
  const R = scene.radius

  // Writes new positions (scene units) onto the spec as drag nudges, kept on the plate.
  function place(next: Placed, extra: Partial<PlatingSpec> = {}) {
    const overrides = { ...spec.overrides }
    const carried: Array<{ index: number; dx: number; dy: number }> = []
    for (const [key, at] of Object.entries(next)) {
      const [x, z] = clampToPlate(at.x, at.z, scene.plate, scene.shape)
      const sk = strokeIndex(key)
      if (sk !== null) {
        // A painted stroke is carried by how far its middle has to travel.
        const now = scene.brush.find((b) => b.index === sk)
        if (now) carried.push({ index: sk, dx: (x - now.x) * R, dy: (z - now.z) * R })
        continue
      }
      const lift = spec.overrides?.[key]?.e
      overrides[key] = { x: clampFrame(toFrame(x, R)), y: clampFrame(toFrame(z, R)), ...(lift ? { e: lift } : {}) }
    }
    onApply({ ...spec, ...extra, overrides, brush: spec.brush ? translateStrokes(spec.brush, carried) : spec.brush })
  }

  const primarySpot = primary ? spotOf(primary) : null
  const primaryPose = primary ? scene.poses.get(primary) : undefined
  const liftCm = primary ? toCm(spec.overrides?.[primary]?.e ?? 0, scene.plate) : 0

  const second = selection.length === 2 ? [spotOf(selection[0]), spotOf(selection[1])] : null
  const between = second && second[0] && second[1] ? gapCm(second[0], second[1], scene.plate) : null

  const component = primary && primary !== SAUCE_KEY ? dish.components.find((c) => c.id === primary.split(':')[0]) : undefined
  const canRepeat = !!component && component.role !== 'garnish' && !!primarySpot && !primary?.includes(':g')

  function repeat() {
    if (!component || !primarySpot) return
    const spots = arrayPositions(pattern, count, { x: primarySpot.x, z: primarySpot.z }, { angleDeg: angle, spacing: Math.max(0.2, primarySpot.r * 1.6) })
    const next: Placed = {}
    spots.forEach((p, i) => (next[`${component.id}:${i}`] = p))
    // Copies are the extra helpings of a component; the first one is the component itself.
    place(next, { copies: { ...(spec.copies ?? {}), [component.id]: spots.length - 1 } })
  }

  function setNumber(axis: 'x' | 'z', cm: number) {
    if (!primary || !primarySpot || !Number.isFinite(cm)) return
    const v = fromCm(cm, scene.plate)
    place({ [primary]: { x: axis === 'x' ? v : primarySpot.x, z: axis === 'z' ? v : primarySpot.z } })
  }

  function setLift(cm: number) {
    if (!primary || !primaryPose || !Number.isFinite(cm)) return
    const e = Math.min(3, Math.max(0, fromCm(cm, scene.plate)))
    const at = spec.overrides?.[primary] ?? { x: toFrame(primaryPose.x, R), y: toFrame(primaryPose.z, R) }
    const { e: _old, ...rest } = at
    void _old
    onApply({ ...spec, overrides: { ...spec.overrides, [primary]: e > 0.0001 ? { ...rest, e } : rest } })
  }

  const field = 'field w-full px-2 py-1 text-sm numeric'

  return (
    <div className="space-y-4">
      <div className="surface p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="eyebrow">On the plate</h3>
          <span className="text-xs text-muted">{rows.filter((r) => !r.hidden).length} pieces</span>
        </div>
        <ul className="mt-2 space-y-0.5" aria-label="Pieces on the plate">
          {rows.map((r) => {
            const isSel = selection.includes(r.key)
            const isLocked = locked.includes(r.key)
            return (
              <li
                key={r.key}
                data-selected={isSel}
                className={`group flex items-center gap-1 rounded px-1 ${isSel ? 'bg-brand/15' : 'hover:bg-sunken'} ${r.hidden ? 'opacity-50' : ''}`}
              >
                <button
                  type="button"
                  onClick={(e) => onSelect(r.key, e.shiftKey || e.metaKey || e.ctrlKey)}
                  disabled={r.hidden}
                  aria-pressed={isSel}
                  className="min-h-10 min-w-0 flex-1 truncate text-left text-sm"
                  title={`${r.name} (${r.role})`}
                >
                  {r.name}
                  <span className="ml-1.5 text-xs text-faint">{r.role}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetHidden(r.key, !r.hidden)}
                  disabled={r.key === SAUCE_KEY}
                  className="grid h-10 w-9 place-items-center text-sm text-muted hover:text-ink disabled:opacity-20"
                  aria-label={strokeIndex(r.key) !== null ? `Remove ${r.name}` : r.hidden ? `Put ${r.name} back on the plate` : `Take ${r.name} off the plate`}
                  title={strokeIndex(r.key) !== null ? 'Remove stroke' : r.hidden ? 'Put back' : 'Take off'}
                >
                  <Icon d={r.hidden ? 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM4 4l16 16' : 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z'} />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLock(r.key)}
                  disabled={r.hidden}
                  className={`grid h-10 w-9 place-items-center text-sm hover:text-ink disabled:opacity-20 ${isLocked ? 'text-brand' : 'text-muted'}`}
                  aria-pressed={isLocked}
                  aria-label={isLocked ? `Unlock ${r.name}` : `Lock ${r.name} in place`}
                  title={isLocked ? 'Unlock' : 'Lock in place'}
                >
                  <Icon d={isLocked ? 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z' : 'M7 11V8a5 5 0 019.5-2M6 11h12v9H6z'} />
                </button>
                <button
                  type="button"
                  onClick={() => onSolo(solo === r.key ? null : r.key)}
                  disabled={r.hidden}
                  className={`grid h-10 w-9 place-items-center text-xs hover:text-ink disabled:opacity-20 ${solo === r.key ? 'text-brand' : 'text-muted'}`}
                  aria-pressed={solo === r.key}
                  aria-label={solo === r.key ? 'Show everything again' : `Show ${r.name} alone`}
                  title={solo === r.key ? 'Show all' : 'Show alone'}
                >
                  <Icon d="M12 4a8 8 0 100 16 8 8 0 000-16zM12 9a3 3 0 100 6 3 3 0 000-6z" />
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">Shift-click to select several. Locked pieces can be selected but not dragged.</p>
      </div>

      {primarySpot ? (
        <div className="surface space-y-3 p-4">
          <h3 className="eyebrow">Position</h3>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Across (cm)</span>
              <NumberField key={`x-${primary}-${primarySpot.x.toFixed(3)}`} className={field} value={toCm(primarySpot.x, scene.plate)} onCommit={(v) => setNumber('x', v)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Depth (cm)</span>
              <NumberField key={`z-${primary}-${primarySpot.z.toFixed(3)}`} className={field} value={toCm(primarySpot.z, scene.plate)} onCommit={(v) => setNumber('z', v)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Lift (cm)</span>
              <NumberField key={`e-${primary}-${liftCm.toFixed(2)}`} className={field} value={liftCm} min={0} onCommit={setLift} disabled={!primaryPose} />
            </label>
          </div>
          <p className="text-xs text-muted">
            {toCm(Math.hypot(primarySpot.x, primarySpot.z), scene.plate).toFixed(1)} cm from the centre of the plate
            {between !== null ? ` · ${between.toFixed(1)} cm between the two selected` : ''}
          </p>
        </div>
      ) : null}

      {spots.length >= 2 ? (
        <div className="surface space-y-3 p-4">
          <h3 className="eyebrow">Arrange {spots.length} pieces</h3>
          <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Align">
            {ALIGN.map(([edge, glyph, label]) => (
              <button key={edge} type="button" className="btn btn-secondary btn-sm min-h-10 px-0" title={label} aria-label={label} onClick={() => place(alignSpots(spots, edge))}>
                {glyph}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-secondary btn-sm min-h-10" disabled={spots.length < 3} title="Equal gaps from left to right" onClick={() => place(distributeSpots(spots, 'x'))}>
              Space across
            </button>
            <button type="button" className="btn btn-secondary btn-sm min-h-10" disabled={spots.length < 3} title="Equal gaps from back to front" onClick={() => place(distributeSpots(spots, 'z'))}>
              Space front to back
            </button>
          </div>
        </div>
      ) : null}

      {spots.length >= 1 ? (
        <div className="surface space-y-3 p-4">
          <h3 className="eyebrow">Mirror and repeat</h3>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-secondary btn-sm min-h-10" onClick={() => place(mirrorSpots(spots, 'x'))} title="Swap left and right across the middle of the plate">
              Flip left–right
            </button>
            <button type="button" className="btn btn-secondary btn-sm min-h-10" onClick={() => place(mirrorSpots(spots, 'z'))} title="Swap front and back across the middle of the plate">
              Flip front–back
            </button>
          </div>
          {canRepeat ? (
            <div className="space-y-2 border-t border-rule pt-3">
              <p className="text-xs text-muted">Repeat {component?.name.toLowerCase()}</p>
              <div className="grid grid-cols-2 gap-2">
                <select value={pattern} onChange={(e) => setPattern(e.target.value as ArrayPattern)} aria-label="Pattern" className="field min-h-10 text-sm">
                  {PATTERNS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many in all" className="field min-h-10 text-sm">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} in all
                    </option>
                  ))}
                </select>
              </div>
              {pattern !== 'circle' ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">{pattern === 'line' ? `Direction ${angle}°` : `Spread ${Math.max(20, angle)}°`}</span>
                  <input type="range" min={pattern === 'line' ? 0 : 20} max={pattern === 'line' ? 355 : 170} step={5} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full accent-[var(--color-gold)]" />
                </label>
              ) : null}
              <button type="button" className="btn btn-secondary btn-sm min-h-10 w-full" onClick={repeat}>
                Repeat
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// A number box that only commits when it loses focus or Enter is pressed, so typing "12.5" does not move the piece
// to 1, then 12, then 12.5. Remounted (by key) whenever the value changes from outside, e.g. by a drag.
function NumberField({ value, onCommit, className, min, disabled }: { value: number; onCommit: (v: number) => void; className: string; min?: number; disabled?: boolean }) {
  const [text, setText] = useState(value.toFixed(1))
  const commit = () => {
    const n = Number(text)
    if (!Number.isFinite(n)) return setText(value.toFixed(1))
    const v = min !== undefined ? Math.max(min, n) : n
    if (Math.abs(v - value) > 0.04) onCommit(v)
    setText(v.toFixed(1))
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      step={0.1}
      min={min}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        // Typing arrows in the box must not nudge the selected piece on the plate.
        if (e.key.startsWith('Arrow')) e.stopPropagation()
      }}
      className={className}
    />
  )
}
