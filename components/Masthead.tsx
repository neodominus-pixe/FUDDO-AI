import type { ReactNode } from 'react'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

// One masthead for the chef's studio and the consultant's review, so a shared
// link is unmistakably the same product the kitchen is working in. The theme
// switch lives here because it is the bar present on every signed-in screen.
//
// On a phone the usage line ("12 images this session · mock renderer · $0.00 spent") moves to its own row
// under the bar: beside the logo it wrapped into a one-word-per-line column and pushed the theme switch
// off the screen.
export default function Masthead({ eyebrow, right }: { eyebrow: string; right?: ReactNode }) {
  return (
    <header className="masthead">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:gap-6 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Logo tagline={null} size={38} />
          <p className="eyebrow hidden border-l border-rule pl-3 sm:block">{eyebrow}</p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {right ? <div className="hidden text-right text-[11px] text-faint md:block">{right}</div> : null}
          <ThemeToggle />
        </div>
      </div>
      {right ? (
        <div className="mx-auto max-w-7xl border-t border-rule px-4 py-1.5 text-xs text-faint sm:px-8 md:hidden">{right}</div>
      ) : null}
    </header>
  )
}
