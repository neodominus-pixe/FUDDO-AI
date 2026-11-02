import Link from 'next/link'
import ThemeToggle from './ThemeToggle'

/** The animated plating illustration beside every sign-in screen. */
export default function AuthArt() {
  return (
    <>
      <Link href="/" className="auth-back">
        ← Back home
      </Link>
      <div className="auth-tools">
        <ThemeToggle />
      </div>
      <section className="auth-art">
        <div className="auth-rings" />
        <div className="auth-plating" aria-label="Animated plating concept">
          <div className="auth-plate">
            <span className="burger-shadow" />
            <span className="burger-layer bun-bottom" />
            <span className="burger-layer lettuce" />
            <span className="burger-layer patty" />
            <span className="burger-layer cheese" />
            <span className="burger-layer tomato" />
            <span className="burger-layer bun-top">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="burger-pin pin-one">01</span>
            <span className="burger-pin pin-two">02</span>
          </div>
          <div className="scan-line" />
          <p className="phase phase-one">01 · COMPOSE</p>
          <p className="phase phase-two">02 · REFINE</p>
          <p className="phase phase-three">03 · SERVE</p>
        </div>
        <div>
          <p>DESIGN BEFORE SERVICE</p>
          <h1>
            Every great plate
            <br />
            starts with an idea.
          </h1>
        </div>
      </section>
    </>
  )
}
