import PlatingImage from '../PlatingImage'
import type { ClientRender } from '../RefineView'
import type { Snapshot } from './SpreadSnapshots'

/**
 * A small picture of one plating. A real photograph, if a paid provider made one; otherwise the snapshot of its 3D scene;
 * and while that is being drawn, a quiet placeholder. The flat drawing is only a last resort, for a browser that cannot
 * draw the 3D scene at all.
 */
export default function PlatingThumb({ render, snapshot, className }: { render: ClientRender; snapshot: Snapshot | undefined; className: string }) {
  const fresh = snapshot !== undefined && snapshot.key === JSON.stringify(render.spec)
  const name = render.name ?? ''
  if (render.imageUrl || (fresh && !snapshot.url)) return <PlatingImage svg={render.svg} imageUrl={render.imageUrl} className={className} alt={name} />
  if (fresh && snapshot.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={snapshot.url} alt={name} className={`${className} object-cover`} />
  }
  return <div className={`${className} animate-pulse`} role="img" aria-label={`${name || 'Plating'}, drawing`} />
}
