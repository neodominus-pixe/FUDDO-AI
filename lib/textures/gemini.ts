import { sniffImage } from '../image-sniff'
import { texturePrompt } from '../ingredients'
import { TextureError, type TextureProvider } from './types'

// Google's Gemini image model, over its REST API. The key is read on the server only and sent in a header, never
// in the URL (a URL ends up in logs).
//
//   GEMINI_API_KEY      from aistudio.google.com/apikey
//   GEMINI_IMAGE_MODEL  defaults to gemini-2.5-flash-image; set it to any image-capable model your key can use
//
// A free key has small per-minute and per-day allowances, so a refusal for quota is reported as retryable and
// the caller backs off instead of treating it as a broken texture.

const DEFAULT_MODEL = 'gemini-2.5-flash-image'
const MAX_BYTES = 6 * 1024 * 1024

type Part = { text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }
type Reply = {
  candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>
  promptFeedback?: { blockReason?: string }
  error?: { code?: number; message?: string; status?: string }
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

/** One image request to Gemini, with every failure turned into a TextureError that says what to do about it. */
export async function geminiImage(apiKey: string, model: string, parts: GeminiPart[]): Promise<{ bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  let res: Response
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch {
    throw new TextureError('The image service did not answer in time.', true)
  }

  const body = (await res.json().catch(() => ({}))) as Reply
  if (!res.ok) {
    const message = body.error?.message ?? `status ${res.status}`
    // A limit of 0 is not a busy service: this key's plan simply has no image generation, and waiting will not change it.
    if (res.status === 429 && /limit:\s*0\b/.test(message)) throw new TextureError('This Google key has no free image generation. Turn on billing for the key in Google AI Studio (images cost a few cents each, and each texture is made only once), or leave textures on the local stand-in.', false)
    if (res.status === 429) throw new TextureError('The free image allowance is used up for now. It resets on its own; try again in a minute.', true)
    if (res.status === 400 && /api key|API_KEY/i.test(message)) throw new TextureError('GEMINI_API_KEY was refused. Check the key in .env.', false)
    if (res.status === 401 || res.status === 403) throw new TextureError('GEMINI_API_KEY was refused, or this key may not use image generation.', false)
    if (res.status === 404) throw new TextureError(`The model "${model}" is not available to this key. Set GEMINI_IMAGE_MODEL to one that is.`, false)
    if (res.status >= 500) throw new TextureError('The image service is having trouble.', true)
    throw new TextureError(`The image service refused the request: ${message.slice(0, 160)}`, false)
  }

  if (body.promptFeedback?.blockReason) throw new TextureError('The image service declined to draw this one.', false)
  for (const part of body.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : undefined)
    if (!inline?.data) continue
    const bytes = Uint8Array.from(Buffer.from(inline.data, 'base64'))
    // What the bytes are, not what the service says they are.
    const mime = sniffImage(bytes)
    if (!mime) throw new TextureError('The image service sent something that is not a picture.', true)
    if (bytes.byteLength > MAX_BYTES) throw new TextureError('The picture came back too large.', false)
    return { bytes, mime }
  }
  throw new TextureError('The image service answered without a picture.', true)
}

export function geminiTextureProvider(apiKey: string, model = DEFAULT_MODEL): TextureProvider {
  return {
    id: `gemini:${model}`,
    async generate(name) {
      const prompt = texturePrompt(name)
      const made = await geminiImage(apiKey, model, [{ text: prompt }])
      return { ...made, model, prompt }
    },
  }
}
