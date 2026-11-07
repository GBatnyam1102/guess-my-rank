import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AckResult, ClientToServerEvents, PlayerView, ServerToClientEvents, Timings } from '@gmr/shared';
import { io, type Socket } from 'socket.io-client';
import { startApp, type RunningApp } from '../src/app';
import { catalogToContent, readCatalog } from '../src/content/catalog';
import { silentLogger } from '../src/logger';
import { MemoryRepo } from '../src/repo/memory';
import type { Repo } from '../src/repo/types';
import { LocalStorage } from '../src/storage/local';
import type { StorageDriver } from '../src/storage/types';

export const contentDir = path.resolve(import.meta.dirname, '../content');

export const FAST: Timings = {
  disconnectGraceMs: 400,
  hostGraceMs: 400,
  rankingRandomMs: 10_000,
  rankingCustomMs: 10_000,
  guessingMs: 10_000,
  revealMs: 400,
  skippedRoundMs: 200,
};

export async function memoryRepo(): Promise<MemoryRepo> {
  return new MemoryRepo(catalogToContent(await readCatalog(contentDir)));
}

export interface TestServer extends RunningApp {
  storageDir: string;
  repo: Repo;
  dispose(): Promise<void>;
}

export async function startTestServer(
  repo?: Repo,
  storageDir?: string,
  timings: Timings = FAST,
  makeStorage: (repo: Repo, dir: string) => StorageDriver = (_repo, dir) => new LocalStorage(dir, 'test-secret'),
): Promise<TestServer> {
  // Bots think for a few milliseconds instead of seconds.
  const botPace = 0.01;
  const dir = storageDir ?? (await mkdtemp(path.join(os.tmpdir(), 'gmr-uploads-')));
  const store = repo ?? (await memoryRepo());
  const app = await startApp({
    port: 0,
    host: '127.0.0.1',
    repo: store,
    storage: makeStorage(store, dir),
    timings,
    log: silentLogger,
    contentDir,
    corsOrigins: true,
    sweepIntervalMs: 60_000,
    botPace,
  });
  return {
    ...app,
    url: app.url.replace('localhost', '127.0.0.1'),
    storageDir: dir,
    repo: store,
    async dispose() {
      await app.close();
      if (!storageDir) await rm(dir, { recursive: true, force: true });
    },
  };
}

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class TestClient {
  states: PlayerView[] = [];
  playerId = '';
  sessionToken = '';
  code = '';
  private listeners = new Set<() => void>();

  private constructor(readonly socket: ClientSocket) {
    socket.on('state', (v) => {
      this.states.push(v);
      for (const l of this.listeners) l();
    });
  }

  static async connect(url: string): Promise<TestClient> {
    const socket: ClientSocket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return new TestClient(socket);
  }

  get view(): PlayerView {
    const v = this.states[this.states.length - 1];
    if (!v) throw new Error('no state yet');
    return v;
  }

  async call<T = null>(event: keyof ClientToServerEvents, payload?: unknown): Promise<AckResult<T>> {
    const s = this.socket as unknown as {
      timeout(ms: number): { emitWithAck(ev: string, ...args: unknown[]): Promise<AckResult<T>> };
    };
    return payload === undefined
      ? s.timeout(3000).emitWithAck(event)
      : s.timeout(3000).emitWithAck(event, payload);
  }

  async ok<T = null>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    const res = await this.call<T>(event, payload);
    if (!res.ok) throw new Error(`${event} failed: ${res.error}`);
    return res.data;
  }

  async create(nickname: string, settings: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
    const joined = await this.ok<{ code: string; playerId: string; sessionToken: string }>('room:create', {
      nickname,
      settings: { maxPlayers: 10, imageCount: 5, imageSource: 'RANDOM', roundsMode: 'EACH', ...settings },
      ...extra,
    });
    Object.assign(this, joined);
  }

  async join(code: string, nickname: string): Promise<void> {
    const joined = await this.ok<{ code: string; playerId: string; sessionToken: string }>('room:join', {
      code,
      nickname,
    });
    Object.assign(this, joined);
  }

  waitFor(predicate: (v: PlayerView) => boolean, timeoutMs = 3000): Promise<PlayerView> {
    const last = this.states[this.states.length - 1];
    if (last && predicate(last)) return Promise.resolve(last);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`timed out; last state: ${JSON.stringify(this.states.at(-1)?.round ?? this.states.at(-1)?.room)}`));
      }, timeoutMs);
      const check = () => {
        const v = this.states[this.states.length - 1];
        if (v && predicate(v)) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve(v);
        }
      };
      this.listeners.add(check);
    });
  }

  close(): void {
    this.socket.disconnect();
  }
}
