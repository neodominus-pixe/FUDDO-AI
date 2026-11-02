import { resolveHex } from '../palette'
import { kindFor, paintTexture, type Rgb } from './procedural'
import { encodePng } from './png'
import type { TextureProvider } from './types'

// The free, offline texture maker: it paints each food in the style of that kind of food (see procedural.ts). Not a
// photograph, but a believable surface, and it needs no key, no quota and no network. It is also what the studio
// uses when no image service is configured, and what local development and the tests run on.

const SIZE = 256

function seedOf(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}

export const mockTextureProvider: TextureProvider = {
  id: 'mock',
  async generate(name) {
    const kind = kindFor(name)
    const hex = resolveHex(name, kind === 'liquid' ? 'sauce' : 'support')
    const base = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
    const { rgb, average } = paintTexture(kind, base, seedOf(name), SIZE)
    const avg = `#${average.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
    return { bytes: encodePng(SIZE, SIZE, rgb), mime: 'image/png', model: `procedural:${kind}`, prompt: `procedural ${kind} texture for ${name}`, avgColor: avg }
  },
}
