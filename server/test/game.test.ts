import type { PlayerView } from '@gmr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { FAST, memoryRepo, startTestServer, TestClient, type TestServer } from './harness';

let server: TestServer | null = null;
let clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients) c.close();
  clients = [];
  await server?.dispose();
  server = null;
});

async function lobby(count: number, settings: Record<string, unknown> = {}) {
  server ??= await startTestServer();
  const host = await TestClient.connect(server.url);
  clients.push(host);
  await host.create('Host', settings);
  const players = [host];
  for (let i = 1; i < count; i++) {
    const c = await TestClient.connect(server.url);
    clients.push(c);
    await c.join(host.code, `Player ${i}`);
    players.push(c);
  }
  await host.waitFor((v) => v.players.length === count);
  return players;
}

const roundOf = (v: PlayerView) => v.round!;

describe('a full Random game over sockets', () => {
  it('plays every round to the final leaderboard without leaking the answer', async () => {
    const players = await lobby(3);
    const [host] = players as [TestClient];
    await host.ok('game:start');

    for (let roundNumber = 1; roundNumber <= 3; roundNumber++) {
      await Promise.all(players.map((p) => p.waitFor((v) => v.round?.number === roundNumber)));
      const rankerId = roundOf(host.view).rankerId;
      const ranker = players.find((p) => p.playerId === rankerId)!;
      const guessers = players.filter((p) => p !== ranker);

      const v = await ranker.waitFor((x) => x.round?.state === 'CATEGORY' && x.categories !== null);
      await ranker.ok('ranker:category', { categoryId: v.categories![0]!.id });
      await ranker.ok('ranker:refresh');
      const ranking = await ranker.waitFor((x) => x.round?.state === 'RANKING' && x.round.refreshLeft === 2);
      const answer = ranking.round!.items!.map((i) => i.id).reverse();
      await ranker.ok('ranker:lock', { order: answer });

      for (const g of guessers) {
        const gv = await g.waitFor((x) => x.round?.state === 'GUESSING' && x.round.items !== null);
        expect(gv.round!.items).toHaveLength(5);
        // Everyone guesses correctly except the first Guesser, who keeps the shuffled order.
        const order = g === guessers[0] ? gv.round!.items!.map((i) => i.id) : answer;
        await g.ok('guess:submit', { order });
      }

      const revealed = await host.waitFor((x) => x.round?.number === roundNumber && x.round.state === 'REVEAL');
      expect(revealed.round!.reveal!.answerOrder).toEqual(answer);
      const full = revealed.round!.reveal!.guesses.find((x) => x.playerId === guessers[1]!.playerId)!;
      expect(full.score).toBe(5);
    }

    const final = await host.waitFor((v) => v.room.status === 'FINISHED');
    expect(final.room.endReason).toBe('COMPLETED');
    expect(final.final!.winnerIds.length).toBeGreaterThan(0);

    // No Guesser ever received the answer or the reveal block before REVEAL (NFR-03).
    for (const p of players) {
      for (const s of p.states) {
        const r = s.round;
        if (!r || r.state === 'REVEAL') continue;
        expect(r.reveal).toBeNull();
        if (r.rankerId !== p.playerId && (r.state === 'CATEGORY' || r.state === 'RANKING')) {
          expect(r.items).toBeNull();
        }
      }
    }
  });
});

describe('server-side checks (NFR-05, NFR-11)', () => {
  it('rejects non-Host start/end, double submits and unknown rooms', async () => {
    const [host, other] = (await lobby(2)) as [TestClient, TestClient];
    expect(await other.call('game:start')).toMatchObject({ ok: false, error: 'NOT_HOST' });
    await host.ok('game:start');
    expect(await other.call('game:end')).toMatchObject({ ok: false, error: 'NOT_HOST' });

    const rankerId = (await host.waitFor((v) => v.round !== null)).round!.rankerId;
    const ranker = rankerId === host.playerId ? host : other;
    const guesser = ranker === host ? other : host;
    const cat = await ranker.waitFor((v) => v.categories !== null);
    await ranker.ok('ranker:category', { categoryId: cat.categories![0]!.id });
    const items = (await ranker.waitFor((v) => v.round?.state === 'RANKING')).round!.items!.map((i) => i.id);
    expect(await guesser.call('ranker:lock', { order: items })).toMatchObject({ ok: false, error: 'NOT_RANKER' });
    await ranker.ok('ranker:lock', { order: items });

    const gv = await guesser.waitFor((v) => v.round?.state === 'GUESSING' && v.round.items !== null);
    const order = gv.round!.items!.map((i) => i.id);
    expect(await guesser.call('guess:submit', { order: order.slice(1) })).toMatchObject({
      ok: false,
      error: 'INVALID_ORDER',
    });
    await guesser.ok('guess:submit', { order });
    expect(await guesser.call('guess:submit', { order })).toMatchObject({ ok: false, error: 'WRONG_STATE' });

    const stranger = await TestClient.connect(server!.url);
    clients.push(stranger);
    expect(await stranger.call('room:join', { code: 'ZZZZZZ', nickname: 'X' })).toMatchObject({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
    expect(await stranger.call('room:join', { code: host.code, nickname: 'Late' })).toMatchObject({
      ok: false,
      error: 'GAME_ALREADY_STARTED',
    });
  });
});

describe('disconnects (FR-46, FR-71–75)', () => {
  it('lets a Guesser rejoin with the session token, and skips one who stays away', async () => {
    server = await startTestServer(undefined, undefined, { ...FAST, disconnectGraceMs: 1500 });
    const players = await lobby(3);
    const [host] = players as [TestClient];
    await host.ok('game:start');
    const rankerId = (await host.waitFor((v) => v.round !== null)).round!.rankerId;
    const ranker = players.find((p) => p.playerId === rankerId)!;
    const [returns, vanishes] = players.filter((p) => p !== ranker) as [TestClient, TestClient];

    const cat = await ranker.waitFor((v) => v.categories !== null);
    await ranker.ok('ranker:category', { categoryId: cat.categories![0]!.id });
    const items = (await ranker.waitFor((v) => v.round?.state === 'RANKING')).round!.items!.map((i) => i.id);
    await ranker.ok('ranker:lock', { order: items });
    const shown = (await returns.waitFor((v) => v.round?.items !== null && v.round?.state === 'GUESSING')).round!
      .items!.map((i) => i.id);

    returns.close();
    vanishes.close();
    await ranker.waitFor((v) => v.round!.guessStatuses.filter((g) => g.status === 'DISCONNECTED').length === 2);

    const again = await TestClient.connect(server!.url);
    clients.push(again);
    await again.ok('room:join', { code: host.code, sessionToken: returns.sessionToken });
    const restored = await again.waitFor((v) => v.round?.state === 'GUESSING');
    expect(restored.meId).toBe(returns.playerId);
    expect(restored.round!.myGuess!.status).toBe('GUESSING');
    expect(restored.round!.items!.map((i) => i.id)).toEqual(shown);
    await again.ok('guess:submit', { order: items });

    const revealed = await ranker.waitFor((v) => v.round?.state === 'REVEAL', 5000);
    const skipped = revealed.round!.reveal!.guesses.find((g) => g.playerId === vanishes.playerId)!;
    expect(skipped.status).toBe('SKIPPED');
    expect(skipped.score).toBe(0);
  });

  it('rejects a forged session token', async () => {
    const [host] = (await lobby(2)) as [TestClient];
    const intruder = await TestClient.connect(server!.url);
    clients.push(intruder);
    expect(await intruder.call('room:join', { code: host.code, sessionToken: 'forged' })).toMatchObject({
      ok: false,
      error: 'INVALID_SESSION',
    });
  });
});

describe('restart recovery (NFR-08)', () => {
  it('resumes a game in progress from the store after the server restarts', async () => {
    const repo = await memoryRepo();
    const timings = { ...FAST, disconnectGraceMs: 5000 };
    server = await startTestServer(repo, undefined, timings);
    const players = await lobby(2);
    const [host] = players as [TestClient];
    await host.ok('game:start');
    const rankerId = (await host.waitFor((v) => v.round !== null)).round!.rankerId;
    const ranker = players.find((p) => p.playerId === rankerId)!;
    const guesser = players.find((p) => p !== ranker)!;
    const cat = await ranker.waitFor((v) => v.categories !== null);
    await ranker.ok('ranker:category', { categoryId: cat.categories![0]!.id });
    const items = (await ranker.waitFor((v) => v.round?.state === 'RANKING')).round!.items!.map((i) => i.id);
    await ranker.ok('ranker:lock', { order: items });
    await guesser.waitFor((v) => v.round?.state === 'GUESSING');

    await server.manager.flush();
    for (const c of clients) c.close();
    clients = [];
    await server.dispose();

    server = await startTestServer(repo, undefined, timings);
    const back = await Promise.all(
      [ranker, guesser].map(async (p) => {
        const c = await TestClient.connect(server!.url);
        clients.push(c);
        await c.ok('room:join', { code: host.code, sessionToken: p.sessionToken });
        return c;
      }),
    );
    const [rankerAgain, guesserAgain] = back as [TestClient, TestClient];
    const v = await guesserAgain.waitFor((x) => x.round?.state === 'GUESSING' && x.round.myGuess?.status === 'GUESSING');
    await guesserAgain.ok('guess:submit', { order: v.round!.items!.map((i) => i.id) });
    const revealed = await rankerAgain.waitFor((x) => x.round?.state === 'REVEAL');
    expect(revealed.round!.reveal!.answerOrder).toEqual(items);
  });
});
