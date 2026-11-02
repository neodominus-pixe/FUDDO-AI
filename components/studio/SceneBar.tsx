'use client'

import { LIGHTING_LABELS } from '../scene/look'
import { PROPS_LABELS, TABLE_LABELS } from '../scene/set'
import { LIGHTS, PROPS, TABLES, type LightId, type PropsId, type SceneStyle, type TableId } from '@/lib/types'

// How the plate is photographed. These choices are saved on the plating, so the spread cards, the 2D view and the
// consultant's review all show the plating the way the chef set it up.
export default function SceneBar({ scene, onChange }: { scene: SceneStyle | undefined; onChange: (next: SceneStyle) => void }) {
  const table = scene?.table ?? 'studio'
  const props = scene?.props ?? 'none'
  const light = scene?.light ?? 'studio'
  const focus = scene?.focus ?? false
  // Anything left at its default is not stored, so an untouched plating carries no scene at all.
  const set = (patch: SceneStyle) => {
    const next: SceneStyle = { ...scene, ...patch }
    if (next.table === 'studio') delete next.table
    if (next.props === 'none') delete next.props
    if (next.light === 'studio') delete next.light
    if (!next.focus) delete next.focus
    onChange(next)
  }
  const select = 'field min-h-11 w-auto px-2 py-1 text-xs'

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Scene">
      <select value={table} onChange={(e) => set({ table: e.target.value as TableId })} aria-label="Table surface" className={select}>
        {TABLES.map((t) => (
          <option key={t} value={t}>
            {TABLE_LABELS[t]}
          </option>
        ))}
      </select>
      <select value={props} onChange={(e) => set({ props: e.target.value as PropsId })} aria-label="Props beside the plate" className={select}>
        {PROPS.map((p) => (
          <option key={p} value={p}>
            {PROPS_LABELS[p]}
          </option>
        ))}
      </select>
      <select value={light} onChange={(e) => set({ light: e.target.value as LightId })} aria-label="Lighting" className={select}>
        {LIGHTS.map((l) => (
          <option key={l} value={l}>
            {LIGHTING_LABELS[l]} light
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => set({ focus: !focus })}
        aria-pressed={focus}
        data-active={focus}
        title="Softly blur what is far from the plate, the way a camera lens does"
        className="segmented flex min-h-11 items-center px-3 text-xs data-[active=true]:bg-brand data-[active=true]:text-on-brand"
      >
        Soft focus
      </button>
    </div>
  )
}
