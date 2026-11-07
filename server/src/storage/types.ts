export interface PresignedPut {
  /** Absolute, or relative to this server's origin (local and db drivers). */
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface StorageDriver {
  readonly kind: 'local' | 'r2' | 'db';
  /** The browser uploads straight to this URL; the server never proxies the bytes for R2. */
  presignPut(key: string, mime: string, maxBytes: number): Promise<PresignedPut>;
  get(key: string): Promise<Buffer | null>;
  put(key: string, data: Buffer, mime: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

/** A driver whose uploads and files go through this server's HTTP routes (local disk, database). */
export interface SelfServedStorage extends StorageDriver {
  readonly kind: 'local' | 'db';
  /** Returns the max allowed bytes when the signed upload URL is valid, else null. */
  verifyPut(key: string, query: URLSearchParams): number | null;
}

export function isSelfServed(storage: StorageDriver): storage is SelfServedStorage {
  return storage.kind === 'local' || storage.kind === 'db';
}

/** raw/<roomId>/<uploadId> or img/<roomId>/<uploadId>.webp */
export const STORAGE_KEY = /^(raw|img)\/[0-9a-f-]{36}\/[0-9a-f-]{36}(\.webp)?$/;
