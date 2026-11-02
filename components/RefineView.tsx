'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { shrinkDataUrl } from '@/lib/client/resize-image'
import { computePoses, toFrame } from '@/lib/scene/poses'
import { strokeIndex, strokeKey, translateStroke, translateStrokes, withoutStroke } from '@/lib/scene/strokes'
import PolishDialog, { type PolishState } from './studio/PolishDialog'
import BrushBar from './studio/BrushBar'
import BrushOverlay from './studio/BrushOverlay'
import { MAX_STROKES } from '@/lib/engine/layout/brush'
import StudioTools from './studio/StudioTools'
import SceneBar from './studio/SceneBar'
import PlatingModel from './PlatingModel'
import type { CameraCommand, CameraPose, CameraView } from './ModelViewer'
import { SHAPE_ORDER } from '@/lib/shapes'
import Plating2D from './studio/Plating2D'
import type { PlacedElement } from '@/lib/layout'
import { SAUCE_KEY } from '@/lib/types'
import type {
  Angle,
  Component,
  ComponentRole,
  ElementTweak,
  Composition,
  Dish,
  GarnishDensity,
  Height,
  PlateStyle,
  PlatingSpec,
  SauceStyle,
} from '@/lib/types'

export type ClientRender = {
  id: string
  specId: string
  spec: PlatingSpec
  svg: string | null
  imageUrl: string | null
  prompt: string
  costUsd: number
  provider: string
  // The render payload carries each element's resolved colour and any per-element
  // tweak, so the inspector can seed its controls without recomputing anything.
  elements: Array<PlacedElement & { color: string; tweak: ElementTweak }>
  plateRadius: number
  angle: Angle
  name?: string
}

const CAMERA_VIEWS: Array<[CameraView, string]> = [
  ['top', 'Top'],
  ['three-quarter', '3/4'],
  ['side', 'Side'],
]

const ANGLES: Angle[] = ['top-down', 'three-quarter', 'side']
const ANGLE_LABEL: Record<Angle, string> = {
  'top-down': 'Top-down',
  'three-quarter': '3/4',
  side: 'Side',
}

const ADD_ROLES: ComponentRole[] = ['garnish', 'support', 'hero', 'sauce']

const COMPOSITIONS: Composition[] = [
  'centered',
  'stacked-tall',
  'off-center',
  'linear',
  'scattered',
  'negative-space',
]
const PLATES: PlateStyle[] = [
  'round-white',
  'black-slate',
  'square-white',
  'deep-bowl',
  'shallow-bowl',
  'wooden-board',
  'coupe-grey',
]
const SAUCES: SauceStyle[] = ['pooled', 'dotted', 'drizzled', 'smeared', 'aside', 'none']
const HEIGHTS: Height[] = ['flat', 'low', 'medium', 'tall']
const GARNISHES: GarnishDensity[] = ['minimal', 'moderate', 'generous']


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

const label = (s: string) => s.replace(/-/g, ' ')
const clamp = (n: number) => Math.min(0.94, Math.max(0.06, n))

export default function RefineView({
  dish,
  initial,
  onBack,
  onSpend,
  onSpecCommit,
  onRendered,
  onAddComponent,
}: {
  dish: Dish
  initial: ClientRender
  onBack: () => void
  onSpend: (usd: number, wouldHaveCost?: Array<{ id: string; label: string; batchCost: number }>) => void
  onSpecCommit?: (spec: PlatingSpec) => void
  onRendered?: (render: ClientRender) => void
  onAddComponent?: (component: Component) => void
}) {
  const [spec, setSpec] = useState<PlatingSpec>(initial.spec)
  const [render, setRender] = useState<ClientRender>(initial)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ key: string; x: number; y: number } | null>(null)
  const [renderCount, setRenderCount] = useState(0)
  const [view, setView] = useState<'2d' | '3d'>('3d')
  const [angle, setAngle] = useState<Angle>(initial.angle ?? 'three-quarter')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Further pieces selected along with it (shift-click). The last one chosen is `selectedKey`, which the panels edit.
  const [extraKeys, setExtraKeys] = useState<string[]>([])
  const [lockedKeys, setLockedKeys] = useState<string[]>([])
  const [soloKey, setSoloKey] = useState<string | null>(null)
  // A chef looking at a plating thinks "this needs a herb". Before this, that
  // meant going back to the dish, adding it, and generating a fresh spread --
  // losing the plating they were looking at.
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<ComponentRole>('garnish')
  // Sliders update a local draft while dragging and commit on release, so one
  // slider sweep is not thirty re-renders of the whole model.
  const [draft, setDraft] = useState<ElementTweak | null>(null)
  const [turntable, setTurntable] = useState(false)
  const [snap, setSnap] = useState(true)
  // Sauce brush: on or off, and how wide it paints. The strokes themselves are on the spec (`spec.brush`).
  const [brushOn, setBrushOn] = useState(false)
  const [brushWidth, setBrushWidth] = useState(1)
  const [guides, setGuides] = useState(false)
  // A nonce so clicking the same preset twice still snaps back to it.
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null)
  // Up to three saved viewpoints. Click an empty one to save where the camera is now; click a saved one to go back
  // to it; hold Shift and click to forget it.
  const [bookmarks, setBookmarks] = useState<Array<CameraPose | null>>([null, null, null])
  const [snapshotCommand, setSnapshotCommand] = useState<{ nonce: number; slot: number } | null>(null)
  const [captureCommand, setCaptureCommand] = useState<{ nonce: number; purpose: 'png' | 'polish' } | null>(null)
  const [polish, setPolish] = useState<PolishState | null>(null)
  // Every committed edit pushes the previous spec here. Sliders commit on
  // release, so one sweep is one undo step rather than thirty.
  const [past, setPast] = useState<PlatingSpec[]>([])
  const [future, setFuture] = useState<PlatingSpec[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  // The mock renderer is free, so refinement can be live. A billable provider
  // must not fire on every dropdown twitch -- there, changes stage until asked.
  const isFree = render.provider === 'mock'

  async function rerender(next: PlatingSpec, nextAngle: Angle = angle) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish, spec: next, angle: nextAngle }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Re-render failed.')
      setRender(data.render)
      setDirty(false)
      setRenderCount((n) => n + 1)
      onSpend(data.render.costUsd, data.wouldHaveCost)
      onRendered?.({ ...data.render, name: initial.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // Applies a spec without touching history -- used by undo and redo themselves,
  // or they would push their own moves back onto the stack.
  function applyWithoutHistory(next: PlatingSpec) {
    setSpec(next)
    onSpecCommit?.(next)
    if (isFree) void rerender(next)
    else setDirty(true)
  }

  // The dish is a prop: when an ingredient is added upstream it arrives as a new
  // object, and the plating on screen is now out of date.
  const componentCount = dish.components.length
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    // Deliberately reacts to a prop change by starting a render, which sets state; there is no event to hang it on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isFree) void rerender(spec)
    else setDirty(true)
    // Only the roster matters here; renaming a component re-renders through the
    // usual spec path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentCount])

  function addComponent() {
    const name = newName.trim()
    if (!name || !onAddComponent) return
    onAddComponent({ id: `c-${Date.now().toString(36)}`, name, role: newRole, imagePath: null })
    setNewName('')
  }

  function applySpec(next: PlatingSpec) {
    setPast((p) => [...p.slice(-49), spec])
    setFuture([])
    applyWithoutHistory(next)
  }

  function undo() {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast(past.slice(0, -1))
    setFuture((f) => [spec, ...f.slice(0, 49)])
    applyWithoutHistory(previous)
  }

  function redo() {
    const next = future[0]
    if (!next) return
    setFuture(future.slice(1))
    setPast((p) => [...p.slice(-49), spec])
    applyWithoutHistory(next)
  }

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, skipped while typing in the notes field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const el = document.activeElement
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Arrow keys nudge the selected component, for placement finer than a drag.
  useEffect(() => {
    const STEP: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return
      const picked = selection.map(strokeIndex).filter((i): i is number => i !== null)
      if (!selectedEl && !picked.length) return
      // Delete takes painted strokes off the plate, the highest first so the numbering stays right.
      if ((e.key === 'Delete' || e.key === 'Backspace') && picked.length) {
        e.preventDefault()
        let next: PlatingSpec = spec
        for (const i of [...picked].sort((a, b) => b - a)) next = withoutStroke(next, i)
        forgetStrokeKeys()
        applySpec(next)
        return
      }
      if (!selectedEl && !STEP[e.key]) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        setSelectedKey(null)
        commitTweak({ hidden: true })
        return
      }
      const dir = STEP[e.key]
      if (!dir) return
      e.preventDefault()
      // A fine step by default, a coarse one with Shift held.
      const step = (e.shiftKey ? 0.04 : 0.01) * (render.plateRadius / 0.4)
      // Everything selected moves together, except pieces that are locked.
      const keys = selection.filter((k) => !lockedKeys.includes(k))
      if (!keys.length) return
      const poses = computePoses(dish, spec)
      const overrides = { ...spec.overrides }
      let brush = spec.brush
      for (const k of keys) {
        const sk = strokeIndex(k)
        if (sk !== null) {
          if (brush) brush = translateStroke(brush, sk, dir[0] * step, dir[1] * step)
          continue
        }
        const pose = k === SAUCE_KEY ? poses.sauce : poses.poses.get(k)
        const at = overrides[k] ?? (pose ? { x: toFrame(pose.x, poses.radius), y: toFrame(pose.z, poses.radius) } : null)
        if (!at) continue
        overrides[k] = {
          x: clamp(at.x + dir[0] * step),
          y: clamp(at.y + dir[1] * step),
          ...(overrides[k]?.e ? { e: overrides[k].e } : {}),
        }
      }
      applySpec({ ...spec, overrides, brush })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Sends the current 3D frame, shrunk, to be dressed as a photograph, and shows what comes back.
  async function polishFrame(frame: string) {
    setPolish({ status: 'working', before: frame })
    try {
      const small = await shrinkDataUrl(frame, 1024)
      const res = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: small, dishName: dish.name, components: dish.components.map((c) => c.name).filter(Boolean) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'The photograph could not be made.')
      setPolish({ status: 'done', before: frame, after: data.image, polished: Boolean(data.polished) })
    } catch (e) {
      setPolish({ status: 'error', before: frame, message: e instanceof Error ? e.message : 'The photograph could not be made.' })
    }
  }

  // A finished stroke becomes part of the spec: one undo step, saved, shared and rebuilt like any other edit.
  function addStroke(points: Array<[number, number]>) {
    const pts = points.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000] as [number, number])
    if (pts.length < 2) return
    applySpec({ ...spec, brush: [...(spec.brush ?? []), { w: brushWidth, pts }].slice(-MAX_STROKES) })
  }

  // Strokes are named by their place in the list, so taking one out renumbers the rest. Anything selected, locked or
  // shown alone by the old numbering is let go rather than left pointing at a different stroke.
  function forgetStrokeKeys() {
    if (selection.some((k) => strokeIndex(k) !== null)) {
      setSelectedKey(null)
      setExtraKeys([])
    }
    setLockedKeys((l) => l.filter((k) => strokeIndex(k) === null))
    setSoloKey((k) => (k !== null && strokeIndex(k) !== null ? null : k))
  }

  function removeStroke(index: number) {
    forgetStrokeKeys()
    applySpec(withoutStroke(spec, index))
  }

  const selection = selectedKey ? [...extraKeys.filter((k) => k !== selectedKey), selectedKey] : []

  // Click selects one piece; shift-click adds it to, or takes it out of, the selection.
  function selectPiece(key: string | null, additive: boolean) {
    setDraft(null)
    if (key === null) {
      if (!additive) {
        setSelectedKey(null)
        setExtraKeys([])
      }
      return
    }
    if (!additive) {
      setSelectedKey(key)
      setExtraKeys([])
      return
    }
    if (selection.includes(key)) {
      const rest = selection.filter((k) => k !== key)
      setSelectedKey(rest[rest.length - 1] ?? null)
      setExtraKeys(rest.slice(0, -1))
    } else {
      if (selectedKey) setExtraKeys([...extraKeys, selectedKey])
      setSelectedKey(key)
    }
  }

  // Hiding is a tweak like any other, so it is saved with the plating and is one undo step.
  function setHidden(key: string, hidden: boolean) {
    // A painted stroke has nothing to hide behind: taking it off the plate removes it.
    const stroke = strokeIndex(key)
    if (stroke !== null) {
      if (hidden) removeStroke(stroke)
      return
    }
    const current = spec.tweaks?.[key] ?? {}
    const next = { ...current, hidden: hidden ? true : undefined }
    if (!hidden) delete next.hidden
    if (hidden && selection.includes(key)) {
      setSelectedKey(null)
      setExtraKeys([])
    }
    applySpec({ ...spec, tweaks: { ...(spec.tweaks ?? {}), [key]: next } })
  }

  const set = <K extends keyof PlatingSpec>(k: K, v: PlatingSpec[K]) => applySpec({ ...spec, [k]: v })

  function onPointerDown(e: React.PointerEvent, el: PlacedElement) {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setDrag({ key: el.key, x: el.x, y: el.y })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    setDrag({ key: drag.key, x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) })
  }

  function onPointerUp() {
    if (!drag) return
    const sk = strokeIndex(drag.key)
    if (sk !== null) {
      // A painted stroke's handle: carry the stroke by how far the handle was dragged.
      const from = strokeHandles.find((h) => h.key === drag.key)
      const moved = { x: drag.x, y: drag.y }
      setDrag(null)
      if (from && spec.brush) applySpec({ ...spec, brush: translateStroke(spec.brush, sk, moved.x - from.x, moved.y - from.y) })
      return
    }
    const next: PlatingSpec = {
      ...spec,
      overrides: { ...spec.overrides, [drag.key]: { x: drag.x, y: drag.y } },
    }
    setDrag(null)
    applySpec(next)
  }

  // Where each painted stroke's middle is on the picture, for its handle in the 2D view.
  const strokeHandles = useMemo(() => {
    const scene = computePoses(dish, spec)
    return scene.brush.map((b) => ({ key: b.key, index: b.index, x: toFrame(b.x, scene.radius), y: toFrame(b.z, scene.radius) }))
  }, [dish, spec])
  const nudged = Object.keys(spec.overrides ?? {}).length
  const tweakCount = Object.keys(spec.tweaks ?? {}).length
  const hiddenCount = Object.values(spec.tweaks ?? {}).filter((t) => t.hidden).length
  const copyCount = Object.values(spec.copies ?? {}).reduce((a, n) => a + n, 0)
  const selectedEl = selectedKey ? render.elements.find((e) => e.key === selectedKey) ?? null : null
  const liveTweak: ElementTweak = draft ?? selectedEl?.tweak ?? {}
  // The sauce is addressable like an element but it is not one: it has no height
  // of its own, no shape to cycle, and there is no second helping of it.
  const isSauce = selectedEl?.key === SAUCE_KEY

  // Writes a per-element tweak onto the spec, which is still the only source of
  // truth -- so a recoloured, raised component survives save, share and reload.
  function commitTweak(patch: ElementTweak) {
    if (!selectedEl) return
    const current = spec.tweaks?.[selectedEl.key] ?? {}
    const merged: ElementTweak = { ...current, ...draft, ...patch }
    for (const k of Object.keys(merged) as Array<keyof ElementTweak>) {
      if (merged[k] === undefined) delete merged[k]
    }
    setDraft(null)
    applySpec({ ...spec, tweaks: { ...(spec.tweaks ?? {}), [selectedEl.key]: merged } })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
      <section>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button onClick={onBack} className="link-brand text-xs min-h-11 flex items-center">
              &larr; Back to spread
            </button>
            <h2 className="display text-xl">{initial.name ?? 'Plating'}</h2>
          </div>
          <div className="segmented shrink-0">
            <button onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)" className="disabled:opacity-30 min-h-11">
              &#8630; Undo
            </button>
            <button onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)" className="disabled:opacity-30 min-h-11">
              Redo &#8631;
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="segmented" role="group" aria-label="Preview type">
            {(['2d', '3d'] as const).map((v) => (
              <button key={v} data-active={view === v} onClick={() => setView(v)} className="uppercase min-h-11">
                {v}
              </button>
            ))}
          </div>
          {view === '2d' ? (
            <div className="segmented" role="group" aria-label="Camera angle">
              {ANGLES.map((a) => (
                <button
                  key={a}
                  data-active={angle === a}
                  onClick={() => {
                    setAngle(a)
                    void rerender(spec, a)
                  }}
                  className="min-h-11"
                >
                  {ANGLE_LABEL[a]}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="segmented" role="group" aria-label="Camera view">
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
                onClick={() => setSnap((v) => !v)}
                data-active={snap}
                title="Catch pieces on the plate's centre lines, rings and each other. Hold Alt while dragging to turn it off for one move."
                className="segmented px-2.5 py-1 text-xs min-h-11 flex items-center data-[active=true]:bg-brand data-[active=true]:text-on-brand"
              >
                Snap
              </button>
              <button
                onClick={() => setGuides((v) => !v)}
                data-active={guides}
                title="Show the plate's centre lines and rings"
                className="segmented px-2.5 py-1 text-xs min-h-11 flex items-center data-[active=true]:bg-brand data-[active=true]:text-on-brand"
              >
                Guides
              </button>
              <button
                onClick={() => setCaptureCommand({ nonce: Date.now(), purpose: 'png' })}
                title="Save this exact view as a PNG"
                className="segmented px-2.5 py-1 text-xs min-h-11 flex items-center"
              >
                Save PNG
              </button>
              <button
                onClick={() => setCaptureCommand({ nonce: Date.now(), purpose: 'polish' })}
                title="Coming soon: turn this view into a photograph of the same arrangement. For now it returns your 3D view as it is."
                className="segmented px-2.5 py-1 text-xs min-h-11 flex items-center"
              >
                ✦ Polish
                <span className="ml-1.5 rounded bg-sunken px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted">Coming soon</span>
              </button>
              <div className="segmented" role="group" aria-label="Saved views">
                {bookmarks.map((pose, i) => (
                  <button
                    key={i}
                    type="button"
                    className="min-h-11"
                    data-active={pose !== null}
                    title={pose ? `Go to saved view ${i + 1}. Shift-click to forget it.` : `Save the camera as view ${i + 1}`}
                    onClick={(e) => {
                      if (pose && e.shiftKey) setBookmarks((b) => b.map((x, j) => (j === i ? null : x)))
                      else if (pose) setCameraCommand({ pose, nonce: Date.now() })
                      else setSnapshotCommand({ nonce: Date.now(), slot: i })
                    }}
                  >
                    {pose ? `View ${i + 1}` : `+${i + 1}`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <SceneBar scene={spec.scene} onChange={(scene) => applySpec({ ...spec, scene: Object.keys(scene).length ? scene : undefined })} />

        <BrushBar
          on={brushOn}
          onToggle={() => setBrushOn((v) => !v)}
          width={brushWidth}
          onWidth={setBrushWidth}
          strokes={spec.brush ?? []}
          onRemove={removeStroke}
          onClear={() => {
            forgetStrokeKeys()
            applySpec({ ...spec, brush: undefined })
          }}
          selected={selection.map(strokeIndex).filter((i): i is number => i !== null)}
          onSelect={(index, additive) => selectPiece(strokeKey(index), additive)}
          canPaint={view === '3d' || angle === 'top-down'}
          where={view}
        />

        {view === '3d' ? (
          <div className="plate-well aspect-square w-full overflow-hidden rounded border border-rule">
            <PlatingModel
              dish={dish}
              spec={spec}
              editable
              selection={selection}
              locked={lockedKeys}
              solo={soloKey}
              turntable={turntable}
              snap={snap}
              guides={guides}
              brush={brushOn}
              onStroke={addStroke}
              cameraCommand={cameraCommand}
              snapshotCommand={snapshotCommand}
              onSnapshot={(pose) => {
                const slot = snapshotCommand?.slot ?? 0
                setBookmarks((b) => b.map((x, i) => (i === slot ? pose : x)))
              }}
              captureCommand={captureCommand}
              onCapture={(url) => {
                if (captureCommand?.purpose === 'polish') void polishFrame(url)
                else saveDataUrl(url, `${slug(initial.name ?? 'plating')}-3d.png`)
              }}
              onSelect={selectPiece}
              onMove={(moves) => {
                const overrides = { ...spec.overrides }
                const here = computePoses(dish, spec)
                const carried: Array<{ index: number; dx: number; dy: number }> = []
                for (const { key, x, y, lift } of moves) {
                  const sk = strokeIndex(key)
                  // A painted stroke is moved by the distance its middle travelled, not placed by an override.
                  const at = sk !== null ? here.brush.find((b) => b.index === sk) : undefined
                  if (sk !== null && at) carried.push({ index: sk, dx: x - toFrame(at.x, here.radius), dy: y - toFrame(at.z, here.radius) })
                  else if (sk === null) overrides[key] = lift ? { x, y, e: lift } : { x, y }
                }
                applySpec({ ...spec, overrides, brush: spec.brush ? translateStrokes(spec.brush, carried) : spec.brush })
              }}
            />
          </div>
        ) : (
        <div
          ref={wrapRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="plate-well relative aspect-square w-full touch-none select-none overflow-hidden rounded border border-rule"
        >
          <Plating2D dish={dish} spec={spec} angle={angle} render={render} className="h-full w-full" alt={initial.name ?? ''} />
          {brushOn && angle === 'top-down' ? <BrushOverlay onStroke={addStroke} /> : null}

          {angle === 'top-down' ? render.elements.map((el) => {
            const active = drag?.key === el.key
            const x = active ? drag.x : el.x
            const y = active ? drag.y : el.y
            const isGarnish = el.role === 'garnish'
            return (
              <button
                key={el.key}
                onPointerDown={(e) => onPointerDown(e, el)}
                title={`Drag ${el.name}`}
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                className={[
                  'absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 transition-colors active:cursor-grabbing min-h-11 min-w-11 flex items-center justify-center',
                  isGarnish ? 'h-6 w-6' : 'h-8 w-8',
                  active
                    ? 'border-brand bg-brand/40'
                    : 'border-brand/50 bg-scrim/25 hover:border-brand hover:bg-brand/25',
                ].join(' ')}
              />
            )
          }) : null}

          {angle === 'top-down' && !brushOn
            ? strokeHandles.map((h) => {
                const active = drag?.key === h.key
                return (
                  <button
                    key={h.key}
                    onPointerDown={(e) => onPointerDown(e, { key: h.key, x: h.x, y: h.y } as PlacedElement)}
                    title={`Drag sauce stroke ${h.index + 1}`}
                    aria-label={`Sauce stroke ${h.index + 1}`}
                    style={{ left: `${(active && drag ? drag.x : h.x) * 100}%`, top: `${(active && drag ? drag.y : h.y) * 100}%` }}
                    className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-dashed transition-colors active:cursor-grabbing ${active ? 'border-brand bg-brand/40' : 'border-brand/60 bg-scrim/25 hover:border-brand hover:bg-brand/25'}`}
                  />
                )
              })
            : null}

          {busy ? (
            <div className="absolute right-2 top-2 rounded bg-scrim/85 px-2 py-1 text-xs text-brand-ink">
              rendering
            </div>
          ) : null}
        </div>
        )}

        <p className="mt-2 text-xs text-muted">
          {brushOn
            ? 'Sauce brush is on: pieces cannot be moved until you switch it off.'
            : view === '3d'
            ? `Click a component to select it, drag to move, arrows to nudge. ${nudged} moved · ${tweakCount} tweaked.`
            : angle === 'top-down'
              ? `Drag any element to move it. ${renderCount} re-render${renderCount === 1 ? '' : 's'}.`
              : 'Switch to Top-down to move elements.'}
        </p>

        <details className="mt-3 surface p-3">
          <summary className="cursor-pointer eyebrow">
            Prompt a paid model would receive
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink">
            {render.prompt}
          </pre>
        </details>
      </section>

      <section className="flex flex-col gap-4 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:self-start md:overflow-y-auto md:pr-1">
        <div className={`space-y-3 surface p-4 ${view === '3d' ? 'order-last' : ''}`}>
          <h3 className="eyebrow">Plating</h3>

          <div className="grid grid-cols-2 gap-x-3 gap-y-3">

          <Field label="Composition">
            <Select value={spec.composition} options={COMPOSITIONS} onChange={(v) => set('composition', v)} />
          </Field>
          <Field label="Plate">
            <Select value={spec.plate} options={PLATES} onChange={(v) => set('plate', v)} />
          </Field>
          <Field label="Sauce">
            <Select value={spec.sauce} options={SAUCES} onChange={(v) => set('sauce', v)} />
          </Field>
          <Field label="Height">
            <Select value={spec.height} options={HEIGHTS} onChange={(v) => set('height', v)} />
          </Field>
          <Field label="Garnish">
            <Select value={spec.garnish} options={GARNISHES} onChange={(v) => set('garnish', v)} />
          </Field>
          </div>

          {onAddComponent ? (
            <Field label="Add an ingredient">
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addComponent()
                    }
                  }}
                  placeholder="e.g. pickled walnut"
                  aria-label="New ingredient name"
                  className="field flex-1 text-base md:text-sm"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as ComponentRole)}
                  aria-label="New ingredient role"
                  className="field w-28 text-base md:text-sm"
                >
                  {ADD_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button onClick={addComponent} disabled={!newName.trim() || busy} className="btn btn-secondary btn-sm">
                  Add
                </button>
              </div>
            </Field>
          ) : null}

          <Field label="Chef direction">
            <textarea
              value={spec.notes}
              onChange={(e) => setSpec({ ...spec, notes: e.target.value })}
              onBlur={() => applySpec(spec)}
              rows={3}
              placeholder="e.g. lean the duck against the puree, wipe the rim"
              className="field text-base md:text-sm"
            />
          </Field>
        </div>

        {!isFree && dirty ? (
          <button
            onClick={() => void rerender(spec)}
            disabled={busy}
            className="btn btn-primary btn-md w-full"
          >
            Re-render (${render.costUsd.toFixed(2)})
          </button>
        ) : null}

        {view === '3d' && selectedEl ? (
          <div className="space-y-3 surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="eyebrow">Selected</h3>
              <button onClick={() => setSelectedKey(null)} className="link-brand text-xs">
                deselect
              </button>
            </div>
            <h3 className="display text-sm leading-snug">{selectedEl.name}</h3>
            {isSauce ? (
              <p className="text-xs leading-snug text-muted">
                Moves, sizes and turns as one piece. Drag it on the plate, or nudge it with the arrow keys.
              </p>
            ) : null}

            <Field label="Colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedEl.color}
                  onChange={(e) => commitTweak({ c: e.target.value })}
                  className="h-8 w-12 cursor-pointer rounded border border-rule-strong bg-transparent"
                />
                <span className="numeric text-xs text-muted">{selectedEl.color}</span>
                {selectedEl.tweak?.c ? (
                  <button onClick={() => commitTweak({ c: undefined })} className="link-brand ml-auto text-xs">
                    reset
                  </button>
                ) : null}
              </div>
            </Field>

            {isSauce ? null : (
            <Field label={`Height  ${(liveTweak.h ?? 1).toFixed(2)}x`}>
              <input
                type="range"
                min={0.4}
                max={2.2}
                step={0.05}
                value={liveTweak.h ?? 1}
                onChange={(e) => setDraft({ ...liveTweak, h: Number(e.target.value) })}
                onPointerUp={() => draft && commitTweak({ h: draft.h })}
                onKeyUp={() => draft && commitTweak({ h: draft.h })}
                className="w-full accent-[var(--color-gold)]"
              />
            </Field>
            )}

            <Field label={`Size  ${(liveTweak.s ?? 1).toFixed(2)}x`}>
              <input
                type="range"
                min={0.5}
                max={1.8}
                step={0.05}
                value={liveTweak.s ?? 1}
                onChange={(e) => setDraft({ ...liveTweak, s: Number(e.target.value) })}
                onPointerUp={() => draft && commitTweak({ s: draft.s })}
                onKeyUp={() => draft && commitTweak({ s: draft.s })}
                className="w-full accent-[var(--color-gold)]"
              />
            </Field>

            <Field label={`Turn  ${Math.round(liveTweak.r ?? 0)}\u00b0`}>
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={liveTweak.r ?? 0}
                onChange={(e) => setDraft({ ...liveTweak, r: Number(e.target.value) })}
                onPointerUp={() => draft && commitTweak({ r: draft.r })}
                onKeyUp={() => draft && commitTweak({ r: draft.r })}
                className="w-full accent-[var(--color-gold)]"
              />
            </Field>

            {selectedEl.role !== 'garnish' && !isSauce ? (
              <Field label="Shape">
                <div className="flex gap-2">
                  <button
                    onClick={() => commitTweak({ v: ((liveTweak.v ?? 0) + SHAPE_ORDER.length - 1) % SHAPE_ORDER.length })}
                    className="btn btn-secondary btn-sm flex-1"
                  >
                    &larr;
                  </button>
                  <span className="flex-1 self-center text-center text-xs capitalize text-muted">
                    {liveTweak.v === undefined ? 'auto' : SHAPE_ORDER[liveTweak.v % SHAPE_ORDER.length]}
                  </span>
                  <button
                    onClick={() => commitTweak({ v: ((liveTweak.v ?? 0) + 1) % SHAPE_ORDER.length })}
                    className="btn btn-secondary btn-sm flex-1"
                  >
                    &rarr;
                  </button>
                </div>
              </Field>
            ) : null}

            {isSauce ? null : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const id = selectedEl.componentId
                  const current = spec.copies?.[id] ?? 0
                  if (current >= 5) return
                  applySpec({ ...spec, copies: { ...(spec.copies ?? {}), [id]: current + 1 } })
                }}
                disabled={(spec.copies?.[selectedEl.componentId] ?? 0) >= 5}
                className="btn btn-secondary btn-sm flex-1"
              >
                Plate another
              </button>
              <button
                onClick={() => {
                  setSelectedKey(null)
                  commitTweak({ hidden: true })
                }}
                className="btn btn-secondary btn-sm flex-1"
              >
                Take off
              </button>
            </div>
            )}
            <button
              onClick={() => {
                const next = { ...(spec.tweaks ?? {}) }
                delete next[selectedEl.key]
                setDraft(null)
                // The sauce is placed by dragging as much as by the sliders, so
                // resetting it has to put it back where the plating engine had it.
                const overrides = { ...(spec.overrides ?? {}) }
                if (isSauce) delete overrides[SAUCE_KEY]
                applySpec({ ...spec, tweaks: next, overrides })
              }}
              className="btn btn-secondary btn-sm w-full"
            >
              {isSauce ? 'Reset the sauce' : 'Reset this component'}
            </button>
          </div>
        ) : null}

        {view === '3d' ? (
          <div className="order-first">
          <StudioTools
            dish={dish}
            spec={spec}
            selection={selection}
            locked={lockedKeys}
            solo={soloKey}
            onSelect={selectPiece}
            onToggleLock={(key) => setLockedKeys((l) => (l.includes(key) ? l.filter((k) => k !== key) : [...l, key]))}
            onSolo={setSoloKey}
            onSetHidden={setHidden}
            onApply={applySpec}
          />
          </div>
        ) : null}

        {copyCount > 0 ? (
          <div className="space-y-2 surface p-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Extra portions</span>
              <span className="numeric">{copyCount}</span>
            </div>
            <button
              onClick={() => applySpec({ ...spec, copies: {} })}
              className="btn btn-secondary btn-sm w-full"
            >
              Back to one of each
            </button>
          </div>
        ) : null}

        {hiddenCount > 0 ? (
          <div className="space-y-2 surface p-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Taken off the plate</span>
              <span className="numeric">{hiddenCount}</span>
            </div>
            <button
              onClick={() => {
                // Hidden components leave the layout, so there is nothing left to
                // click. This is the only way back.
                const next = Object.fromEntries(
                  Object.entries(spec.tweaks ?? {}).map(([k, t]) => [k, { ...t, hidden: undefined }]),
                )
                applySpec({ ...spec, tweaks: next })
              }}
              className="btn btn-secondary btn-sm w-full"
            >
              Put them all back
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-x-4 px-1 text-xs">
          <button
            onClick={() => applySpec({ ...spec, overrides: {} })}
            disabled={nudged === 0}
            className="link-brand min-h-11 disabled:opacity-40"
          >
            Clear drag nudges ({nudged})
          </button>
          <button onClick={() => applySpec(initial.spec)} className="link-brand min-h-11">
            Reset to original plating
          </button>
        </div>

        {error ? (
          <p className="notice-error p-2.5 text-xs">{error}</p>
        ) : null}
      </section>
      {polish ? <PolishDialog state={polish} name={initial.name ?? 'Plating'} onClose={() => setPolish(null)} /> : null}
    </div>
  )
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{text}</span>
      {children}
    </label>
  )
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: T[]
  onChange: (v: T) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="field capitalize"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  )
}
