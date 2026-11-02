import 'server-only'
import { z } from 'zod'
import { ensureDevEnv } from './env'

// Environment configuration, validated once on first use. A missing or malformed value fails here with a
// message that says what to set, instead of surfacing as an obscure error deep inside a request.

const Provider = z.enum(['mock', 'gpt-image', 'gemini-image', 'flux-kontext'])
const ModelProvider = z.enum(['mock-3d', 'meshy', 'tripo', 'rodin'])
const Quality = z.enum(['low', 'medium', 'high'])
const TextureProviderChoice = z.enum(['auto', 'mock', 'gemini'])

const Env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be your project URL, e.g. https://abcd.supabase.co'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing (Project Settings → API).'),
  // Server-only. Needed for administration, the shared rate limiter and paid-image storage.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional().or(z.literal('').transform(() => undefined)),
  IMAGE_PROVIDER: Provider.default('mock'),
  MODEL_PROVIDER: ModelProvider.default('mock-3d'),
  IMAGE_QUALITY: Quality.optional(),
  OPENAI_API_KEY: z.string().optional(),
  // Ingredient textures. `auto` uses Gemini when a key is set and the free local stand-in otherwise.
  TEXTURE_PROVIDER: TextureProviderChoice.default('auto'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().max(80).optional(),
  // Textures made per minute across everyone (a free key allows only a few) and per chef per hour.
  TEXTURES_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(6),
  TEXTURES_PER_USER_HOUR: z.coerce.number().int().min(1).max(1000).default(40),
  // Polished photographs per chef per hour: each one is a whole image, so the allowance is small.
  POLISH_PER_HOUR: z.coerce.number().int().min(1).max(500).default(12),
  // Trust X-Forwarded-For for the client address. Only enable behind a proxy that sets it (Vercel, Cloudflare, nginx).
  TRUST_PROXY: z.enum(['0', '1', 'true', 'false']).optional(),
  // Paid images per user per hour, as a spend guard.
  GENERATION_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(120),
})

export type Config = {
  supabaseUrl: string
  anonKey: string
  serviceKey: string | undefined
  imageProvider: z.infer<typeof Provider>
  modelProvider: z.infer<typeof ModelProvider>
  trustProxy: boolean
  generationLimitPerHour: number
  textureProvider: 'mock' | 'gemini'
  geminiKey: string | undefined
  geminiModel: string | undefined
  texturesPerMinute: number
  texturesPerUserHour: number
  polishPerHour: number
  /** Things worth telling the operator about at startup. */
  warnings: string[]
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

let cached: Config | undefined

/** What the server actually received, without revealing a secret: the project URL is shown (it is not secret), keys by length only. */
function describeReceived(): string {
  const key = (name: string) => {
    const v = process.env[name]
    return v === undefined ? 'not set' : v === '' ? 'set but EMPTY' : `${v.length} characters`
  }
  const all = process.env // aliased so the bundler cannot freeze these values at compile time (see lib/env.ts)
  const url = all['NEXT_PUBLIC_SUPABASE_URL']
  const urlText = url === undefined ? 'not set' : url === '' ? 'set but EMPTY' : url.length <= 80 ? `"${url}"` : `${url.length} characters`
  return `Received: NEXT_PUBLIC_SUPABASE_URL = ${urlText}; ANON_KEY = ${key('NEXT_PUBLIC_SUPABASE_ANON_KEY')}; SERVICE_ROLE_KEY = ${key('SUPABASE_SERVICE_ROLE_KEY')}.`
}

export function config(): Config {
  if (cached) return cached
  ensureDevEnv()
  const parsed = Env.safeParse(process.env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || 'env'}: ${i.message}`)
    throw new ConfigError(
      `FUDDO AI is not configured.\n${lines.join('\n')}\n${describeReceived()}\n` +
        'Next.js reads .env.local first, then .env. A variable already set in the terminal you started the server from beats both:\n' +
        '  PowerShell:  Get-ChildItem Env:NEXT_PUBLIC_SUPABASE*, Env:SUPABASE*   (remove one with: Remove-Item Env:NAME)\n' +
        'Fix the value, then restart the server (Ctrl+C, npm run dev). See README → Setup.',
    )
  }
  const env = parsed.data
  const warnings: string[] = []

  if (env.IMAGE_PROVIDER !== 'mock' && !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ConfigError(
      `IMAGE_PROVIDER=${env.IMAGE_PROVIDER} needs SUPABASE_SERVICE_ROLE_KEY: generated images are stored in Supabase Storage so a review link never has to pay for a second render.`,
    )
  }
  if (env.IMAGE_PROVIDER === 'gpt-image' && !env.OPENAI_API_KEY) {
    throw new ConfigError('IMAGE_PROVIDER=gpt-image needs OPENAI_API_KEY.')
  }
  if (env.TEXTURE_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
    throw new ConfigError('TEXTURE_PROVIDER=gemini needs GEMINI_API_KEY (aistudio.google.com/apikey).')
  }
  const textureProvider = env.TEXTURE_PROVIDER === 'mock' ? 'mock' : env.GEMINI_API_KEY ? 'gemini' : 'mock'
  if (textureProvider === 'mock') warnings.push('Ingredient textures use the local stand-in. Set GEMINI_API_KEY for photographic ones.')
  if (!env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Ingredient textures need SUPABASE_SERVICE_ROLE_KEY to be stored and shared.')
  if (env.IMAGE_PROVIDER === 'mock') warnings.push('Image provider is "mock": platings are drawn locally and cost nothing.')
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push('SUPABASE_SERVICE_ROLE_KEY is not set: the admin dashboard is disabled and sign-in throttling is per-process only.')
  }

  const trust = env.TRUST_PROXY
  cached = {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ''),
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    imageProvider: env.IMAGE_PROVIDER,
    modelProvider: env.MODEL_PROVIDER,
    trustProxy: trust === '1' || trust === 'true' || (trust === undefined && !!process.env.VERCEL),
    generationLimitPerHour: env.GENERATION_LIMIT_PER_HOUR,
    textureProvider,
    geminiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_IMAGE_MODEL || undefined,
    texturesPerMinute: env.TEXTURES_PER_MINUTE,
    texturesPerUserHour: env.TEXTURES_PER_USER_HOUR,
    polishPerHour: env.POLISH_PER_HOUR,
    warnings,
  }
  if (process.env.NODE_ENV !== 'test') for (const w of cached.warnings) console.warn(`[fuddo] ${w}`)
  return cached
}
