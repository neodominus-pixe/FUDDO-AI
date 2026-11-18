'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/* A lens over the finished plate that shows the geometry it was built on.
   The blueprint is drawn in the same 1200-unit square the render fills, so each
   outline sits exactly on the piece it describes. The lens position is written
   straight to CSS variables: no React render per pointer move. */

export default function XRay() {
  const box = useRef<HTMLDivElement>(null)
  const at = useRef({ x: 38, y: 60 })
  const [held, setHeld] = useState(false)

  function place(x: number, y: number) {
    at.current = { x: Math.min(Math.max(x, 4), 96), y: Math.min(Math.max(y, 4), 96) }
    box.current?.style.setProperty('--lx', `${at.current.x}%`)
    box.current?.style.setProperty('--ly', `${at.current.y}%`)
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    // A mouse steers the lens just by hovering; a finger has to be down.
    if (e.pointerType !== 'mouse' && !held) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (!held) setHeld(true)
    place(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100)
  }

  function key(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-4, 0],
      ArrowRight: [4, 0],
      ArrowUp: [0, -4],
      ArrowDown: [0, 4],
    }
    const step = moves[e.key]
    if (!step) return
    e.preventDefault()
    setHeld(true)
    place(at.current.x + step[0], at.current.y + step[1])
  }

  return (
    <section className="lp-xray-section">
      <div data-reveal>
        <p className="lp-eyebrow">Sketch to service</p>
        <h2>
          Every plate keeps <em>its blueprint.</em>
        </h2>
        <p>
          Run the lens over the plate. Underneath every concept is the geometry it was built on:
          where the protein sits, the angle of the veg, where the sauce pools. That is what the
          kitchen plates from.
        </p>
      </div>

      <div
        className="lp-xray"
        data-reveal
        data-held={held}
        ref={box}
        tabIndex={0}
        role="group"
        aria-label="Blueprint lens over the plate. Use the arrow keys to move it."
        onPointerMove={move}
        onPointerDown={(e) => {
          setHeld(true)
          const rect = e.currentTarget.getBoundingClientRect()
          place(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100)
        }}
        onKeyDown={key}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero/classic-centred.png" alt="A plated duck dish rendered by FUDDO AI" />
        <div className="lp-lens">
          <svg viewBox="0 0 1200 1200" aria-hidden="true">
            <g className="bp-guides">
              <path d="M40 722h1120M600 380v700" />
              <ellipse cx="600" cy="722" rx="330" ry="166" />
            </g>
            <ellipse cx="600" cy="722" rx="528" ry="265" />
            <ellipse cx="560" cy="742" rx="150" ry="78" className="bp-fill" />
            <rect x="462" y="562" width="340" height="156" rx="46" transform="rotate(5 632 640)" />
            <rect x="240" y="585" width="240" height="80" rx="40" transform="rotate(17 360 625)" />
            <rect x="287" y="706" width="290" height="84" rx="42" transform="rotate(17 432 748)" />
            <ellipse cx="690" cy="806" rx="118" ry="56" transform="rotate(15 690 806)" />
            <g className="bp-notes">
              <path d="M700 590 820 470M300 600 220 500M700 830 860 930M470 800 400 960" />
              <text x="828" y="462">Protein · centre</text>
              <text x="212" y="490" textAnchor="end">Veg · 17°</text>
              <text x="868" y="944">Quenelle</text>
              <text x="392" y="990" textAnchor="middle">Sauce · pooled</text>
            </g>
          </svg>
        </div>
        <span className="lp-lens-ring" aria-hidden="true" />
        <small>Move the lens</small>
      </div>
    </section>
  )
}
