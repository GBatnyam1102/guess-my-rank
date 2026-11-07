import { describe, expect, it } from 'vitest';
import { BOT_NAMES, botMoves, createRoom, DEFAULT_TIMINGS as T, GameError, type RoomSettings } from '../src';
import { content, Game } from './helpers';

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof GameError) return e.code;
    throw e;
  }
  return undefined;
}

const botGame = (settings: Partial<RoomSettings> = {}, bots = ['b1', 'b2', 'b3'], hostName = 'Host') =>
  new Game({ mode: 'BOTS', ...settings }, hostName, bots);

/** Plays every bot move that is due, plus the person's own turn, until the game ends. */
function playToTheEnd(g: Game, humanTurn: (g: Game) => void): void {
  for (let guard = 0; guard < 500 && g.state.status === 'IN_GAME'; guard++) {
    const before = g.state.version;
    for (const move of botMoves(g.state, g.ctx())) g.run(move.cmd);
    humanTurn(g);
    const r = g.round;
    if (g.state.version === before && (r.state === 'REVEAL' || r.state === 'SKIPPED')) g.advance(T.revealMs);
  }
}

describe('bot rooms', () => {
  it('starts with named bots and nobody else can join', () => {
    const g = botGame();
    expect(g.state.players.map((p) => [p.nickname, p.isBot])).toEqual([
      ['Host', false],
      [BOT_NAMES[0], true],
      [BOT_NAMES[1], true],
      [BOT_NAMES[2], true],
    ]);
    expect(errorCode(() => g.run({ type: 'join', playerId: 'x', nickname: 'Friend', sessionTokenHash: 'h' }))).toBe(
      'BOT_ROOM',
    );
  });

  it('needs at least one bot, and a room for friends has none', () => {
    const base = { id: 'r', code: 'ABCDEF', inviteToken: 'i', hostId: 'p0', nickname: 'Host', sessionTokenHash: 'h' };
    const settings = { maxPlayers: 4, imageCount: 5, imageSource: 'RANDOM', roundsMode: 'EACH' };
    expect(errorCode(() => createRoom({ ...base, settings: { ...settings, mode: 'BOTS' }, botIds: [] }, 0))).toBe(
      'INVALID_SETTINGS',
    );
    expect(
      errorCode(() => createRoom({ ...base, settings: { ...settings, mode: 'BOTS' }, botIds: ['a', 'b', 'c', 'd'] }, 0)),
    ).toBe('INVALID_SETTINGS');
    expect(errorCode(() => createRoom({ ...base, settings: { ...settings, mode: 'HUMANS' }, botIds: ['a'] }, 0))).toBe(
      'INVALID_SETTINGS',
    );
  });

  it('lets only the Host add and remove bots, in the lobby, up to the player limit', () => {
    const g = botGame({ maxPlayers: 3 }, ['b1'], BOT_NAMES[1]);
    g.run({ type: 'addBot', playerId: 'p0', botId: 'b2' });
    // The second bot skips the name the person already uses.
    expect(g.state.players.map((p) => p.nickname)).toEqual([BOT_NAMES[1], BOT_NAMES[0], BOT_NAMES[2]]);
    expect(errorCode(() => g.run({ type: 'addBot', playerId: 'p0', botId: 'b3' }))).toBe('ROOM_FULL');
    expect(errorCode(() => g.run({ type: 'removeBot', playerId: 'b1', botId: 'b2' }))).toBe('NOT_HOST');
    expect(errorCode(() => g.run({ type: 'removeBot', playerId: 'p0', botId: 'p0' }))).toBe('BOT_NOT_FOUND');
    g.run({ type: 'removeBot', playerId: 'p0', botId: 'b1' });
    expect(g.state.players.map((p) => p.id)).toEqual(['p0', 'b2']);

    g.run({ type: 'start', playerId: 'p0' });
    expect(errorCode(() => g.run({ type: 'addBot', playerId: 'p0', botId: 'b4' }))).toBe('WRONG_STATE');

    const friends = new Game();
    expect(errorCode(() => friends.run({ type: 'addBot', playerId: 'p0', botId: 'b1' }))).toBe('NOT_A_BOT_ROOM');
  });

  it('never hands Host rights to a bot, and ends once the person leaves', () => {
    const g = botGame();
    g.run({ type: 'disconnect', playerId: 'p0' });
    g.advance(T.hostGraceMs * 2);
    expect(g.state.hostPlayerId).toBe('p0');

    g.run({ type: 'reconnect', playerId: 'p0' });
    g.run({ type: 'start', playerId: 'p0' });
    g.run({ type: 'leave', playerId: 'p0' });
    expect(g.state.status).toBe('FINISHED');
    expect(g.state.endReason).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('bots choose, rank and guess on their own through a whole game', () => {
    const g = botGame();
    g.run({ type: 'start', playerId: 'p0' });
    playToTheEnd(g, (game) => {
      const r = game.round;
      if (r.rankerId === 'p0' && (r.state === 'CATEGORY' || r.state === 'RANKING')) game.rankAndLock();
      const mine = r.guesses.find((x) => x.playerId === 'p0');
      if (r.state === 'GUESSING' && mine?.status === 'GUESSING') {
        game.run({ type: 'submitGuess', playerId: 'p0', order: r.answerOrder! });
      }
    });
    expect(g.state.status).toBe('FINISHED');
    expect(g.state.endReason).toBe('COMPLETED');
    expect(g.state.rounds).toHaveLength(4);
    expect(g.state.rounds.every((r) => r.state === 'REVEAL' && r.skipReason === null)).toBe(true);
    // The person guessed every bot round perfectly.
    expect(g.player('p0').totalScore).toBe(15);
  });

  it('a bot Ranker brings library pictures to a custom-image game', () => {
    const g = botGame({ imageSource: 'CUSTOM' });
    g.run({ type: 'start', playerId: 'p0' });
    let photo = 0;
    playToTheEnd(g, (game) => {
      const r = game.round;
      if (r.rankerId === 'p0' && r.state === 'RANKING') {
        while (game.round.items.length < 5) {
          photo++;
          game.run({
            type: 'addCustomItem',
            playerId: 'p0',
            item: { id: `photo-${photo}`, imageUrl: `/p/${photo}.webp`, title: `Photo ${photo}`, fact: null, sourceUrl: null, uploadId: null },
          });
        }
        game.rankAndLock();
      }
      const mine = game.round.guesses.find((x) => x.playerId === 'p0');
      if (game.round.state === 'GUESSING' && mine?.status === 'GUESSING') {
        game.run({ type: 'submitGuess', playerId: 'p0', order: mine.shownOrder });
      }
    });
    const library = new Set(content.categories.flatMap((c) => c.items.map((i) => i.imageUrl)));
    const botRounds = g.state.rounds.filter((r) => r.rankerId !== 'p0');
    expect(botRounds).toHaveLength(3);
    for (const r of botRounds) {
      expect(r.state).toBe('REVEAL');
      expect(r.items).toHaveLength(5);
      expect(r.items.every((i) => i.kind === 'CUSTOM' && library.has(i.imageUrl))).toBe(true);
      expect(new Set(r.items.map((i) => i.imageUrl)).size).toBe(5);
    }
  });

  it('a move keeps its key until it is played, and people never get moves', () => {
    const g = botGame({}, ['b1']);
    g.run({ type: 'start', playerId: 'p0' });
    if (g.ranker === 'p0') g.rankAndLock();
    const first = botMoves(g.state, g.ctx());
    expect(first).toHaveLength(1);
    expect(first[0]!.botId).toBe('b1');
    expect(botMoves(g.state, g.ctx()).map((m) => m.key)).toEqual(first.map((m) => m.key));
    g.run(first[0]!.cmd);
    expect(botMoves(g.state, g.ctx()).some((m) => m.key === first[0]!.key)).toBe(false);
  });
});
