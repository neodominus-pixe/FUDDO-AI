'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import PlatingImage from './PlatingImage'
import type { Angle, PlatingSpec } from '@/lib/types'

type CardData = {
  dishName: string
  components: Array<{ name: string; role: string }>
  name: string
  spec: PlatingSpec
  views: Record<Angle, { svg: string | null; imageUrl: string | null }>
  placement: Array<{ name: string; role: string; where: string; level: string }>
  adjustments: string[]
  portions: Array<{ name: string; count: number }>
  garnishCount: number
  sauceMarks: number
  review: { reviewer: string; pickedSpecId: string | null; comment: string; reviewedAt: string | null }
  updatedAt: string
  gltf: object | null
  isProvisional: boolean
}

const VIEW_LABEL: Record<Angle, string> = {
  'top-down': 'Overhead',
  'three-quarter': 'Service view',
  side: 'Build height',
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Rasterises the SVG in the browser, so the kitchen can be sent a plain picture
// without a server-side image pipeline.
function downloadPng(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 1000
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 1000, 1000)
      ctx.drawImage(img, 0, 0, 1000, 1000)
      canvas.toBlob((b) => b && download(b, filename), 'image/png')
    }
    URL.revokeObjectURL(url)
  }
  img.src = url
}

async function download24(url: string, filename: string) {
  const blob = await (await fetch(url)).blob()
  download(blob, filename)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plating'

import PageContainer from './PageContainer'

export default function CardClient({ projectId }: { projectId: string }) {
  const [data, setData] = useState<CardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/card/${projectId}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not build the card.')
        setData(json)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not build the card.')
      }
    })()
  }, [projectId])

  if (error) {
    return <main className="grid min-h-screen place-items-center bg-paper p-6 text-sm text-muted">{error}</main>
  }
  if (!data) {
    return <main className="grid min-h-screen place-items-center bg-paper text-sm text-muted">Building card...</main>
  }

  const base = slug(`${data.dishName}-${data.name}`)
  const detail: Array<[string, string]> = [
    ['Plate', data.spec.plate.replace(/-/g, ' ')],
    ['Composition', data.spec.composition.replace(/-/g, ' ')],
    ['Build height', data.spec.height],
    ['Sauce', data.spec.sauce === 'none' ? 'none' : `${data.spec.sauce} (${data.sauceMarks} placement${data.sauceMarks === 1 ? '' : 's'})`],
    ['Garnish', `${data.spec.garnish} (${data.garnishCount} pieces)`],
  ]

  return (
    <main className="min-h-screen bg-paper py-6 md:py-8 print:bg-white print:py-0">
      <style>{`@media print {
        .no-print { display: none !important; }
        body { background: #fff; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }`}</style>

      <PageContainer className="max-w-3xl no-print mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/studio" className="link-brand text-xs">
            &larr; Back to studio
          </Link>
          <span className="flex-1" />
          <button onClick={() => window.print()} className="btn btn-primary btn-sm">
            Print / save as PDF
          </button>
          <button
            onClick={() => {
              const v = data.views['three-quarter']
              // A real provider already gives us a PNG; only the mock's SVG needs rasterising.
              if (v?.imageUrl) download24(v.imageUrl, `${base}.png`)
              else if (v?.svg) downloadPng(v.svg, `${base}.png`)
            }}
            className="btn btn-secondary btn-sm"
          >
            Download PNG
          </button>
          <button
            onClick={async () => {
              if (!data.gltf) return
              // The hand-built meshes the viewer shows go into the file too. Loaded only when asked for, since it
              // brings three.js with it.
              const { withAuthored } = await import('./scene/authored')
              const gltf = await withAuthored(data.gltf).catch(() => data.gltf!)
              download(new Blob([JSON.stringify(gltf)], { type: 'model/gltf+json' }), `${base}.gltf`)
            }}
            className="btn btn-secondary btn-sm"
          >
            Download 3D model
          </button>
        </div>
      </PageContainer>

      <PageContainer className="max-w-3xl">
        <article className="print-sheet p-6 sm:p-10 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] print:max-w-none print:p-0 print:shadow-none">
          <header className="flex flex-col sm:flex-row items-start justify-between gap-4 sm:gap-6 border-b-2 border-stone-900 pb-4">
            <div>
              <p className="eyebrow">Plating specification</p>
              <h1 className="display mt-1.5 text-2xl md:text-3xl">{data.dishName}</h1>
              <p className="mt-0.5 text-sm text-muted">{data.name}</p>
            </div>
            <div className="sm:text-right text-xs text-muted">
              <p>{new Date(data.updatedAt).toLocaleDateString()}</p>
              {data.isProvisional ? (
                <p className="mt-1 rounded bg-amber-100 px-2 py-1 font-medium text-amber-900">
                  Provisional &mdash; not yet chosen
                </p>
              ) : (
                <p className="mt-1 rounded bg-emerald-100 px-2 py-1 font-medium text-approved">Approved for tasting</p>
              )}
            </div>
          </header>

          <section className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(Object.keys(VIEW_LABEL) as Angle[]).map((a) => (
              <figure key={a} className="rounded border border-rule-strong">
                <PlatingImage
                  svg={data.views[a]?.svg}
                  imageUrl={data.views[a]?.imageUrl}
                  className="aspect-square w-full"
                  alt={`${data.dishName}, ${VIEW_LABEL[a]}`}
                />
                <figcaption className="border-t border-rule px-2 py-1 text-center eyebrow">
                  {VIEW_LABEL[a]}
                </figcaption>
              </figure>
            ))}
          </section>

          <section className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div>
              <h2 className="eyebrow">Build</h2>
              <dl className="mt-2 space-y-1.5">
                {detail.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-dotted border-rule-strong pb-1 text-sm">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium capitalize">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h2 className="eyebrow">Components</h2>
              <ul className="mt-2 space-y-1.5">
                {data.components.filter((c) => c.name).map((c) => (
                  <li key={c.name} className="flex justify-between gap-4 border-b border-dotted border-rule-strong pb-1 text-sm">
                    <span>{c.name}</span>
                    <span className="text-muted">{c.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-7">
            <h2 className="eyebrow">Placement</h2>
            <ol className="mt-2 space-y-1.5">
              {data.placement.map((p, i) => (
                <li key={`${p.name}-${i}`} className="flex gap-3 border-b border-dotted border-rule-strong pb-1 text-sm">
                  <span className="w-5 shrink-0 text-faint">{i + 1}</span>
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-muted">{p.where}</span>
                  <span className="w-32 text-right text-muted">{p.level}</span>
                </li>
              ))}
            </ol>
            {data.spec.notes ? (
              <p className="mt-3 rounded bg-paper p-3 text-sm leading-relaxed">
                <span className="font-medium">Chef direction: </span>
                {data.spec.notes}
              </p>
            ) : null}
          </section>

          {data.adjustments?.length || data.portions?.length ? (
            <section className="mt-7">
              <h2 className="eyebrow">Chef adjustments</h2>
              <ul className="mt-2 space-y-1.5">
                {data.portions?.map((p) => (
                  <li
                    key={`portion-${p.name}`}
                    className="flex justify-between gap-4 border-b border-dotted border-rule-strong pb-1 text-sm"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted">{p.count} portions on the plate</span>
                  </li>
                ))}
                {data.adjustments?.map((a) => (
                  <li key={a} className="border-b border-dotted border-rule-strong pb-1 text-sm">
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-7 border-t border-rule-strong pt-4">
            <h2 className="eyebrow">Sign-off</h2>
            {data.review.reviewedAt ? (
              <div className="mt-2 text-sm">
                <p>
                  <span className="font-medium">{data.review.reviewer || 'Consultant'}</span> approved this plating on{' '}
                  {new Date(data.review.reviewedAt).toLocaleDateString()}.
                </p>
                {data.review.comment ? (
                  <p className="mt-2 border-l-2 border-rule-strong pl-3 italic text-ink">
                    &ldquo;{data.review.comment}&rdquo;
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Awaiting consultant approval.</p>
            )}
          </section>

          <footer className="mt-8 flex justify-between border-t border-rule pt-3 text-xs text-faint">
            <span>FUDDO AI &middot; Plating Studio</span>
            <span>Rendered from spec {data.spec.id} &middot; seed {data.spec.seed}</span>
          </footer>
        </article>
      </PageContainer>
    </main>
  )
}
