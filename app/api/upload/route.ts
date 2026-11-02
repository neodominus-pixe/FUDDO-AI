import type { NextRequest } from 'next/server'
import { apiError, apiSuccess, route } from '@/lib/api-response'
import { guard } from '@/lib/auth'
import { backend } from '@/lib/backend'
import { sniffImage } from '@/lib/image-sniff'

// Component photos go to Supabase Storage under the uploader's own folder (the bucket policy enforces that
// too). The browser shows them by URL and the image provider reads them back from the same bucket.
const MAX_BYTES = 12 * 1024 * 1024
const UPLOADS_PER_HOUR = 60

export const POST = route(async (req: NextRequest) => {
  const g = await guard(req)
  if ('response' in g) return g.response

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 64 * 1024) return apiError('That photo is larger than the 12 MB limit.', 413)
  if (await backend.limiter.hit(`upload:${g.user.id}`, UPLOADS_PER_HOUR, 60 * 60_000)) return apiError('Too many uploads. Try again later.', 429)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return apiError('Expected a file upload.', 400)
  }
  const file = form.get('file')
  if (!(file instanceof File)) return apiError('No file received.', 400)
  if (file.size > MAX_BYTES) return apiError(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 12 MB.`, 413)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffImage(bytes)
  if (!mime) return apiError('Unsupported image. Use a JPEG, PNG or WebP photo.', 415)

  const stored = await backend.uploadPhoto(bytes, mime)
  // `path` keeps the name the studio already reads; it is now the photo's full address.
  return apiSuccess({ path: stored.url, bytes: stored.bytes, type: mime }, 201)
})
