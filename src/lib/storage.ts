import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './constants'
import { BUCKETS, supabase } from './supabase'

export function validateImage(file: File, maxBytes = MAX_IMAGE_BYTES): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return `${file.name}: only JPG, PNG or WebP images are allowed`
  if (file.size > maxBytes) return `${file.name}: larger than ${Math.round(maxBytes / 1024 / 1024)} MB`
  return null
}

/** Downscale large photos in the browser before upload (keeps uploads fast on island networks). */
export async function compressImage(file: File, maxDim = 1920, quality = 0.85): Promise<Blob> {
  if (file.type === 'image/webp' && file.size < 600_000) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 1_000_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

function safeName(ext: string) {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
}

export async function uploadPropertyImage(userId: string, propertyId: string, file: File) {
  const err = validateImage(file)
  if (err) throw new Error(err)
  const blob = await compressImage(file)
  const ext = blob.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const path = `${userId}/${propertyId}/${safeName(ext)}`
  const { error } = await supabase.storage.from(BUCKETS.propertyImages).upload(path, blob, {
    contentType: blob.type || file.type, cacheControl: '31536000', upsert: false,
  })
  if (error) throw error
  return path
}

export async function uploadAvatar(userId: string, file: File) {
  const err = validateImage(file, 2 * 1024 * 1024 * 4)
  if (err) throw new Error(err)
  const blob = await compressImage(file, 512, 0.85)
  if (blob.size > 2 * 1024 * 1024) throw new Error('Image is still larger than 2 MB after compression')
  const path = `${userId}/avatar-${safeName('jpg')}`
  const { error } = await supabase.storage.from(BUCKETS.profileImages).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
  if (error) throw error
  return supabase.storage.from(BUCKETS.profileImages).getPublicUrl(path).data.publicUrl
}
