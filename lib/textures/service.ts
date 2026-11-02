import 'server-only'
import { backend, BackendError } from '../backend'
import { config } from '../config'
import { normalizeIngredient, type IngredientTexture } from '../ingredients'
import { geminiTextureProvider } from './gemini'
import { mockTextureProvider } from './mock'
import { TextureError, type TextureProvider } from './types'

// Making an ingredient's texture, safely: one maker at a time per ingredient, a small shared allowance so a free
// image key is not burned through, and a clear answer whether it worked, is still being made, or cannot be made.

let warned = false
function warnOnce(message: string) {
  if (warned) return
  warned = true
  console.warn(`[fuddo] Gemini textures unavailable, painting them locally instead: ${message} (set TEXTURE_PROVIDER=mock to stop trying.)`)
}

export function textureProvider(): TextureProvider {
  const c = config()
  return c.textureProvider === 'gemini' && c.geminiKey ? geminiTextureProvider(c.geminiKey, c.geminiModel) : mockTextureProvider
}

/** Looks the textures up without making any. Names that were never asked for are simply absent from the answer. */
export async function lookupTextures(names: string[]): Promise<IngredientTexture[]> {
  const keys = names.map(normalizeIngredient).filter(Boolean)
  return backend.textures.lookup(keys)
}

/**
 * Returns the texture for an ingredient, making it first when nobody has. The caller is told what state it is
 * in: `ready` has a url, `pending` means another request is making it, `failed` carries the reason.
 */
export async function ensureTexture(name: string, userId: string | null): Promise<IngredientTexture> {
  const key = normalizeIngredient(name)
  if (!key) throw new BackendError('Enter an ingredient name.', 400)

  const [existing] = await backend.textures.lookup([key])
  if (existing && existing.status !== 'failed') return existing

  const c = config()
  // Checked before claiming, so a refusal for quota leaves nothing half-made behind.
  if (await backend.limiter.isLimited('textures:all', c.texturesPerMinute)) {
    throw new BackendError('Textures are being made as fast as the free allowance lets them. They will appear on their own.', 429, 'rate_limited', 30)
  }
  if (userId && (await backend.limiter.isLimited(`textures:user:${userId}`, c.texturesPerUserHour))) {
    throw new BackendError('That is a lot of new ingredients for one hour. Try again a little later.', 429, 'rate_limited', 600)
  }

  const owns = await backend.textures.claim(key, name.trim(), userId)
  if (!owns) {
    const [now] = await backend.textures.lookup([key])
    return now ?? { key, name: name.trim(), status: 'pending', url: null, avgColor: null, source: 'generated', error: null, updatedAt: new Date().toISOString() }
  }

  await backend.limiter.hit('textures:all', c.texturesPerMinute, 60_000)
  if (userId) await backend.limiter.hit(`textures:user:${userId}`, c.texturesPerUserHour, 60 * 60_000)
  try {
    let made
    try {
      made = await textureProvider().generate(name)
    } catch (error) {
      // The image service refused for a reason that waiting will not fix (no free image generation on this key, a bad
      // key, a missing model). The studio still works without it: paint the texture locally instead, and say why once.
      if (!(error instanceof TextureError) || error.retryable || textureProvider().id === 'mock') throw error
      warnOnce(error.message)
      made = await mockTextureProvider.generate(name)
    }
    return await backend.textures.complete(key, made.bytes, made.mime, {
      avgColor: made.avgColor ?? null,
      model: made.model,
      prompt: made.prompt,
      source: 'generated',
    })
  } catch (error) {
    if (error instanceof TextureError) {
      // A quota or a busy service is not the ingredient's fault: let the next request try again at once.
      if (error.retryable) await backend.textures.release(key)
      else await backend.textures.fail(key, error.message)
      throw new BackendError(error.message, error.retryable ? 503 : 502, error.retryable ? 'texture_busy' : 'texture_failed', error.retryable ? 30 : undefined)
    }
    await backend.textures.release(key)
    throw error
  }
}
