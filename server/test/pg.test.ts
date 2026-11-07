// Round-trips a room through PostgreSQL. Runs when TEST_DATABASE_URL is set, e.g.
// TEST_DATABASE_URL=postgres://postgres@localhost:5432/guess_my_rank_test
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  apply,
  buildContentIndex,
  createRoom,
  currentRound,
  DEFAULT_TIMINGS,
  type Command,
  type RoomState,
} from '@gmr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogToContent, readCatalog } from '../src/content/catalog';
import { PgRepo } from '../src/repo/pg';
import { contentDir } from './harness';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PgRepo', () => {
  let repo: PgRepo;

  beforeAll(async () => {
    repo = new PgRepo(url!);
    await repo.migrate(path.resolve(import.meta.dirname, '../drizzle'));
    await repo.upsertContent(catalogToContent(await readCatalog(contentDir)));
  });

  afterAll(async () => {
    await repo?.close();
  });

  it('stores and reloads a room mid-game exactly', async () => {
    const content = buildContentIndex(await repo.loadContent());
    expect(content.categories.length).toBeGreaterThan(0);
    let now = Date.UTC(2026, 10, 7, 12);
    const ctx = () => ({ now, rng: Math.random, newId: randomUUID, content, timings: DEFAULT_TIMINGS });
    const hostId = randomUUID();
    let s: RoomState = createRoom(
      {
        id: randomUUID(),
        code: randomUUID().slice(0, 6).toUpperCase(),
        inviteToken: randomUUID(),
        hostId,
        nickname: 'Host',
        sessionTokenHash: 'h0',
        settings: { maxPlayers: 4, imageCount: 5, imageSource: 'RANDOM', roundsMode: 3 },
      },
      now,
    );
    const run = (cmd: Command) => {
      s = apply(s, cmd, ctx()).state;
    };
    const others = [randomUUID(), randomUUID()];
    others.forEach((id, i) => run({ type: 'join', playerId: id, nickname: `P${i}`, sessionTokenHash: `h${i + 1}` }));
    run({ type: 'start', playerId: hostId });
    const ranker = currentRound(s)!.rankerId;
    run({ type: 'chooseCategory', playerId: ranker, categoryId: content.categories[0]!.id });
    const ids = currentRound(s)!.items.map((i) => i.id);
    run({ type: 'lock', playerId: ranker, order: ids });
    const guesser = currentRound(s)!.guesses[0]!.playerId;
    now += 1000;
    run({ type: 'submitGuess', playerId: guesser, order: ids });
    run({ type: 'disconnect', playerId: currentRound(s)!.guesses[1]!.playerId });

    await repo.saveRoom(s);
    const loaded = (await repo.loadRooms()).find((r) => r.id === s.id);
    expect(loaded).toEqual(s);

    // Saving again after the round moves on replaces rows rather than duplicating them.
    now += DEFAULT_TIMINGS.disconnectGraceMs;
    run({ type: 'tick' });
    expect(currentRound(s)!.state).toBe('REVEAL');
    await repo.saveRoom(s);
    expect((await repo.loadRooms()).find((r) => r.id === s.id)).toEqual(s);

    await repo.deleteRoom(s.id);
    expect((await repo.loadRooms()).find((r) => r.id === s.id)).toBeUndefined();
  });

  it('tracks upload expiry', async () => {
    const id = randomUUID();
    const now = Date.now();
    await repo.createUpload({
      id,
      roomId: randomUUID(),
      roundId: randomUUID(),
      playerId: randomUUID(),
      storageKey: `raw/${randomUUID()}/${id}`,
      mime: 'image/png',
      bytes: 10,
      status: 'PENDING',
      createdAt: now,
      expiresAt: now + 1000,
    });
    expect((await repo.listExpiredUploads(now)).some((u) => u.id === id)).toBe(false);
    await repo.updateUpload(id, { status: 'READY', expiresAt: now - 1 });
    const expired = (await repo.listExpiredUploads(now)).find((u) => u.id === id);
    expect(expired?.status).toBe('READY');
    await repo.deleteUpload(id);
    expect(await repo.getUpload(id)).toBeNull();
  });

  it('stores image bytes for STORAGE_DRIVER=db', async () => {
    const key = `img/${randomUUID()}/${randomUUID()}.webp`;
    const data = Buffer.from([0, 1, 2, 250, 255, 0, 42]);
    expect(await repo.getBlob(key)).toBeNull();
    await repo.putBlob(key, data, 'image/webp');
    expect(await repo.getBlob(key)).toEqual(data);
    await repo.putBlob(key, Buffer.from([9]), 'image/webp');
    expect(await repo.getBlob(key)).toEqual(Buffer.from([9]));
    await repo.deleteBlob(key);
    expect(await repo.getBlob(key)).toBeNull();
  });
});
