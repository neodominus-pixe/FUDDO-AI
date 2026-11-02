'use client'

import { useSyncExternalStore } from 'react'

export const THEME_KEY = 'fuddo-theme'
const DARK = '(prefers-color-scheme: dark)'

type Theme = 'light' | 'dark'

/* Light/dark switch.

   The theme lives on <html data-theme>. The inline script in app/layout.tsx sets it before the first paint from
   the stored choice or the operating system, so a dark-mode visitor never gets flashed white. This button reads
   that attribute as its source of truth (so the label can never disagree with what is on screen), flips it, and
   remembers the choice. While no choice has been stored it also follows the operating system live.

   On the server there is no attribute to read, so the button renders a neutral state and fills in after
   hydration; a mismatched label would trip hydration otherwise. */

function subscribe(notify: () => void) {
  const media = matchMedia(DARK)
  const onSystemChange = () => {
    if (!localStorage.getItem(THEME_KEY)) document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'
    notify()
  }
  media.addEventListener('change', onSystemChange)
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => {
    media.removeEventListener('change', onSystemChange)
    observer.disconnect()
  }
}

function current(): Theme {
  const set = document.documentElement.dataset.theme
  if (set === 'light' || set === 'dark') return set
  return matchMedia(DARK).matches ? 'dark' : 'light'
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore<Theme | null>(subscribe, current, () => null)

  function flip() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // Private mode or blocked storage: the switch still works for this visit.
    }
  }

  const dark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={flip}
      className={`theme-toggle ${className}`}
      data-mode={theme ?? 'light'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <span className="theme-knob">
        <svg viewBox="0 0 24 24" className="theme-sun" aria-hidden="true">
          <circle cx="12" cy="12" r="4.6" />
          <g strokeLinecap="round">
            <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
          </g>
        </svg>
        <svg viewBox="0 0 24 24" className="theme-moon" aria-hidden="true">
          <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
        </svg>
      </span>
    </button>
  )
}
