'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'
import HeroPlate, { CONCEPTS } from '@/components/HeroPlate'
import PlateLab, { type Pick } from './PlateLab'
import Process from './Process'
import XRay from './XRay'

const TICKER = ['Twelve concepts per generation', 'Refine in 3D', 'One review link', 'One decision back', 'A spec for the line', 'Less in the bin']

const MENU = [
  ['Twelve directions at once', 'Every generation returns a dozen distinct compositions of the same dish, side by side.'],
  ['A plate you can turn', 'Refine in 3D: drag elements, change portions, take things off, and look at it from the pass.'],
  ['One link, one decision', 'Send your consultant a review link. They pick a plating and leave notes for the kitchen.'],
  ['A spec the line can follow', 'The approved plate becomes a plating specification card, with every chef adjustment recorded.'],
]

/* Reveal-on-scroll. One observer for the whole page, and every element keeps
   its revealed state once seen so scrolling back up does not replay it. */
function useReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll('[data-reveal]')
    if (!('IntersectionObserver' in window)) return
    // Only now does the CSS start hiding anything: until this flag is set the
    // sections are plain visible, which is what a reader without JavaScript --
    // or before hydration -- gets.
    document.documentElement.dataset.revealReady = ''
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-reveal', 'in')
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    targets.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

export default function Landing({ fontClass }: { fontClass: string }) {
  const [menu, setMenu] = useState(false)
  const [stuck, setStuck] = useState(false)
  const [concept, setConcept] = useState(0)
  const [live, setLive] = useState(false)
  // Which of the twelve compositions the playground is showing. `n` counts
  // requests, so asking for the same concept twice still re-plates.
  const [pick, setPick] = useState<Pick>({ concept: 0, n: 0 })

  const hero = useRef<HTMLElement>(null)
  const frame = useRef(0)

  useReveal()

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // The headline leans a few pixels away from the cursor and the glow behind
  // the plate follows it. Written to CSS variables, at most once a frame.
  function lean(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse') return
    const { clientX, clientY } = e
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const node = hero.current
      if (!node) return
      const box = node.getBoundingClientRect()
      node.style.setProperty('--px', ((clientX - box.left) / box.width - 0.5).toFixed(3))
      node.style.setProperty('--py', ((clientY - box.top) / box.height - 0.5).toFixed(3))
    })
  }

  const onPick = useCallback((c: number) => setPick((p) => ({ concept: c, n: p.n + 1 })), [])

  // From the process section: load a concept, then bring the plate into view.
  const pickAndShow = useCallback(
    (c: number) => {
      onPick(c)
      document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [onPick],
  )

  const shown = CONCEPTS[concept]

  return (
    <main className={`lp ${fontClass}`}>
      <header className="lp-nav" data-stuck={stuck}>
        <Link href="/" aria-label="FUDDO AI home">
          <Logo tagline="AI Plating Studio" size={40} />
        </Link>
        <nav className={menu ? 'open' : ''}>
          <a href="#lab" onClick={() => setMenu(false)}>
            Try it
          </a>
          <a href="#process" onClick={() => setMenu(false)}>
            How it works
          </a>
          <a href="#about" onClick={() => setMenu(false)}>
            About
          </a>
          <Link href="/auth?next=/studio" className="lp-nav-cta" onClick={() => setMenu(false)}>
            Enter studio <span aria-hidden="true">↗</span>
          </Link>
        </nav>
        <div className="lp-nav-tools">
          <ThemeToggle />
          <button className="lp-hamb" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Toggle menu">
            <i />
            <i />
          </button>
        </div>
      </header>

      {/* The cover: the headline is set around the plate rather than beside it. */}
      <section className="lp-hero" ref={hero} onPointerMove={lean}>
        <h1 className="lp-sr">Your vision. Plated beautifully.</h1>
        <div className="lp-cover">
          <span className="lp-line lp-l1" aria-hidden="true">
            Your vision.
          </span>
          <HeroPlate index={concept} onLive={setLive} />
          <span className="lp-line lp-l2" aria-hidden="true">
            Plated <em>beautifully.</em>
          </span>
        </div>

        <div className="lp-hero-foot">
          <div>
            <p className="lp-lead">
              FUDDO AI turns a list of ingredients into considered plating concepts in seconds.
              Explore, refine and share every idea long before service begins.
            </p>
            <div className="lp-actions">
              <Link href="/auth?next=/studio" className="brand-button">
                Create your first plate <span aria-hidden="true">→</span>
              </Link>
              <a href="#lab" className="ghost-button">
                Plate one right here <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>

          <div className="lp-ticket">
            <div className="lp-tabs" role="tablist" aria-label="Plating concepts">
              {CONCEPTS.map((c, i) => (
                <button key={c.slug} role="tab" aria-selected={i === concept} onClick={() => setConcept(i)}>
                  {c.name}
                </button>
              ))}
            </div>
            <dl>
              <div>
                <dt>Plate</dt>
                <dd>{shown.plate}</dd>
              </div>
              <div>
                <dt>Sauce</dt>
                <dd>{shown.sauce}</dd>
              </div>
              <div>
                <dt>Build</dt>
                <dd>{shown.build}</dd>
              </div>
            </dl>
            <p data-live={live}>
              <i aria-hidden="true" />
              {live ? 'Live 3D · drag the plate to turn it' : 'Rendered by FUDDO AI'}
            </p>
          </div>
        </div>
      </section>

      <div className="lp-marquee" aria-hidden="true">
        <div>
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} data-outline={i % 2 === 1}>
              {item} <b>✦</b>
            </span>
          ))}
        </div>
      </div>

      <section className="lp-lab-section" id="lab">
        <div className="lp-section-head" data-reveal>
          <p className="lp-eyebrow">Try it right here</p>
          <h2>
            Plate it yourself. <em>Then let FUDDO.</em>
          </h2>
          <p>
            Drag the food, draw the sauce, change your mind. When you run out of ideas, one button
            re-plates the same dish twelve different ways.
          </p>
        </div>
        <PlateLab pick={pick} onPick={onPick} />
      </section>

      <Process onPick={pickAndShow} />

      <XRay />

      <section className="lp-about" id="about">
        <div data-reveal>
          <p className="lp-eyebrow">A smarter mise en place</p>
          <h2>
            Creativity belongs <em>in the kitchen.</em>
          </h2>
          <p>
            FUDDO AI gives chefs a fast, visual space to think. Less food wasted on trials. More
            ideas considered. Better decisions before the first plate reaches the pass.
          </p>
        </div>
        <ol className="lp-menu">
          {MENU.map(([title, text], i) => (
            <li key={title} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
              <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-cta" data-reveal>
        <div>
          <h2>
            Design the plate before you <em>plate the dish.</em>
          </h2>
          <p>Start with a dish name. FUDDO AI handles the components, the compositions and the review link.</p>
        </div>
        <Link href="/auth?next=/studio" className="lp-badge" aria-label="Open the studio">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <path id="lp-ring" d="M100 100m-80 0a80 80 0 1 1 160 0a80 80 0 1 1-160 0" />
            </defs>
            <text>
              <textPath href="#lp-ring" textLength="496">
                Open the studio ✦ Open the studio ✦
              </textPath>
            </text>
          </svg>
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <footer className="lp-footer">
        <Logo tagline="AI Plating Studio" size={38} />
        <nav>
          <a href="#lab">Try it</a>
          <a href="#process">How it works</a>
          <a href="#about">About</a>
          <Link href="/auth?next=/studio">Sign in</Link>
        </nav>
        <p>© {new Date().getFullYear()} FUDDO AI</p>
      </footer>
    </main>
  )
}
