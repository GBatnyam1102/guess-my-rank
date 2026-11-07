import { BOT_NAMES, type PlayerView } from '@gmr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { startTestServer, TestClient, type TestServer } from './harness';

let server: TestServer | null = null;
let clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients) c.close();
  clients = [];
  await server?.dispose();
  server = null;
});

async function connect(): Promise<TestClient> {
  server ??= await startTestServer();
  const c = await TestClient.connect(server.url);
  clients.push(c);
  return c;
}

const myTurn = (v: PlayerView) => {
  const r = v.round;
  if (!r) return false;
  if (r.myRole === 'RANKER') return (r.state === 'CATEGORY' && v.categories !== null) || (r.state === 'RANKING' && Boolean(r.items?.length));
  return r.state === 'GUESSING' && r.myGuess?.status === 'GUESSING' && r.items !== null;
};

/** Plays the person's turns until the end; the bots play theirs on the server. */
async function playMyTurns(me: TestClient): Promise<PlayerView> {
  for (;;) {
    const v = await me.waitFor((x) => x.room.status === 'FINISHED' || myTurn(x), 5000);
    if (v.room.status === 'FINISHED') return v;
    const r = v.round!;
    if (r.state === 'CATEGORY') {
      await me.ok('ranker:category', { categoryId: v.categories![0]!.id });
    } else if (r.state === 'RANKING') {
      await me.ok('ranker:lock', { order: r.items!.map((i) => i.id) });
    } else {
      await me.ok('guess:submit', { order: r.items!.map((i) => i.id) });
    }
  }
}

describe('bot rooms over sockets', () => {
  it('fills the room with bots that play their own turns, and nobody else can join', async () => {
    const me = await connect();
    await me.create('Me', { mode: 'BOTS' }, { botCount: 2 });
    let v = await me.waitFor((x) => x.players.length === 3);
    expect(v.players.map((p) => [p.nickname, p.isBot])).toEqual([
      ['Me', false],
      [BOT_NAMES[0], true],
      [BOT_NAMES[1], true],
    ]);

    const friend = await connect();
    expect(await friend.call('room:join', { code: me.code, nickname: 'Friend' })).toMatchObject({
      ok: false,
      error: 'BOT_ROOM',
    });

    await me.ok('bot:add');
    v = await me.waitFor((x) => x.players.length === 4);
    const extra = v.players[3]!;
    expect(extra.isBot).toBe(true);
    await me.ok('bot:remove', { playerId: extra.id });
    await me.waitFor((x) => x.players.length === 3);

    await me.ok('game:start');
    const final = await playMyTurns(me);
    expect(final.room.endReason).toBe('COMPLETED');
    expect(final.leaderboard.filter((e) => e.isBot)).toHaveLength(2);
    const rounds = server!.manager.getRoom(me.code)!.rounds;
    expect(rounds).toHaveLength(3);
    expect(rounds.every((r) => r.state === 'REVEAL')).toBe(true);
  });

  it('removes the room once the person leaves, even mid-game', async () => {
    const me = await connect();
    await me.create('Me', { mode: 'BOTS', roundsMode: 5 }, { botCount: 3 });
    await me.ok('game:start');
    await me.waitFor((x) => x.round !== null);
    await me.ok('room:leave');
    expect(server!.manager.getRoom(me.code)).toBeUndefined();
  });

  it('rejects bots in a room for friends', async () => {
    const host = await connect();
    await host.create('Host', { mode: 'HUMANS' }, { botCount: 2 });
    expect(host.view.players).toHaveLength(1);
    expect(await host.call('bot:add')).toMatchObject({ ok: false, error: 'NOT_A_BOT_ROOM' });
  });
});
