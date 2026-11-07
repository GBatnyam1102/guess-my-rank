import type { PresignedUpload } from '@gmr/shared';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { MemoryRepo } from '../src/repo/memory';
import { connectionUrl } from '../src/repo/pg';
import { DbStorage } from '../src/storage/db';
import { memoryRepo, startTestServer, TestClient, type TestServer } from './harness';

let server: TestServer | null = null;
let clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients) c.close();
  clients = [];
  await server?.dispose();
  server = null;
});

async function photoWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: '#3366ff' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'secret-owner', Copyright: 'gps-should-vanish' } })
    .toBuffer();
}

async function customRound(makeStorage?: Parameters<typeof startTestServer>[3]) {
  server = await startTestServer(undefined, undefined, undefined, makeStorage);
  const host = await TestClient.connect(server.url);
  const other = await TestClient.connect(server.url);
  clients.push(host, other);
  await host.create('Host', { imageSource: 'CUSTOM', imageCount: 5 });
  await other.join(host.code, 'Other');
  await host.ok('game:start');
  const rankerId = (await host.waitFor((v) => v.round !== null)).round!.rankerId;
  const ranker = rankerId === host.playerId ? host : other;
  const guesser = ranker === host ? other : host;
  return { ranker, guesser };
}

async function upload(client: TestClient, data: Buffer, mime = 'image/jpeg'): Promise<PresignedUpload> {
  const p = await client.ok<PresignedUpload>('upload:presign', { mime, bytes: data.length });
  const res = await fetch(new URL(p.url, server!.url), { method: 'PUT', headers: p.headers, body: data });
  expect(res.status).toBe(200);
  return p;
}

describe('custom images (FR-19, FR-20, FR-48, FR-61, NFR-04, NFR-07)', () => {
  it('uploads, strips EXIF, and lets only the Ranker manage the images', async () => {
    const { ranker, guesser } = await customRound();
    const original = await photoWithExif();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    expect(await guesser.call('upload:presign', { mime: 'image/jpeg', bytes: 100 })).toMatchObject({
      ok: false,
      error: 'NOT_RANKER',
    });

    const p = await upload(ranker, original);
    await ranker.ok('upload:done', { uploadId: p.uploadId, title: 'Миний зураг' });
    const v = await ranker.waitFor((x) => (x.round?.items?.length ?? 0) === 1);
    const item = v.round!.items![0]!;
    expect(item.title).toBe('Миний зураг');

    const served = Buffer.from(await (await fetch(new URL(item.imageUrl, server!.url))).arrayBuffer());
    const meta = await sharp(served).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();

    // A Guesser cannot see, rename or delete the Ranker's images.
    expect(guesser.view.round!.items).toBeNull();
    expect(await guesser.call('upload:remove', { itemId: item.id })).toMatchObject({ ok: false, error: 'NOT_RANKER' });
    expect(await guesser.call('upload:done', { uploadId: p.uploadId, title: 'x' })).toMatchObject({
      ok: false,
      error: 'ITEM_NOT_FOUND',
    });

    await ranker.ok('upload:remove', { itemId: item.id });
    await ranker.waitFor((x) => x.round!.items!.length === 0);
    // The file is deleted in the background right after the ack.
    let status = 0;
    for (let i = 0; i < 20 && status !== 404; i++) {
      status = (await fetch(new URL(item.imageUrl, server!.url))).status;
      if (status !== 404) await new Promise((r) => setTimeout(r, 50));
    }
    expect(status).toBe(404);
  });

  it('rejects files that are not images even with an image mime type', async () => {
    const { ranker } = await customRound();
    const p = await upload(ranker, Buffer.from('definitely not a picture'));
    expect(await ranker.call('upload:done', { uploadId: p.uploadId, title: 'fake' })).toMatchObject({
      ok: false,
      error: 'UPLOAD_INVALID_TYPE',
    });
  });

  it('refuses tampered upload URLs and oversized declarations', async () => {
    const { ranker } = await customRound();
    expect(await ranker.call('upload:presign', { mime: 'image/gif', bytes: 10 })).toMatchObject({
      ok: false,
      error: 'UPLOAD_INVALID_TYPE',
    });
    expect(await ranker.call('upload:presign', { mime: 'image/png', bytes: 11 * 1024 * 1024 })).toMatchObject({
      ok: false,
      error: 'UPLOAD_TOO_LARGE',
    });
    const p = await ranker.ok<PresignedUpload>('upload:presign', { mime: 'image/png', bytes: 10 });
    const tampered = p.url.replace(/sig=[^&]+/, 'sig=AAAA');
    const res = await fetch(new URL(tampered, server!.url), { method: 'PUT', body: Buffer.from('x') });
    expect(res.status).toBe(403);
  });
});

describe('database image storage (STORAGE_DRIVER=db, hosts without a disk)', () => {
  it('stores uploads as rows, serves the processed image, and deletes both rows', async () => {
    let repo: MemoryRepo | null = null;
    const { ranker } = await customRound((r) => {
      repo = r as MemoryRepo;
      return new DbStorage(repo, 'test-secret');
    });

    const p = await upload(ranker, await photoWithExif());
    expect(repo!.blobCount).toBe(1); // raw/
    await ranker.ok('upload:done', { uploadId: p.uploadId, title: 'DB' });
    const item = (await ranker.waitFor((x) => (x.round?.items?.length ?? 0) === 1)).round!.items![0]!;
    expect(repo!.blobCount).toBe(1); // raw/ replaced by img/

    const res = await fetch(new URL(item.imageUrl, server!.url));
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();

    await ranker.ok('upload:remove', { itemId: item.id });
    for (let i = 0; i < 20 && repo!.blobCount > 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(repo!.blobCount).toBe(0);
    expect((await fetch(new URL(item.imageUrl, server!.url))).status).toBe(404);
  });

  it('rejects a signed upload URL whose size limit was changed', async () => {
    const { ranker } = await customRound((r) => new DbStorage(r as MemoryRepo, 'test-secret'));
    const p = await ranker.ok<PresignedUpload>('upload:presign', { mime: 'image/png', bytes: 10 });
    const small = new URL(p.url, server!.url);
    small.searchParams.set('max', '5'); // breaks the signature
    expect((await fetch(small, { method: 'PUT', body: Buffer.alloc(6) })).status).toBe(403);
  });

  it('keeps recently served images in a bounded cache', async () => {
    const repo = await memoryRepo();
    const storage = new DbStorage(repo, 'secret', 1000);
    const key = (n: number) => `img/${'0'.repeat(8)}-0000-0000-0000-${String(n).padStart(12, '0')}/${'1'.repeat(8)}-0000-0000-0000-000000000000.webp`;
    for (let n = 0; n < 6; n++) await storage.put(key(n), Buffer.alloc(200, n), 'image/webp');
    for (let n = 0; n < 6; n++) expect((await storage.get(key(n)))?.[0]).toBe(n);
    await repo.deleteBlob(key(5)); // still answered from the cache (images are immutable)
    expect((await storage.get(key(5)))?.[0]).toBe(5);
    await repo.deleteBlob(key(0)); // evicted long ago: the cache holds at most 1000 bytes
    expect(await storage.get(key(0))).toBeNull();
    await storage.delete(key(5));
    expect(await storage.get(key(5))).toBeNull();
  });
});

describe('connectionUrl', () => {
  it("drops Neon's channel_binding parameter and keeps the rest", () => {
    expect(connectionUrl('postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/db?sslmode=require&channel_binding=require')).toBe(
      'postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/db?sslmode=require',
    );
    expect(connectionUrl('postgres://postgres@localhost:5432/x')).toBe('postgres://postgres@localhost:5432/x');
  });
});
