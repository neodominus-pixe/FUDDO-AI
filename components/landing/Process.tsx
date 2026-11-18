'use client'

import { useEffect, useRef, useState } from 'react'
import { MiniPlate } from './PlateLab'
import { CONCEPT_COUNT, PANTRY, conceptName } from './plating'

/* The three steps, told by scrolling. The words move; the picture beside them
   stays put and changes to match whichever step is crossing the middle of the
   screen. Each picture is a small working model of that step, not an
   illustration of it. */

const STEPS = [
  {
    title: 'Describe the dish',
    text: 'List the components, give each one a role, and add reference photos of your own food. That is the whole brief.',
  },
  {
    title: 'Explore twelve concepts',
    text: 'One generation returns a dozen distinct compositions of the same dish. Keep the ones worth keeping. Tap any plate here to put it on the pass above.',
  },
  {
    title: 'Refine, then get one decision',
    text: 'Adjust every detail in 3D, send your consultant a review link, and get a single approved plating back with notes for the kitchen.',
  },
]

const BRIEF = ['duck', 'puree', 'leek', 'cherry']

export default function Process({ onPick }: { onPick: (concept: number) => void }) {
  const [active, setActive] = useState(0)
  const steps = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    // A band across the middle of the viewport: whichever step is in it is live.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    steps.current.forEach((node) => node && io.observe(node))
    return () => io.disconnect()
  }, [])

  return (
    <section className="lp-process" id="process">
      <div className="lp-section-head" data-reveal>
        <p className="lp-eyebrow">How it works</p>
        <h2>
          From thought to plate, <em>without the waste.</em>
        </h2>
      </div>

      <div className="lp-scrolly">
        <div className="lp-stage" data-active={active} aria-hidden="true">
          <div className="lp-scene lp-scene-brief">
            <header>
              <span>New dish</span>
              <span>01</span>
            </header>
            <h3>Duck breast, celeriac, red wine</h3>
            <ul>
              {BRIEF.map((id) => {
                const food = PANTRY.find((f) => f.id === id)!
                return (
                  <li key={id}>
                    <i style={{ background: food.color }} />
                    <span>{food.name}</span>
                    <small>{food.role}</small>
                  </li>
                )
              })}
              <li>
                <i style={{ background: '#6b1a2c' }} />
                <span>Red wine jus</span>
                <small>sauce</small>
              </li>
            </ul>
            <footer>+ 2 reference photos</footer>
          </div>

          <div className="lp-scene lp-scene-grid">
            {Array.from({ length: CONCEPT_COUNT }, (_, i) => (
              <span key={i} style={{ transitionDelay: `${i * 45}ms` }}>
                <MiniPlate concept={i} ids={BRIEF} />
              </span>
            ))}
          </div>

          <div className="lp-scene lp-scene-review">
            <MiniPlate concept={4} ids={BRIEF} />
            <div>
              <small>Consultant review</small>
              <h3>Concept 05 · {conceptName(4)}</h3>
              <p>One approved plating comes back, with the consultant’s notes for the kitchen.</p>
            </div>
            <b className="lp-stamp">Approved for tasting</b>
          </div>
        </div>

        <ol className="lp-steps">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              data-step={i}
              data-on={active === i}
              ref={(node) => {
                steps.current[i] = node
              }}
            >
              <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              {i === 1 ? (
                <div className="lp-step-picks">
                  {[1, 5, 8, 9].map((c) => (
                    <button key={c} type="button" onClick={() => onPick(c)} aria-label={`Put concept ${c + 1}, ${conceptName(c)}, on the pass`}>
                      <MiniPlate concept={c} ids={BRIEF} />
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
