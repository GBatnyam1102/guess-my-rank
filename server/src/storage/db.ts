// Images stored as rows in PostgreSQL, for hosts without a persistent disk (Render free).
// Same signed-PUT flow as the local driver. Finished images are immutable, so recently served
// ones are kept in a small in-memory cache to spare database reads and egress.
import { UploadSigner } from './signer';
import { STORAGE_KEY, type PresignedPut, type SelfServedStorage } from './types';

export interface BlobStore {
  getBlob(key: string): Promise<Buffer | null>;
  putBlob(key: string, data: Buffer, mime: string): Promise<void>;
  deleteBlob(key: string): Promise<void>;
}

const CACHE_BYTES = 48 * 1024 * 1024;

export class DbStorage implements SelfServedStorage {
  readonly kind = 'db' as const;
  private readonly signer: UploadSigner;
  /** Insertion order = least recently used first. */
  private readonly cache = new Map<string, Buffer>();
  private cachedBytes = 0;

  constructor(
    private readonly blobs: BlobStore,
    secret: string,
    private readonly cacheBytes = CACHE_BYTES,
  ) {
    this.signer = new UploadSigner(secret);
  }

  async presignPut(key: string, mime: string, maxBytes: number): Promise<PresignedPut> {
    return this.signer.presignPut(key, mime, maxBytes);
  }

  verifyPut(key: string, query: URLSearchParams): number | null {
    return this.signer.verifyPut(key, query);
  }

  async get(key: string): Promise<Buffer | null> {
    if (!STORAGE_KEY.test(key)) return null;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const data = await this.blobs.getBlob(key);
    if (data && key.startsWith('img/')) this.remember(key, data);
    return data;
  }

  async put(key: string, data: Buffer, mime: string): Promise<void> {
    if (!STORAGE_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
    await this.blobs.putBlob(key, data, mime);
  }

  async delete(key: string): Promise<void> {
    this.forget(key);
    await this.blobs.deleteBlob(key);
  }

  publicUrl(key: string): string {
    return `/storage/files/${key}`;
  }

  private remember(key: string, data: Buffer): void {
    if (data.length > this.cacheBytes / 4) return;
    this.cache.set(key, data);
    this.cachedBytes += data.length;
    for (const [oldKey, old] of this.cache) {
      if (this.cachedBytes <= this.cacheBytes) break;
      this.cache.delete(oldKey);
      this.cachedBytes -= old.length;
    }
  }

  private forget(key: string): void {
    const data = this.cache.get(key);
    if (!data) return;
    this.cache.delete(key);
    this.cachedBytes -= data.length;
  }
}
