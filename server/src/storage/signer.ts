// HMAC-signed upload URLs for drivers whose bytes go through this server (local disk, database).
// They mimic an S3 presigned PUT: the URL alone authorises one upload of at most `max` bytes.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { STORAGE_KEY, type PresignedPut } from './types';

const UPLOAD_TTL_MS = 10 * 60 * 1000;

export class UploadSigner {
  constructor(private readonly secret: string) {}

  private sign(key: string, exp: number, max: number): string {
    return createHmac('sha256', this.secret).update(`${key}\n${exp}\n${max}`).digest('base64url');
  }

  presignPut(key: string, mime: string, maxBytes: number): PresignedPut {
    const exp = Date.now() + UPLOAD_TTL_MS;
    const sig = this.sign(key, exp, maxBytes);
    const query = new URLSearchParams({ exp: String(exp), max: String(maxBytes), sig });
    return { url: `/storage/upload/${key}?${query}`, method: 'PUT', headers: { 'Content-Type': mime } };
  }

  /** Returns the max allowed bytes when the signed URL is valid, else null. */
  verifyPut(key: string, query: URLSearchParams): number | null {
    if (!STORAGE_KEY.test(key)) return null;
    const exp = Number(query.get('exp'));
    const max = Number(query.get('max'));
    const sig = query.get('sig') ?? '';
    if (!Number.isFinite(exp) || !Number.isFinite(max) || exp < Date.now()) return null;
    const expected = Buffer.from(this.sign(key, exp, max));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return max;
  }
}
