import { GameError, UPLOAD_MAX_BYTES } from '@gmr/shared';
import sharp from 'sharp';

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);
const MAX_DIMENSION = 1200;

export interface ProcessedImage {
  data: Buffer;
  mime: 'image/webp';
  width: number;
  height: number;
}

/**
 * Checks the real file type from its bytes, applies EXIF orientation and re-encodes to WebP.
 * sharp drops all metadata (EXIF, GPS) unless asked to keep it (FR-48, NFR-04).
 */
export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  if (input.length > UPLOAD_MAX_BYTES) throw new GameError('UPLOAD_TOO_LARGE');
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new GameError('UPLOAD_INVALID_TYPE');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new GameError('UPLOAD_INVALID_TYPE');
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, mime: 'image/webp', width: info.width, height: info.height };
  } catch {
    // e.g. HEIC variants this sharp build cannot decode
    throw new GameError('UPLOAD_INVALID_TYPE');
  }
}
