'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import Logo, { Mark } from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'
import HeroPlate from '@/components/HeroPlate'
import { usePrefersReducedMotion } from '@/lib/client/hooks'

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
      { rootMargin: '0px 0px -12% 0px' },
    )
    targets.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

/* A number that counts up the first time it scrolls into view. */
function Count({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLElement>(null)
  const [value, setValue] = useState(0)
  // No animation to run: show the final number straight away.
  const reduced = usePrefersReducedMotion()
  const canObserve = useSyncExternalStore(() => () => {}, () => 'IntersectionObserver' in window, () => true)
  const instant = reduced || !canObserve

  useEffect(() => {
    const node = ref.current
    if (!node || instant) return
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      const started = performance.now()
      const tick = (now: number) => {
        const t = Math.min((now - started) / 900, 1)
        // Ease out, so it sprints then settles rather than crawling to the end.
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))))
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    io.observe(node)
    return () => io.disconnect()
  }, [to, instant])

  return (
    <b ref={ref}>
      {prefix}
      {instant ? to : value}
      {suffix}
    </b>
  )
}

export default function Home() {
  const [menu, setMenu] = useState(false)
  const [stuck, setStuck] = useState(false)
  const [concept, setConcept] = useState(0)
  const [split, setSplit] = useState(55)

  useReveal()

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks: ReactNode = (
    <>
      <a href="#process" onClick={() => setMenu(false)}>
        How it works
      </a>
      <a href="#about" onClick={() => setMenu(false)}>
        About
      </a>
    </>
  )

  return (
    <main className="landing">
      <header className="land-nav" data-stuck={stuck}>
        <Link href="/" aria-label="FUDDO AI home">
          <Logo tagline="AI Plating Studio" size={42} />
        </Link>
        <nav className={menu ? 'open' : ''}>
          {navLinks}
        </nav>
        <div className="nav-tools flex items-center gap-4">
          <Link href="/auth?next=/studio" className="nav-button text-white" onClick={() => setMenu(false)}>
            Enter studio <span aria-hidden="true">↗</span>
          </Link>
          <ThemeToggle />
          <button
            className="hamb"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-label="Toggle menu"
          >
            <i />
            <i />
          </button>
        </div>
      </header>

      <section className="land-hero">
        <div className="land-copy">
          <p className="land-kicker">AI-powered culinary design</p>
          <h1>
            Your vision.
            <br />
            Plated <em>beautifully.</em>
          </h1>
          <p className="lead">
            FUDDO AI turns a list of ingredients into considered plating concepts in seconds.
            Explore, refine and share every idea long before service begins.
          </p>
          <div className="land-actions">
            <Link href="/auth?next=/studio" className="brand-button">
              Create your first plate <span aria-hidden="true">→</span>
            </Link>
            <a href="#process" className="ghost-button">
              <b aria-hidden="true">▶</b> See how it works
            </a>
          </div>
          <div className="chef-note">
            <span aria-hidden="true">
              <Mark />
            </span>
            <div>
              <b>Built with chefs, for chefs</b>
              <small>From first sketch to final service</small>
            </div>
          </div>
        </div>

        <HeroPlate index={concept} onIndexChange={setConcept} />
      </section>

      <section className="stats" data-reveal>
        <p>One dish. Endless possibilities.</p>
        <div>
          <Count to={12} suffix="×" />
          <span>Concepts in one generation</span>
        </div>
        <div>
          <Count to={60} prefix="<" suffix="s" />
          <span>From idea to visual</span>
        </div>
        <div>
          <b>3D</b>
          <span>Interactive refinement</span>
        </div>
      </section>

      <section className="process" id="process">
        <div className="center-title" data-reveal>
          <p className="land-kicker">The creative process</p>
          <h2>
            From thought to plate,
            <br />
            <em>without the waste.</em>
          </h2>
          <p>
            Three steps, one afternoon, no produce in the bin. The kitchen decides on a picture
            instead of a service.
          </p>
        </div>
        <div className="step-grid">
          {[
            ['01', '✎', 'Describe the dish', 'Add components, roles and reference photos of your own food.'],
            ['02', '✦', 'Explore concepts', 'Generate twelve distinct compositions in seconds and keep the ones worth keeping.'],
            ['03', '◎', 'Refine and share', 'Adjust every detail, then send a review link and get one decision back.'],
          ].map((step, i) => (
            <article key={step[0]} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
              <strong>{step[0]}</strong>
              <i aria-hidden="true">{step[1]}</i>
              <h3>{step[2]}</h3>
              <p>{step[3]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="compare-section">
        <div data-reveal>
          <p className="land-kicker">Sketch to service</p>
          <h2>See the idea and the plate side by side.</h2>
          <p>
            Every concept keeps its blueprint — the geometry the composition was built on. Drag to
            check the plate your team will actually send against the structure behind it.
          </p>
        </div>
        <div className="compare" data-reveal style={{ '--split': `${split}%` } as CSSProperties}>
          <div className="blueprint" />
          <div className="rendered">
            {/* The same render the hero opens on, so the blueprint being
                compared is the blueprint of a plate already on this page. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/hero/classic-centred.png" alt="" />
          </div>
          <span className="compare-line" />
          <input
            type="range"
            min={8}
            max={92}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Compare the blueprint with the finished plate"
          />
          <small>Blueprint</small>
          <small>Plated</small>
        </div>
      </section>

      <section className="land-about" id="about">
        <div className="brand-panel" data-reveal>
          <Mark title="FUDDO AI" />
          <p className="text-white font-bold tracking-widest uppercase opacity-100">FUDDO AI</p>
        </div>
        <div data-reveal>
          <p className="land-kicker">A smarter mise en place</p>
          <h2>
            Creativity belongs
            <br />
            <em>in the kitchen.</em>
          </h2>
          <p>
            FUDDO AI gives chefs a fast, visual space to think. Less food wasted on trials. More
            ideas considered. Better decisions before the first plate reaches the pass.
          </p>
          <Link href="/studio">
            Meet your new creative partner <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="land-cta" data-reveal>
        <h2>Design the plate before you plate the dish.</h2>
        <p>
          Start with a dish name. FUDDO AI handles the components, the compositions and the
          review link.
        </p>
        <Link href="/auth?next=/studio" className="brand-button">
          Open the studio <span aria-hidden="true">→</span>
        </Link>
      </section>

      <footer>
        <Logo tagline="AI Plating Studio" size={38} />
        <nav>
          <a href="#process">How it works</a>
          <a href="#about">About</a>
          <Link href="/auth?next=/studio">Sign in</Link>
        </nav>
        <p>© {new Date().getFullYear()} FUDDO AI</p>
      </footer>
    </main>
  )
}
