import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Timings } from '@gmr/shared';
import { Server } from 'socket.io';
import { createHttpHandler } from './http';
import type { Logger } from './logger';
import { RoomManager, type GameServer } from './rooms/manager';
import { registerSocketHandlers } from './socket';
import type { Repo } from './repo/types';
import type { StorageDriver } from './storage/types';

export interface AppOptions {
  port: number;
  host?: string;
  repo: Repo;
  storage: StorageDriver;
  timings: Timings;
  log: Logger;
  contentDir: string;
  corsOrigins: true | string[];
  sweepIntervalMs: number;
  botPace?: number;
}

export interface RunningApp {
  url: string;
  manager: RoomManager;
  io: GameServer;
  close(): Promise<void>;
}

export async function startApp(opts: AppOptions): Promise<RunningApp> {
  const content = await opts.repo.loadContent();
  const manager = new RoomManager({
    repo: opts.repo,
    storage: opts.storage,
    content,
    timings: opts.timings,
    log: opts.log,
    botPace: opts.botPace,
  });
  const restored = await manager.restore();

  const httpServer = createServer(
    createHttpHandler({
      storage: opts.storage,
      contentDir: opts.contentDir,
      corsOrigins: opts.corsOrigins,
      log: opts.log,
      health: () => ({ rooms: manager.roomCount, store: opts.repo.kind, storage: opts.storage.kind }),
    }),
  );

  const io: GameServer = new Server(httpServer, {
    cors: { origin: opts.corsOrigins },
    // Detect dead phones quickly; the 60 s grace period starts once the socket drops.
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 64 * 1024,
  });
  manager.attach(io);
  registerSocketHandlers(io, manager, opts.log);

  const sweep = setInterval(() => {
    manager.sweep().catch((err: unknown) => opts.log.error('sweep failed', { err }));
  }, opts.sweepIntervalMs);
  sweep.unref();

  await new Promise<void>((resolve) => {
    if (opts.host) httpServer.listen(opts.port, opts.host, resolve);
    else httpServer.listen(opts.port, resolve);
  });
  const { port } = httpServer.address() as AddressInfo;
  opts.log.info('server listening', {
    port,
    store: opts.repo.kind,
    storage: opts.storage.kind,
    categories: content.length,
    restoredRooms: restored,
  });

  return {
    url: `http://localhost:${port}`,
    manager,
    io,
    async close() {
      clearInterval(sweep);
      await manager.shutdown();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
