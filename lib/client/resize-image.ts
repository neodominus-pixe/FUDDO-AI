// Shrinks a phone photo before it is uploaded. Component photos are reference material for an image model and
// a thumbnail in the studio: 1600 px on the long edge is plenty, and it turns a 6 MB camera JPEG into ~300 KB,
// which is the difference between an upload that works on mobile data and one that stalls.

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const MAX_EDGE = 1600

export async function prepareUpload(file: File): Promise<File> {
  if (file.size > MAX_UPLOAD_BYTES * 4) throw new Error('That photo is too large. Choose one under 48 MB.')
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPEG, PNG or WebP photo.')

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    // Small enough already: keep the original bytes untouched.
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob || blob.size >= file.size) return file.size <= MAX_UPLOAD_BYTES ? file : shrinkError()
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    // The browser could not decode it (or has no canvas). The server will judge the original.
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 12 MB.`)
    return file
  }
}

function shrinkError(): never {
  throw new Error('That photo is over 12 MB even after shrinking. Try a smaller one.')
}

/** Draws a picture (a data URL) down to at most `max` pixels a side and returns it as a JPEG data URL. */
export function shrinkDataUrl(url: string, max: number, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * k))
      canvas.height = Math.max(1, Math.round(img.height * k))
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Could not prepare the picture.'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('Could not read the picture.'))
    img.src = url
  })
}
