import { z } from 'zod'
import type { Component, Dish, PlatingSpec, ElementTweak } from './types'
import type { SpreadEntry } from './backend/types'
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from './policy'

const Email = z.string().trim().toLowerCase().max(254).email()

export const SignupSchema = z.object({
  email: Email,
  password: z.string().min(PASSWORD_MIN, `Use a password of ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`).max(PASSWORD_MAX, `Use a password of ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`),
  name: z.string().trim().min(1).max(NAME_MAX),
  remember: z.boolean().optional(),
})

export const SigninSchema = z.object({
  email: Email,
  // No minimum here: an old or wrong password must be answered with "incorrect", not a hint about the policy.
  password: z.string().min(1).max(PASSWORD_MAX),
  remember: z.boolean().optional(),
})

export const ForgotSchema = z.object({ email: Email })

export const ResetSchema = z.object({
  password: z.string().min(PASSWORD_MIN, `Use a password of ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`).max(PASSWORD_MAX, `Use a password of ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`),
})

export const ReviewSchema = z.object({
  reviewer: z.string().trim().max(80).optional().default(''),
  pickedSpecId: z.string().max(64).nullable().optional().default(null),
  comment: z.string().trim().max(2000).optional().default(''),
})

export const ComponentRoleSchema = z.enum(['hero', 'support', 'sauce', 'garnish'])

export const ComponentSchema: z.ZodType<Component> = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  role: ComponentRoleSchema,
  // A photo the chef uploaded. Only http(s) addresses are accepted; the server additionally refuses to
  // fetch anything outside its own storage bucket.
  imagePath: z.union([z.string().max(600).regex(/^https?:\/\//), z.null()]).optional().transform((val) => val ?? null),
})

export const DishSchema: z.ZodType<Dish> = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  components: z.array(ComponentSchema).max(12),
  createdAt: z.string().max(40).default(() => new Date().toISOString()),
})

export const SauceStyleSchema = z.enum(['pooled', 'dotted', 'drizzled', 'smeared', 'aside', 'none'])
export const PlateStyleSchema = z.enum(['round-white', 'black-slate', 'square-white', 'deep-bowl', 'shallow-bowl', 'wooden-board', 'coupe-grey'])
export const CompositionSchema = z.enum(['centered', 'stacked-tall', 'off-center', 'linear', 'scattered', 'negative-space'])
export const HeightSchema = z.enum(['flat', 'low', 'medium', 'tall'])
export const GarnishDensitySchema = z.enum(['minimal', 'moderate', 'generous'])
export const AngleSchema = z.enum(['three-quarter', 'top-down', 'side'])

export const ElementTweakSchema: z.ZodType<ElementTweak> = z.object({
  h: z.number().min(0.1).max(5).optional(),
  s: z.number().min(0.1).max(5).optional(),
  c: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  r: z.number().min(-720).max(720).optional(),
  v: z.number().int().min(0).max(20).optional(),
  hidden: z.boolean().optional(),
})

// Bounds keep a hand-crafted spec (the owner can write these rows directly) from making the layout engine
// or the paid image prompt do unbounded work.
export const PlatingSpecSchema: z.ZodType<PlatingSpec> = z.object({
  id: z.string().min(1).max(64),
  composition: CompositionSchema,
  plate: PlateStyleSchema,
  sauce: SauceStyleSchema,
  height: HeightSchema,
  garnish: GarnishDensitySchema,
  notes: z.string().max(500).default(''),
  overrides: z.record(z.string().max(80), z.object({ x: z.number().min(-5).max(5), y: z.number().min(-5).max(5), e: z.number().min(-1).max(3).optional() })).default({}),
  tweaks: z.record(z.string().max(80), ElementTweakSchema).optional(),
  copies: z.record(z.string().max(64), z.number().int().min(0).max(8)).optional(),
  scene: z
    .object({
      table: z.enum(['studio', 'oak', 'marble', 'linen', 'slate', 'concrete']).optional(),
      props: z.enum(['none', 'cutlery', 'napkin', 'both']).optional(),
      light: z.enum(['studio', 'bistro', 'daylight', 'moody']).optional(),
      focus: z.boolean().optional(),
    })
    .optional(),
  brush: z
    .array(
      z.object({
        w: z.number().min(0.3).max(3),
        pts: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(2).max(64),
      }),
    )
    .max(8)
    .optional(),
  seed: z.number().int().min(0).max(4_294_967_295),
})

export const SpreadEntrySchema: z.ZodType<SpreadEntry> = z.object({
  name: z.string().max(80),
  spec: PlatingSpecSchema,
})

export const CreateProjectSchema = z.object({
  dish: DishSchema,
  spread: z.array(SpreadEntrySchema).max(24),
})

// Owners change the dish and its platings, nothing else. Ownership, the review link and the consultant's
// answer are never writable through this endpoint (the database enforces the same rule).
export const PatchProjectSchema = z.object({
  dish: DishSchema.optional(),
  spread: z.array(SpreadEntrySchema).max(24).optional(),
})
