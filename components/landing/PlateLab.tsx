'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { saveHandoff } from '@/lib/client/dish-handoff'
import { useMediaQuery } from '@/lib/client/hooks'
import {
  CONCEPT_COUNT,
  PANTRY,
  SAUCES,
  arrange,
  clampToPlate,
  conceptName,
  foodById,
  type Placed,
  type Point,
  type Stroke,
} from './plating'

/* The plate a visitor can actually work on. Three things happen here, and they
   are the three things the studio does:

     drag    pick a piece up and put it somewhere else
     sauce   draw on the porcelain; the faster the stroke, the thinner it runs
     plate   hand it to FUDDO, which re-plates the same food twelve ways

   Sauce lives on a canvas under the food. Strokes are kept in plate units, so a
   resize redraws them rather than stretching them. */

export type Pick = { concept: number; n: number }

function paint(ctx: CanvasRenderingContext2D, points: Point[], unit: number, scale: number) {
  if (points.length === 1) {
    const p = points[0]
    ctx.beginPath()
    ctx.arc(p.x * unit, p.y * unit, (p.w * unit * scale) / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    ctx.lineWidth = ((a.w + b.w) / 2) * unit * scale
    ctx.beginPath()
    ctx.moveTo(a.x * unit, a.y * unit)
    ctx.lineTo(b.x * unit, b.y * unit)
    ctx.stroke()
  }
}

/** A static plate: the same arrangement maths, drawn small. */
export function MiniPlate({ concept, ids, sauce = SAUCES[0].color }: { concept: number; ids: string[]; sauce?: string }) {
  const plan = arrange(concept, ids)
  return (
    <span className="lp-plate lp-mini" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        {plan.sauce.map((points, i) =>
          points.length === 1 ? (
            <circle key={i} cx={points[0].x} cy={points[0].y} r={points[0].w / 2} fill={sauce} />
          ) : (
            <polyline
              key={i}
              points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={sauce}
              strokeWidth={Math.max(...points.map((p) => p.w)) * 0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ),
        )}
      </svg>
      {plan.placed.map((p, i) => {
        const food = foodById(p.id)
        return (
          <i
            key={p.id}
            className={`lp-piece k-${food.kind}`}
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${food.w}%`,
                height: `${food.h}%`,
                rotate: `${p.r}deg`,
                zIndex: 2 + i,
                '--food': food.color,
              } as CSSProperties
            }
          />
        )
      })}
    </span>
  )
}

export default function PlateLab({ pick, onPick }: { pick: Pick; onPick: (concept: number) => void }) {
  const [placed, setPlaced] = useState<Placed[]>(() => arrange(0, ['duck', 'puree', 'leek']).placed)
  const [sauce, setSauce] = useState<string>(SAUCES[0].color)
  // On a touch screen a finger on the plate is usually someone scrolling past,
  // so the brush starts off there and is one tap away. Null until chosen.
  const coarse = useMediaQuery('(pointer: coarse)')
  const [brushChoice, setBrush] = useState<boolean | null>(null)
  const brush = brushChoice ?? !coarse
  const router = useRouter()
  const [dragging, setDragging] = useState<string | null>(null)
  const [dish, setDish] = useState('Duck breast, celeriac, red wine')
  const [touched, setTouched] = useState(false)
  const [said, setSaid] = useState('')

  const plate = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const reveal = useRef(1)
  const frame = useRef(0)
  const grab = useRef({ dx: 0, dy: 0 })
  const live = useRef<Stroke | null>(null)
  // What the re-plating effect reads without re-running for: kept current by
  // the effect below, which is declared first and so runs first.
  const placedRef = useRef(placed)
  const sauceRef = useRef(sauce)
  useEffect(() => {
    placedRef.current = placed
    sauceRef.current = sauce
  })

  const draw = useCallback(() => {
    const node = canvas.current
    const ctx = node?.getContext('2d')
    if (!node || !ctx) return
    const unit = node.width / 100
    ctx.clearRect(0, 0, node.width, node.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const total = strokes.current.reduce((sum, s) => sum + s.points.length, 0)
    let budget = reveal.current >= 1 ? Infinity : Math.ceil(total * reveal.current)
    for (const stroke of strokes.current) {
      if (budget <= 0) break
      const points = stroke.points.slice(0, budget)
      budget -= points.length
      ctx.globalAlpha = 1
      ctx.fillStyle = ctx.strokeStyle = stroke.color
      paint(ctx, points, unit, 1)
      // A thin pale pass, nudged up and left: the wet shine along a sauce. Drawn
      // as one path, because overlapping translucent segments read as beads.
      const width = Math.min(...points.map((p) => p.w)) * 0.3
      ctx.save()
      ctx.translate(-0.4 * unit, -0.5 * unit)
      ctx.globalAlpha = 0.22
      ctx.fillStyle = ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(width, 0.5) * unit
      ctx.beginPath()
      if (points.length === 1) {
        // A small glint near the edge: a pool of sauce is many times wider than a dot, and its shine does not grow with it.
        ctx.arc((points[0].x - points[0].w * 0.18) * unit, (points[0].y - points[0].w * 0.18) * unit, Math.min(points[0].w * 0.16, 0.9) * unit, 0, Math.PI * 2)
        ctx.fill()
      } else {
        points.forEach((p, i) => (i ? ctx.lineTo(p.x * unit, p.y * unit) : ctx.moveTo(p.x * unit, p.y * unit)))
        ctx.stroke()
      }
      ctx.restore()
    }
  }, [])

  // Keep the backing store at device resolution and redraw when the plate resizes.
  useEffect(() => {
    const node = canvas.current
    if (!node) return
    const fit = () => {
      const size = Math.round(node.clientWidth * Math.min(window.devicePixelRatio || 1, 2))
      if (size && node.width !== size) {
        node.width = size
        node.height = size
      }
      draw()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(node)
    return () => ro.disconnect()
  }, [draw])

  // Re-plate whenever a concept is asked for, here or from further down the page.
  useEffect(() => {
    const ids = placedRef.current.map((p) => p.id)
    const plan = arrange(pick.concept, ids)
    setPlaced(plan.placed)
    strokes.current = plan.sauce.map((points) => ({ color: sauceRef.current, points }))
    cancelAnimationFrame(frame.current)
    if (pick.n === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveal.current = 1
      draw()
      return
    }
    setSaid(`Concept ${pick.concept + 1} of ${CONCEPT_COUNT}: ${conceptName(pick.concept)}`)
    const started = performance.now()
    const tick = (now: number) => {
      // The food travels first; the sauce is drawn once it has somewhere to go.
      reveal.current = Math.min(Math.max((now - started - 260) / 620, 0), 1)
      draw()
      if (reveal.current < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [pick, draw])

  const toUnits = (e: { clientX: number; clientY: number }) => {
    const box = plate.current!.getBoundingClientRect()
    return { x: ((e.clientX - box.left) / box.width) * 100, y: ((e.clientY - box.top) / box.height) * 100 }
  }

  // --- food -----------------------------------------------------------------

  function toggle(id: string) {
    setTouched(true)
    setPlaced((list) => {
      if (list.some((p) => p.id === id)) {
        setSaid(`${foodById(id).name} taken off`)
        return list.filter((p) => p.id !== id)
      }
      setSaid(`${foodById(id).name} plated`)
      const n = list.length
      return [...list, { id, x: 38 + ((n * 17) % 26), y: 36 + ((n * 11) % 24), r: ((n * 37) % 50) - 25 }]
    })
  }

  function pieceDown(e: PointerEvent<HTMLButtonElement>, piece: Placed) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const at = toUnits(e)
    grab.current = { dx: piece.x - at.x, dy: piece.y - at.y }
    setDragging(piece.id)
    setTouched(true)
  }

  function pieceMove(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (dragging !== id) return
    const at = toUnits(e)
    const next = clampToPlate(at.x + grab.current.dx, at.y + grab.current.dy)
    setPlaced((list) => list.map((p) => (p.id === id ? { ...p, ...next } : p)))
  }

  function pieceKey(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    const step = e.shiftKey ? 6 : 2
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      setPlaced((list) => list.map((p) => (p.id === id ? { ...p, ...clampToPlate(p.x + dx, p.y + dy) } : p)))
    } else if (e.key === 'r' || e.key === 'R') {
      setPlaced((list) => list.map((p) => (p.id === id ? { ...p, r: p.r + (e.shiftKey ? -15 : 15) } : p)))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      toggle(id)
    }
  }

  // --- sauce ----------------------------------------------------------------

  function sauceDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!brush) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const at = toUnits(e)
    live.current = { color: sauce, points: [{ ...at, w: 5 }] }
    strokes.current.push(live.current)
    reveal.current = 1
    setTouched(true)
    draw()
  }

  function sauceMove(e: PointerEvent<HTMLCanvasElement>) {
    const stroke = live.current
    if (!stroke) return
    const at = toUnits(e)
    const last = stroke.points[stroke.points.length - 1]
    const gap = Math.hypot(at.x - last.x, at.y - last.y)
    if (gap < 0.7) return
    // Speed thins the line: a slow drag leaves a pool, a flick leaves a thread.
    const target = Math.min(Math.max(6.2 - gap * 1.15, 1.6), 6.2)
    stroke.points.push({ ...at, w: last.w * 0.65 + target * 0.35 })
    draw()
  }

  function wipe() {
    strokes.current = []
    draw()
    setSaid('Sauce wiped')
  }

  function enter() {
    const sauces = SAUCES.filter((s) => strokes.current.some((stroke) => stroke.color === s.color))
    saveHandoff({
      name: dish,
      components: [
        ...placed.map((p) => ({ name: foodById(p.id).name, role: foodById(p.id).role })),
        ...sauces.map((s) => ({ name: s.name, role: 'sauce' as const })),
      ],
    })
    router.push('/auth?next=/studio')
  }

  const on = (id: string) => placed.some((p) => p.id === id)

  return (
    <div className="lp-lab" data-reveal>
      {/* The docket: what a kitchen printer would hand the pass. */}
      <div className="lp-docket">
        <header>
          <span>FUDDO · The pass</span>
          <span>Table 12</span>
        </header>

        <label htmlFor="lp-dish">Dish</label>
        <input
          id="lp-dish"
          value={dish}
          onChange={(e) => setDish(e.target.value)}
          placeholder="Name your dish"
          maxLength={60}
        />

        <p id="lp-pantry">Pantry</p>
        <ul aria-labelledby="lp-pantry">
          {PANTRY.map((food) => (
            <li key={food.id}>
              <button type="button" aria-pressed={on(food.id)} onClick={() => toggle(food.id)}>
                <i aria-hidden="true" style={{ background: food.color }} />
                <span>{food.name}</span>
                <small>{food.role}</small>
                <b aria-hidden="true">{on(food.id) ? 'On plate' : 'Add'}</b>
              </button>
            </li>
          ))}
        </ul>

        <p id="lp-sauce">Sauce</p>
        <div className="lp-sauces" role="radiogroup" aria-labelledby="lp-sauce">
          {SAUCES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sauce === s.color}
              onClick={() => {
                setSauce(s.color)
                setBrush(true)
              }}
            >
              <i aria-hidden="true" style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
          <button type="button" className="lp-wipe" onClick={wipe}>
            Wipe
          </button>
        </div>

        <div className="lp-docket-foot">
          <button type="button" className="lp-fire" onClick={() => onPick((pick.concept + 1) % CONCEPT_COUNT)}>
            <span aria-hidden="true">✦</span> Let FUDDO plate it
          </button>
          <button type="button" className="lp-take" onClick={enter}>
            Take this dish to the studio <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <div className="lp-bench">
        <div className="lp-bench-head">
          <p>
            <b>Concept {String(pick.concept + 1).padStart(2, '0')}</b> / {CONCEPT_COUNT} · {conceptName(pick.concept)}
          </p>
          <button type="button" aria-pressed={brush} onClick={() => setBrush(!brush)}>
            Sauce brush {brush ? 'on' : 'off'}
          </button>
        </div>

        <div className="lp-plate lp-work" ref={plate} data-brush={brush}>
          <canvas
            ref={canvas}
            onPointerDown={sauceDown}
            onPointerMove={sauceMove}
            onPointerUp={() => (live.current = null)}
            onPointerCancel={() => (live.current = null)}
            aria-label="Sauce on the plate"
            role="img"
          />
          {placed.map((piece, i) => {
            const food = foodById(piece.id)
            return (
              <button
                key={piece.id}
                type="button"
                className={`lp-piece k-${food.kind}`}
                data-dragging={dragging === piece.id}
                aria-label={`${food.name}. Arrow keys move it, R turns it, Delete takes it off.`}
                onPointerDown={(e) => pieceDown(e, piece)}
                onPointerMove={(e) => pieceMove(e, piece.id)}
                onPointerUp={() => setDragging(null)}
                onPointerCancel={() => setDragging(null)}
                onKeyDown={(e) => pieceKey(e, piece.id)}
                style={
                  {
                    left: `${piece.x}%`,
                    top: `${piece.y}%`,
                    width: `${food.w}%`,
                    height: `${food.h}%`,
                    rotate: `${piece.r}deg`,
                    zIndex: dragging === piece.id ? 40 : 2 + i,
                    '--food': food.color,
                  } as CSSProperties
                }
              />
            )
          })}
          {placed.length === 0 ? <p className="lp-empty">A clean plate. Add something from the pantry.</p> : null}
          <p className="lp-coach" data-hide={touched}>
            {brush ? 'Drag the food · draw to sauce' : 'Drag the food to move it'}
          </p>
        </div>

        <div className="lp-pips" role="group" aria-label="Twelve concepts">
          {Array.from({ length: CONCEPT_COUNT }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Concept ${i + 1}, ${conceptName(i)}`}
              aria-current={pick.concept === i}
              onClick={() => onPick(i)}
            >
              {String(i + 1).padStart(2, '0')}
            </button>
          ))}
        </div>

        <p className="lp-sr" role="status" aria-live="polite">
          {said}
        </p>
      </div>
    </div>
  )
}
