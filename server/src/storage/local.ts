// Development stand-in for R2: files on disk, uploads through an HMAC-signed PUT URL
// that mimics a presigned URL.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { UploadSigner } from './signer';
import { STORAGE_KEY, type PresignedPut, type SelfServedStorage } from './types';

export class LocalStorage implements SelfServedStorage {
  readonly kind = 'local' as const;
  private readonly signer: UploadSigner;

  constructor(
    readonly dir: string,
    secret: string,
  ) {
    this.signer = new UploadSigner(secret);
  }

  async presignPut(key: string, mime: string, maxBytes: number): Promise<PresignedPut> {
    return this.signer.presignPut(key, mime, maxBytes);
  }

  verifyPut(key: string, query: URLSearchParams): number | null {
    return this.signer.verifyPut(key, query);
  }

  filePath(key: string): string | null {
    if (!STORAGE_KEY.test(key)) return null;
    return path.join(this.dir, ...key.split('/'));
  }

  async get(key: string): Promise<Buffer | null> {
    const file = this.filePath(key);
    if (!file) return null;
    try {
      return await readFile(file);
    } catch {
      return null;
    }
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.filePath(key);
    if (!file) throw new Error(`Invalid storage key: ${key}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async delete(key: string): Promise<void> {
    const file = this.filePath(key);
    if (file) await rm(file, { force: true });
  }

  publicUrl(key: string): string {
    return `/storage/files/${key}`;
  }
}
