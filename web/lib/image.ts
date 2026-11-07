import { UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES } from '@gmr/shared';

const MAX_DIMENSION = 1600;

function guessMime(file: File): string {
  if (file.type) return file.type;
  return /\.hei[cf]$/i.test(file.name) ? 'image/heic' : '';
}

/**
 * Shrinks the photo in the browser before upload: faster on mobile data, and the
 * canvas re-encode drops EXIF. If the browser cannot decode the file (e.g. HEIC
 * outside Safari) the original goes up and the server decides.
 */
export async function prepareImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (blob && blob.size > 0) return blob;
  } catch {
    // fall through
  }
  const mime = guessMime(file);
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new Error('Зөвхөн JPG, PNG, WebP эсвэл HEIC зураг оруулна.');
  }
  if (file.size > UPLOAD_MAX_BYTES) throw new Error('Зураг 10 MB-аас хэтрэхгүй байх ёстой.');
  return new Blob([file], { type: mime });
}
