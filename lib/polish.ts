import 'server-only'
import { BackendError, backend } from './backend'
import { config } from './config'
import { sniffImage } from './image-sniff'
import { geminiImage } from './textures/gemini'
import { TextureError } from './textures/types'

// "Polish": the live 3D view, dressed as a photograph. The editor's frame goes to the image model along with a
// strict instruction to change how it LOOKS and nothing about what is on the plate or where, so the picture can
// be shown to a consultant as a faithful, more appetising version of the arrangement being discussed.

const MAX_FRAME_BYTES = 4 * 1024 * 1024
const DEFAULT_MODEL = 'gemini-2.5-flash-image'

export function polishPrompt(dishName: string, components: string[]): string {
  const list = components
    .map((c) => c.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 16)
    .join(', ')
  return [
    `This is a 3D preview of a plated dish${dishName.trim() ? `: "${dishName.trim().slice(0, 80)}"` : ''}${list ? `, made of ${list}` : ''}.`,
    'Re-render it as a real photograph taken in a fine-dining restaurant: a professional camera, a shallow depth of field, soft natural light, and food that looks genuinely appetising, with real textures, sheen on sauces and believable crumb and fat.',
    'Keep EXACTLY the same plate, camera angle, framing and background, and the same position, size, shape and colour of every component.',
    'Do not add, remove, move or rearrange anything. Do not add cutlery, hands, glasses, garnish that is not there, text, logos or borders.',
  ].join(' ')
}

export type Polished = { bytes: Uint8Array; mime: string; polished: boolean; provider: string }

/** The result is a real image only when a Gemini key is set; without one the frame comes back untouched and says so. */
export async function polishFrame(frame: Uint8Array, dishName: string, components: string[], userId: string): Promise<Polished> {
  const mime = sniffImage(frame)
  if (!mime) throw new BackendError('That is not a picture the studio can read.', 415)
  if (frame.byteLength > MAX_FRAME_BYTES) throw new BackendError('That frame is too large. Try a smaller window.', 413)

  const c = config()
  if (c.textureProvider !== 'gemini' || !c.geminiKey) return { bytes: frame, mime, polished: false, provider: 'none' }

  if (await backend.limiter.isLimited('polish:all', Math.max(1, Math.floor(c.texturesPerMinute / 2)))) {
    throw new BackendError('The free image allowance is busy. Try again in a minute.', 429, 'rate_limited', 30)
  }
  if (await backend.limiter.hit(`polish:user:${userId}`, c.polishPerHour, 60 * 60_000)) {
    throw new BackendError('That is a lot of polished renders for one hour. Try again a little later.', 429, 'rate_limited', 600)
  }
  await backend.limiter.hit('polish:all', Math.max(1, Math.floor(c.texturesPerMinute / 2)), 60_000)

  try {
    const model = c.geminiModel ?? DEFAULT_MODEL
    const made = await geminiImage(c.geminiKey, model, [
      { text: polishPrompt(dishName, components) },
      { inlineData: { mimeType: mime, data: Buffer.from(frame).toString('base64') } },
    ])
    return { bytes: made.bytes, mime: made.mime, polished: true, provider: `gemini:${model}` }
  } catch (error) {
    if (error instanceof TextureError) {
      throw new BackendError(error.message, error.retryable ? 503 : 502, error.retryable ? 'polish_busy' : 'polish_failed', error.retryable ? 30 : undefined)
    }
    throw error
  }
}
