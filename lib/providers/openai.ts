import { priceForImage } from '../pricing'
import { backend } from '../backend'
import type { GenerateRequest, GenerateResult, ImageProvider } from './types'

// OpenAI gpt-image-1. Needs an API key from platform.openai.com -- a ChatGPT
// subscription does not grant API access and its credit is billed separately.
//
// The provider only talks to OpenAI. It returns the image bytes; render.ts stores them in Supabase Storage
// and caches the URL, so a picture is paid for once however many times it is viewed.

function model() {
  return process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1'
}

/** Component photos the chef uploaded, read back from our own bucket only. */
async function references(req: GenerateRequest) {
  const out: Array<{ blob: Blob; filename: string }> = []
  for (const c of req.dish.components) {
    if (!c.imagePath) continue
    const photo = await backend.readPhoto(c.imagePath)
    // A missing photo should degrade to text-only, not fail the whole spread.
    if (!photo) continue
    out.push({ blob: new Blob([new Uint8Array(photo.bytes)], { type: photo.mime }), filename: `${c.id}.${photo.mime.split('/')[1]}` })
  }
  return out
}

async function fetchBytes(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error('Failed to fetch the generated image from OpenAI.')
  return new Uint8Array(await res.arrayBuffer())
}

export const openaiProvider: ImageProvider = {
  id: 'gpt-image',
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const key = process.env.OPENAI_API_KEY
    if (!key) {
      throw new Error('OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.')
    }

    const started = Date.now()
    const refs = await references(req)

    // With component photos attached, the edits endpoint conditions on them --
    // the difference between the chef's dish and a generic one. With no photos
    // there is nothing to condition on, so fall back to plain generation.
    let res: Response
    if (refs.length > 0) {
      const form = new FormData()
      form.append('model', model())
      form.append('prompt', req.prompt)
      form.append('size', '1024x1024')
      form.append('quality', req.quality)
      form.append('n', '1')
      for (const r of refs) form.append('image[]', r.blob, r.filename)
      res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      })
    } else {
      res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model(), prompt: req.prompt, size: '1024x1024', quality: req.quality, n: 1 }),
        signal: AbortSignal.timeout(120_000),
      })
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      // Billing, quota and content refusals are all actionable, so pass the
      // provider's own wording through rather than a generic failure.
      throw new Error(`OpenAI image request failed (${res.status}): ${detail.slice(0, 400)}`)
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
    const first = json.data?.[0]
    // gpt-image-1 always returns base64; older models return a short-lived URL, which must be copied out at once.
    const bytes = first?.b64_json ? new Uint8Array(Buffer.from(first.b64_json, 'base64')) : first?.url ? await fetchBytes(first.url) : null
    if (!bytes) throw new Error('OpenAI returned no image.')

    return {
      svg: null,
      image: { bytes, mime: 'image/png' },
      costUsd: priceForImage('gpt-image', req.quality),
      latencyMs: Date.now() - started,
    }
  },
}
