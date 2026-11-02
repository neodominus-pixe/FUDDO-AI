import type { Dish, PlatingSpec } from '../types'
import type { AdminData } from '../admin-types'
import type { IngredientTexture } from '../ingredients'

// The contract between the app and its data store. The API routes and pages talk to this interface only;
// lib/backend/supabase.ts is the implementation, and tests can supply a fake.

import type { Role } from '../roles'
export type { Role }

export type User = { id: string; name: string; email: string; role: Role; createdAt: string }

export type SpreadEntry = { name: string; spec: PlatingSpec }

export type Review = {
  reviewer: string
  pickedSpecId: string | null
  comment: string
  reviewedAt: string | null
}

export type Project = {
  id: string
  ownerId?: string
  shareId: string
  dish: Dish
  spread: SpreadEntry[]
  review: Review
  createdAt: string
  updatedAt: string
}

/** What a consultant may see through a share link. */
export type SharedProject = { id: string; dish: Dish; spread: SpreadEntry[]; review: Review }

export type CachedRender = {
  hash: string
  imageUrl: string
  provider: string
  quality: string
  costUsd: number
  latencyMs: number
}

/** The shared library of ingredient surface textures. Reading is open to everyone; making one is the server's job. */
export interface TextureStore {
  /** What is known about these keys. Without the service key only finished textures are visible. */
  lookup(keys: string[]): Promise<IngredientTexture[]>
  /** True when this caller now owns making the texture; false when it exists, or someone else is making it. */
  claim(key: string, name: string, userId: string | null): Promise<boolean>
  /** Stores the finished image and marks the texture ready. */
  complete(key: string, bytes: Uint8Array, mime: string, meta: { avgColor?: string | null; model: string; prompt: string; source: 'generated' | 'uploaded' }): Promise<IngredientTexture>
  fail(key: string, message: string): Promise<void>
  /** Gives up a claim without recording a failure, so the next caller can try straight away. */
  release(key: string): Promise<void>
  /** Administrators: everything, including pending and failed. */
  adminList(): Promise<IngredientTexture[]>
  adminDelete(key: string): Promise<void>
}

/** Errors that map straight onto an HTTP response. */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number = 500,
    readonly code?: string,
    /** Seconds until a rate-limited caller may retry. */
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'BackendError'
  }
}

export type SignUpInput = { name: string; email: string; password: string }
export type SignInInput = { email: string; password: string }

export interface RateLimiter {
  /** True when the key has used up its budget of `limit`. Does not count a hit. */
  isLimited(key: string, limit: number): Promise<boolean>
  /** Counts `cost` hits. True when that put the key over its budget of `limit`. */
  hit(key: string, limit: number, windowMs: number, cost?: number): Promise<boolean>
  clear(key: string): Promise<void>
}

export interface Backend {
  readonly kind: string

  // Accounts -----------------------------------------------------------------
  currentUser(): Promise<User | null>
  registrationOpen(): Promise<boolean>
  /** `pending` means the account exists but must confirm its email before signing in. */
  signUp(input: SignUpInput, remember: boolean): Promise<{ user: User } | { pending: true }>
  signIn(input: SignInInput, remember: boolean): Promise<User>
  signOut(): Promise<void>
  /** Emails a reset link. Says nothing about whether the address has an account. */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>
  /** Turns the one-time code from a reset link into a session. False if the link was invalid or used. */
  exchangeRecoveryCode(code: string): Promise<boolean>
  /** Sets a new password for the signed-in person and ends every other session. */
  changePassword(password: string): Promise<void>

  // Projects, as the signed-in user (owners see their own, administrators see all) ---
  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project | null>
  createProject(dish: Dish, spread: SpreadEntry[]): Promise<Project>
  updateProject(id: string, patch: { dish?: Dish; spread?: SpreadEntry[] }): Promise<Project | null>
  deleteProject(id: string): Promise<boolean>

  // Consultant review: no account, the share link is the credential -----------
  getSharedProject(shareId: string): Promise<SharedProject | null>
  submitReview(shareId: string, review: { reviewer: string; pickedSpecId: string | null; comment: string }): Promise<Review>

  // Images -------------------------------------------------------------------
  uploadPhoto(bytes: Uint8Array, mime: string): Promise<{ url: string; bytes: number }>
  /** Reads a photo this app stored. Returns null for any URL that is not one of ours. */
  readPhoto(url: string): Promise<{ bytes: Uint8Array; mime: string } | null>
  getCachedRender(hash: string): Promise<CachedRender | null>
  putCachedRender(entry: CachedRender, bytes: Uint8Array, mime: string): Promise<CachedRender>

  // Administration (all require an administrator) ---------------------------
  adminOverview(): Promise<AdminData>
  adminCreateUser(input: { name: string; email: string; password: string; role: Role }): Promise<void>
  adminUpdateUser(input: { id: string; name: string; email: string; role: Role; disabled: boolean }): Promise<void>
  adminSetPassword(id: string, password: string): Promise<void>
  adminRevokeSessions(id: string): Promise<void>
  adminClearAttempts(id: string): Promise<void>
  adminSetRegistration(open: boolean): Promise<void>
  adminUpdateProject(input: { id: string; name: string; ownerId: string }): Promise<void>
  adminRotateShare(id: string, confirm: string): Promise<void>
  adminRecord(action: string, target: string): Promise<void>

  readonly textures: TextureStore
  readonly limiter: RateLimiter
}
