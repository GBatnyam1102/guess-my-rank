// Cloudflare R2 through its S3 API. Configure a lifecycle rule on the bucket that
// deletes objects under raw/ after 1 day as a backstop for abandoned uploads (FR-62).
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { R2Config } from '../config';
import type { PresignedPut, StorageDriver } from './types';

export class R2Storage implements StorageDriver {
  readonly kind = 'r2' as const;
  private readonly client: S3Client;

  constructor(private readonly cfg: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async presignPut(key: string, mime: string): Promise<PresignedPut> {
    const command = new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, ContentType: mime });
    const url = await getSignedUrl(this.client, command, { expiresIn: 600 });
    return { url, method: 'PUT', headers: { 'Content-Type': mime } };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async put(key: string, data: Buffer, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: data,
        ContentType: mime,
        CacheControl: 'public, max-age=86400, immutable',
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.cfg.publicUrl}/${key}`;
  }
}
