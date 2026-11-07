import path from 'node:path';
import { DEFAULT_TIMINGS } from '@gmr/shared';
import { startApp } from './app';
import { config } from './config';
import { catalogToContent, readCatalog, writeCards } from './content/catalog';
import { createLogger } from './logger';
import { MemoryRepo } from './repo/memory';
import { PgRepo } from './repo/pg';
import type { Repo } from './repo/types';
import { DbStorage } from './storage/db';
import { LocalStorage } from './storage/local';
import { R2Storage } from './storage/r2';
import type { StorageDriver } from './storage/types';

const log = createLogger();

async function main() {
  const catalog = await readCatalog(config.contentDir);
  await writeCards(path.join(config.contentDir, 'cards'), catalog);

  let repo: Repo;
  let pg: PgRepo | null = null;
  if (config.databaseUrl) {
    pg = new PgRepo(config.databaseUrl);
    await pg.migrate(config.migrationsDir);
    if ((await pg.loadContent()).length === 0) {
      await pg.upsertContent(catalogToContent(catalog));
      log.info('imported starter content into the database');
    }
    repo = pg;
  } else {
    log.warn('DATABASE_URL is not set: using the in-memory store, games are lost on restart');
    repo = new MemoryRepo(catalogToContent(catalog));
  }

  let storage: StorageDriver;
  if (config.storageDriver === 'r2') {
    if (!config.r2) throw new Error('STORAGE_DRIVER=r2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL');
    storage = new R2Storage(config.r2);
  } else {
    if (config.uploadSigningSecret === 'dev-only-secret' && process.env.NODE_ENV === 'production') {
      throw new Error('Set UPLOAD_SIGNING_SECRET in production');
    }
    if (config.storageDriver === 'db') {
      if (!pg) throw new Error('STORAGE_DRIVER=db needs DATABASE_URL');
      storage = new DbStorage(pg, config.uploadSigningSecret);
    } else {
      storage = new LocalStorage(config.storageDir, config.uploadSigningSecret);
    }
  }

  const app = await startApp({
    port: config.port,
    host: config.host,
    repo,
    storage,
    timings: DEFAULT_TIMINGS,
    log,
    contentDir: config.contentDir,
    corsOrigins: config.corsOrigins,
    sweepIntervalMs: config.sweepIntervalMs,
  });

  const keepAlive = config.keepAliveUrl ? startKeepAlive(config.keepAliveUrl) : null;

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    log.info('shutting down', { signal });
    if (keepAlive) clearInterval(keepAlive);
    await app.close();
    await repo.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;

/** Requests our own public URL so the host sees inbound traffic and does not put the service to sleep. */
function startKeepAlive(url: string): NodeJS.Timeout {
  log.info('keep-alive enabled', { url, everyMs: KEEPALIVE_INTERVAL_MS });
  const timer = setInterval(() => {
    fetch(url, { signal: AbortSignal.timeout(30_000) })
      .then((res) => {
        if (!res.ok) log.warn('keep-alive request failed', { status: res.status });
      })
      .catch((err: unknown) => log.warn('keep-alive request failed', { err }));
  }, KEEPALIVE_INTERVAL_MS);
  timer.unref();
  return timer;
}

main().catch((err: unknown) => {
  log.error('failed to start', { err });
  process.exit(1);
});
