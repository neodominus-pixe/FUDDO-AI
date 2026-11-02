import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { BackendError } from './backend/types'

export function apiSuccess<T extends object>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ...data, success: true }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function apiError(message: string, status = 400, code?: string, details?: unknown, headers?: HeadersInit): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(code ? { code } : {}),
      ...(details !== undefined ? { details } : {}),
    },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  )
}

/** Turns anything thrown inside a route into a structured response; full detail goes to the server log only. */
export function toResponse(error: unknown): NextResponse {
  if (error instanceof BackendError) {
    return apiError(error.message, error.status, error.code, undefined, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined)
  }
  if (error instanceof ZodError) return apiError('Invalid request.', 400, 'VALIDATION_ERROR', error.issues)
  console.error('[fuddo] unhandled route error:', error)
  return apiError('Something went wrong on the server. Please try again.', 500)
}

/** Wraps a route handler so an exception becomes a clean JSON error instead of an HTML 500 page. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (error) {
      return toResponse(error)
    }
  }
}

/** Reads a JSON body once, with a size cap, and reports malformed input as a 400. */
export async function readJson(request: Request, maxBytes = 512_000): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new BackendError('That request is too large.', 413)
  const text = await request.text()
  if (text.length > maxBytes) throw new BackendError('That request is too large.', 413)
  try {
    return JSON.parse(text)
  } catch {
    throw new BackendError('Invalid JSON body.', 400)
  }
}
