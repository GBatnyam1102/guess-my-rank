import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Logger } from './logger';
import { isSelfServed, type StorageDriver } from './storage/types';

export interface HttpDeps {
  storage: StorageDriver;
  contentDir: string;
  corsOrigins: true | string[];
  log: Logger;
  health: () => Record<string, unknown>;
}

const CARD_FILE = /^[a-z0-9-]+\.svg$/;

class TooLarge extends Error {}

/** Uploads are at most UPLOAD_MAX_BYTES (10 MB), so buffering them is fine. */
async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    received += chunk.length;
    if (received > max) throw new TooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, received);
}

export function createHttpHandler(deps: HttpDeps) {
  const { storage, log } = deps;
  // Local disk and database drivers serve uploads and files through this server; R2 does not.
  const served = isSelfServed(storage) ? storage : null;

  const cors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (!origin) return;
    const allowed = deps.corsOrigins === true || deps.corsOrigins.includes(origin);
    if (!allowed) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      cors(req, res);
      const url = new URL(req.url ?? '/', 'http://localhost');
      const method = req.method ?? 'GET';
      if (method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }

      if (method === 'GET' && url.pathname === '/health') {
        send(res, 200, { ok: true, ...deps.health() });
        return;
      }

      const isRead = method === 'GET' || method === 'HEAD';

      if (isRead && url.pathname.startsWith('/content/cards/')) {
        const file = decodeURIComponent(url.pathname.slice('/content/cards/'.length));
        if (!CARD_FILE.test(file)) return send(res, 404, { error: 'not found' });
        try {
          const data = await readFile(path.join(deps.contentDir, 'cards', file));
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
          res.end(method === 'HEAD' ? undefined : data);
        } catch {
          send(res, 404, { error: 'not found' });
        }
        return;
      }

      if (served && isRead && url.pathname.startsWith('/storage/files/')) {
        const key = url.pathname.slice('/storage/files/'.length);
        const data = key.startsWith('img/') ? await served.get(key) : null;
        if (!data) return send(res, 404, { error: 'not found' });
        res.writeHead(200, {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=86400, immutable',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(method === 'HEAD' ? undefined : data);
        return;
      }

      if (served && method === 'PUT' && url.pathname.startsWith('/storage/upload/')) {
        const key = url.pathname.slice('/storage/upload/'.length);
        const max = served.verifyPut(key, url.searchParams);
        if (max === null || !key.startsWith('raw/')) return send(res, 403, { error: 'invalid upload url' });
        const declared = Number(req.headers['content-length'] ?? 0);
        if (declared > max) return send(res, 413, { error: 'too large' });
        let body: Buffer;
        try {
          body = await readBody(req, max);
        } catch (err) {
          if (err instanceof TooLarge) return send(res, 413, { error: 'too large' });
          throw err;
        }
        await served.put(key, body, req.headers['content-type'] ?? 'application/octet-stream');
        send(res, 200, { ok: true, bytes: body.length });
        return;
      }

      send(res, 404, { error: 'not found' });
    } catch (err) {
      log.error('http handler failed', { url: req.url, err });
      if (!res.headersSent) send(res, 500, { error: 'internal' });
      else res.end();
    }
  };
}
