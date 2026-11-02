export type MadeTexture = {
  bytes: Uint8Array
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  model: string
  prompt: string
  avgColor?: string | null
}

/** Why a texture could not be made, in words a person can act on. */
export class TextureError extends Error {
  constructor(
    message: string,
    /** True when asking again later can work (a quota, a busy service); false when something has to be fixed first. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'TextureError'
  }
}

export interface TextureProvider {
  readonly id: string
  generate(name: string): Promise<MadeTexture>
}
