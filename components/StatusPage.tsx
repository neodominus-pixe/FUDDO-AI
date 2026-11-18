import type { ReactNode } from 'react'
import Logo from '@/components/Logo'

/** The page shown when there is nothing else to show: an address that does not exist, or something that broke. */
export default function StatusPage({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 bg-paper px-6 py-16 text-center text-ink">
      <Logo tagline="AI Plating Studio" size={42} />
      <div className="flex max-w-md flex-col items-center gap-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <div className="text-base leading-relaxed text-muted">{children}</div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>
    </main>
  )
}
