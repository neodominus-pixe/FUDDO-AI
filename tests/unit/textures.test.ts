import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { inflateSync } from 'node:zlib'
import { normalizeIngredient, texturePrompt } from '@/lib/ingredients'
import { polishPrompt } from '@/lib/polish'
import { geminiTextureProvider } from '@/lib/textures/gemini'
import { mockTextureProvider } from '@/lib/textures/mock'
import { KNOWN_INGREDIENTS } from '@/lib/palette'
import { TEMPLATE_COMPONENT_NAMES } from '@/lib/suggest'
import { kindFor } from '@/lib/textures/procedural'
import { encodePng } from '@/lib/textures/png'
import { TextureError } from '@/lib/textures/types'

describe('ingredient keys', () => {
  it('treat differently typed names of one food as the same', () => {
    const key = normalizeIngredient('Seared duck breast')
    for (const same of ['seared duck breast', '  Seared   Duck Breast  ', 'SEARED DUCK BREAST!', 'Seared duck breast.']) {
      assert.equal(normalizeIngredient(same), key)
    }
    assert.equal(normalizeIngredient('Crème fraîche'), 'creme fraiche')
  })

  it('keep different foods apart', () => {
    assert.notEqual(normalizeIngredient('duck breast'), normalizeIngredient('duck leg'))
    assert.notEqual(normalizeIngredient('seared duck breast'), normalizeIngredient('duck breast'))
  })

  it('are bounded and never empty for a real name', () => {
    assert.ok(normalizeIngredient('x'.repeat(500)).length <= 80)
    assert.equal(normalizeIngredient('   '), '')
    assert.equal(normalizeIngredient('!!!'), '')
    assert.equal(normalizeIngredient('"; drop table --'), 'drop table --')
  })
})

describe('texture prompt', () => {
  it('asks for a surface that fills the frame, and names the food', () => {
    const p = texturePrompt('red wine jus')
    assert.match(p, /red wine jus/)
    assert.match(p, /ENTIRE square frame/)
    assert.match(p, /No plate/)
  })

  it('cannot be extended by a long name', () => {
    assert.ok(!texturePrompt('a'.repeat(5000)).includes('a'.repeat(100)))
  })
})

describe('png writer', () => {
  it('writes a valid PNG whose pixels read back', () => {
    const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30])
    const png = encodePng(2, 2, rgb)
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    // IHDR, then IDAT: inflate the data and check the four pixels, each row led by a filter byte.
    const view = new DataView(png.buffer, png.byteOffset)
    assert.equal(view.getUint32(16), 2)
    assert.equal(view.getUint32(20), 2)
    const idatLength = view.getUint32(33)
    const raw = inflateSync(png.subarray(41, 41 + idatLength))
    assert.deepEqual([...raw], [0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 10, 20, 30])
  })

  it('refuses pixels that do not match the size', () => {
    assert.throws(() => encodePng(2, 2, new Uint8Array(5)))
  })
})

describe('local stand-in provider', () => {
  it('makes a PNG in the ingredient colour, the same one every time', async () => {
    const a = await mockTextureProvider.generate('beetroot')
    const b = await mockTextureProvider.generate('beetroot')
    assert.equal(a.mime, 'image/png')
    assert.deepEqual([...a.bytes], [...b.bytes])
    assert.match(a.avgColor ?? '', /^#[0-9a-f]{6}$/)
    const c = await mockTextureProvider.generate('salmon')
    assert.notDeepEqual([...a.bytes], [...c.bytes])
  })
})

describe('procedural textures', () => {
  it('paint each food in the style of that kind of food', () => {
    const kinds: Record<string, string> = {
      'Seared duck breast': 'meat',
      'Beef patty': 'meat',
      'Red wine jus': 'liquid',
      'Celeriac puree': 'smooth',
      'Micro chervil': 'leaf',
      Breadcrumbs: 'grain',
      'Brioche bun': 'bread',
      Tagliatelle: 'strands',
      Asparagus: 'veg',
    }
    for (const [name, kind] of Object.entries(kinds)) assert.equal(kindFor(name), kind, name)
  })

  it('recognise every food the studio already knows by name, so none is left as undifferentiated noise', () => {
    const plain = [...new Set([...TEMPLATE_COMPONENT_NAMES, ...KNOWN_INGREDIENTS])].filter((n) => kindFor(n) === 'plain')
    assert.deepEqual(plain, [])
  })

  it('reads roots, fruit, drinks and sauces by name', () => {
    const expected: Record<string, string> = {
      Potato: 'root',
      celeriac: 'root',
      mango: 'fruit',
      zucchini: 'veg',
      corn: 'grain',
      champagne: 'liquid',
      'beurre noisette': 'liquid',
      'Sauce Diane': 'liquid',
      'Seared duck breast': 'meat',
      strawberry: 'fruit',
      Blueberries: 'fruit',
      lemon: 'fruit',
      'cherry tomato': 'fruit',
      'lemon zest': 'fruit',
      'Lettuce & tomato': 'smooth',
      'pea shoots': 'leaf',
    }
    for (const [name, kind] of Object.entries(expected)) assert.equal(kindFor(name), kind, name)
  })

  it('never paint two different foods the same picture, nor one food differently twice', async () => {
    const a = await mockTextureProvider.generate('Charred baby leek')
    const b = await mockTextureProvider.generate('Asparagus')
    assert.notDeepEqual([...a.bytes], [...b.bytes])
    assert.deepEqual([...(await mockTextureProvider.generate('Asparagus')).bytes], [...b.bytes])
    assert.match(a.model, /^procedural:/)
  })
})

describe('Gemini provider', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const reply = (status: number, body: unknown) => {
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch
  }
  const png = Buffer.from(encodePng(1, 1, Uint8Array.from([9, 9, 9]))).toString('base64')

  it('sends the key in a header, never in the address, and returns the picture', async () => {
    let seen: { url: string; headers: Headers; body: string } | null = null
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), headers: new Headers(init.headers), body: String(init.body) }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'here you go' }, { inlineData: { mimeType: 'image/png', data: png } }] } }] }), { status: 200 })
    }) as typeof fetch
    const made = await geminiTextureProvider('SECRET-KEY', 'some-model').generate('duck breast')
    assert.equal(made.mime, 'image/png')
    assert.ok(seen)
    const s = seen as { url: string; headers: Headers; body: string }
    assert.ok(!s.url.includes('SECRET-KEY'))
    assert.equal(s.headers.get('x-goog-api-key'), 'SECRET-KEY')
    assert.match(s.url, /models\/some-model:generateContent/)
    assert.match(s.body, /duck breast/)
  })

  it('believes the bytes, not the label', async () => {
    reply(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('<html>not a picture</html>').toString('base64') } }] } }] })
    await assert.rejects(() => geminiTextureProvider('k').generate('x'), (e: unknown) => e instanceof TextureError && e.retryable)
  })

  it('treats a quota refusal as retryable and a bad key as not', async () => {
    reply(429, { error: { code: 429, message: 'quota' } })
    await assert.rejects(() => geminiTextureProvider('k').generate('x'), (e: unknown) => e instanceof TextureError && e.retryable && /allowance/.test(e.message))
    reply(403, { error: { code: 403, message: 'denied' } })
    await assert.rejects(() => geminiTextureProvider('k').generate('x'), (e: unknown) => e instanceof TextureError && !e.retryable)
    reply(404, { error: { code: 404, message: 'no such model' } })
    await assert.rejects(() => geminiTextureProvider('k', 'nope').generate('x'), (e: unknown) => e instanceof TextureError && !e.retryable && /nope/.test(e.message))
    reply(503, { error: { code: 503, message: 'busy' } })
    await assert.rejects(() => geminiTextureProvider('k').generate('x'), (e: unknown) => e instanceof TextureError && e.retryable)
  })

  it('says plainly when the key has no image generation at all, and does not suggest waiting', async () => {
    reply(429, { error: { code: 429, message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-2.5-flash-image' } })
    await assert.rejects(() => geminiTextureProvider('k').generate('x'), (e: unknown) => e instanceof TextureError && !e.retryable && /billing/.test(e.message))
  })

  it('reports a blocked or empty answer without a picture', async () => {
    reply(200, { promptFeedback: { blockReason: 'SAFETY' } })
    await assert.rejects(() => geminiTextureProvider('k').generate('x'), (e: unknown) => e instanceof TextureError && !e.retryable)
    reply(200, { candidates: [{ content: { parts: [{ text: 'sorry' }] } }] })
    await assert.rejects(() => geminiTextureProvider('k').generate('x'), (e: unknown) => e instanceof TextureError && e.retryable)
  })

  it('treats a network failure as retryable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    await assert.rejects(() => geminiTextureProvider('k').generate('x'), (e: unknown) => e instanceof TextureError && e.retryable)
  })
})

describe('polish prompt', () => {
  it('names the dish and its parts, and forbids moving or adding anything', () => {
    const p = polishPrompt('Seared duck', ['Duck breast', 'Red wine jus'])
    assert.match(p, /Seared duck/)
    assert.match(p, /Duck breast, Red wine jus/)
    assert.match(p, /EXACTLY the same plate, camera angle, framing/)
    assert.match(p, /Do not add, remove, move or rearrange anything/)
  })

  it('stays bounded however much it is given', () => {
    const p = polishPrompt('x'.repeat(5000), Array.from({ length: 100 }, (_, i) => `ingredient ${i} ${'y'.repeat(300)}`))
    assert.ok(p.length < 2500)
  })
})

describe('the colour of a fish that names no species', () => {
  it('is pale flesh, whichever role it plays, not a hue made up from its name', async () => {
    const { ingredientHsl } = await import('@/lib/palette')
    for (const name of ['Fish fillet', 'White fish', 'fish']) {
      for (const role of ['hero', 'support']) {
        const [h, s, l] = ingredientHsl(name, role)
        assert.ok(h >= 30 && h <= 50 && s < 30 && l > 75, `${name} as ${role}: ${h} ${s} ${l}`)
      }
    }
  })
})
