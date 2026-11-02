// The ingredient texture library: names, keys and the picture that gets asked for. Shared by the server (which
// makes and stores textures) and the browser (which asks for them), so both agree what "the same ingredient" is.

export type TextureStatus = 'pending' | 'ready' | 'failed'

export type IngredientTexture = {
  key: string
  name: string
  status: TextureStatus
  /** Public address of the image; null until it is ready. */
  url: string | null
  /** Average colour of the picture, for the sides of a shape the photo is not wrapped round. */
  avgColor: string | null
  source: 'generated' | 'uploaded'
  error: string | null
  updatedAt: string
}

/**
 * One key per ingredient, however it was typed: "Seared Duck  Breast!" and "seared duck breast" are the same food
 * and share one texture. Deliberately conservative: it does not strip words, because "duck breast" and "duck
 * leg" must not share a picture.
 */
export function normalizeIngredient(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%&' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim()
}

/** What the image model is asked for. A surface, not a dish: it is wrapped onto a shape, so it has to fill the frame. */
export function texturePrompt(name: string): string {
  const food = name.trim().slice(0, 80)
  return [
    `Macro photograph looking straight down at the surface of ${food}, as served in a fine-dining restaurant.`,
    'The food fills the ENTIRE square frame, edge to edge. No plate, no table, no hands, no cutlery, no garnish from other dishes, no text, no border, no vignette.',
    'Soft, even, diffused studio light from above with no hard shadows. True natural colour, sharp realistic texture, appetising.',
    'Square image.',
  ].join(' ')
}
