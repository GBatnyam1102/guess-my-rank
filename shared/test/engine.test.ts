import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS as T, GameError, MAX_REFRESH, nextDeadline, plannedRounds } from '../src';
import { Game } from './helpers';

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof GameError) return e.code;
    throw e;
  }
  return undefined;
}

describe('lobby (FR-09–14)', () => {
  it('rejects joins over the player limit and duplicate nicknames', () => {
    const g = new Game({ maxPlayers: 3 });
    g.join(2);
    expect(errorCode(() => g.run({ type: 'join', playerId: 'x', nickname: 'Late', sessionTokenHash: 'h' }))).toBe(
      'ROOM_FULL',
    );
    const g2 = new Game();
    expect(errorCode(() => g2.run({ type: 'join', playerId: 'x', nickname: ' host ', sessionTokenHash: 'h' }))).toBe(
      'NICKNAME_TAKEN',
    );
  });

  it('only lets the Host start, and only with at least 2 players', () => {
    const g = new Game();
    expect(errorCode(() => g.run({ type: 'start', playerId: 'p0' }))).toBe('NOT_ENOUGH_PLAYERS');
    g.join(1);
    expect(errorCode(() => g.run({ type: 'start', playerId: 'p1' }))).toBe('NOT_HOST');
    g.run({ type: 'start', playerId: 'p0' });
    expect(g.state.status).toBe('IN_GAME');
    expect(g.round.state).toBe('CATEGORY');
  });

  it('does not accept new players after the game starts (Q-5)', () => {
    const g = new Game();
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    expect(errorCode(() => g.run({ type: 'join', playerId: 'x', nickname: 'Late', sessionTokenHash: 'h' }))).toBe(
      'GAME_ALREADY_STARTED',
    );
  });

  it('moves Host rights when the Host leaves the lobby', () => {
    const g = new Game();
    g.join(2);
    g.run({ type: 'leave', playerId: 'p0' });
    expect(g.state.hostPlayerId).toBe('p1');
    expect(g.state.players.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('Ranker flow (FR-15–24, 50–53)', () => {
  it('lets every player rank exactly once in "each once" mode, then finishes', () => {
    const g = new Game();
    g.join(3);
    g.run({ type: 'start', playerId: 'p0' });
    const rankers: string[] = [];
    while (g.state.status === 'IN_GAME') {
      rankers.push(g.ranker);
      g.rankAndLock();
      g.submitAll();
      expect(g.round.state).toBe('REVEAL');
      g.advance(T.revealMs);
    }
    expect(rankers.sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(g.state.endReason).toBe('COMPLETED');
  });

  it('never picks the same Ranker twice in a row across cycles', () => {
    const g = new Game({ roundsMode: 5 });
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    const rankers: string[] = [];
    while (g.state.status === 'IN_GAME') {
      rankers.push(g.ranker);
      g.rankAndLock();
      g.submitAll();
      g.advance(T.revealMs);
    }
    expect(rankers).toHaveLength(5);
    for (let i = 1; i < rankers.length; i++) expect(rankers[i]).not.toBe(rankers[i - 1]);
  });

  it('only the Ranker can choose, refresh and lock', () => {
    const g = new Game();
    g.join(2);
    g.run({ type: 'start', playerId: 'p0' });
    const other = g.guessers()[0]!;
    expect(errorCode(() => g.run({ type: 'chooseCategory', playerId: other, categoryId: 'food' }))).toBe('NOT_RANKER');
    g.run({ type: 'chooseCategory', playerId: g.ranker, categoryId: 'food' });
    expect(errorCode(() => g.run({ type: 'refresh', playerId: other }))).toBe('NOT_RANKER');
    const ids = g.round.items.map((i) => i.id);
    expect(errorCode(() => g.run({ type: 'lock', playerId: other, order: ids }))).toBe('NOT_RANKER');
  });

  it('rejects categories with too few images', () => {
    const g = new Game();
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    expect(errorCode(() => g.run({ type: 'chooseCategory', playerId: g.ranker, categoryId: 'tiny' }))).toBe(
      'CATEGORY_TOO_SMALL',
    );
  });

  it('refresh replaces every image, avoids repeats and stops after 3 (FR-50, FR-51)', () => {
    const g = new Game();
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    g.run({ type: 'chooseCategory', playerId: g.ranker, categoryId: 'food' });
    const seen = new Set(g.round.items.map((i) => i.contentItemId));
    for (let i = 0; i < MAX_REFRESH; i++) {
      g.run({ type: 'refresh', playerId: g.ranker });
      const drawn = g.round.items.map((x) => x.contentItemId);
      expect(new Set(drawn).size).toBe(5);
      for (const id of drawn) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(errorCode(() => g.run({ type: 'refresh', playerId: g.ranker }))).toBe('REFRESH_LIMIT');
  });

  it('locks only a full permutation and then freezes the images (FR-22–24)', () => {
    const g = new Game();
    g.join(2);
    g.run({ type: 'start', playerId: 'p0' });
    g.run({ type: 'chooseCategory', playerId: g.ranker, categoryId: 'food' });
    const ids = g.round.items.map((i) => i.id);
    expect(errorCode(() => g.run({ type: 'lock', playerId: g.ranker, order: ids.slice(1) }))).toBe('INVALID_ORDER');
    g.run({ type: 'lock', playerId: g.ranker, order: [...ids].reverse() });
    expect(g.round.state).toBe('GUESSING');
    expect(errorCode(() => g.run({ type: 'refresh', playerId: g.ranker }))).toBe('WRONG_STATE');
    for (const guess of g.round.guesses) {
      expect(guess.shownOrder).not.toEqual(g.round.answerOrder);
      expect([...guess.shownOrder].sort()).toEqual([...ids].sort());
    }
  });
});

describe('guessing and scoring (FR-25–38)', () => {
  it('scores each Guesser, gives the Ranker 0 and reveals once everyone has submitted', () => {
    const g = new Game();
    g.join(2);
    g.run({ type: 'start', playerId: 'p0' });
    const ranker = g.ranker;
    const answer = g.rankAndLock();
    const [first, second] = g.guessers() as [string, string];
    const swapped = [answer[1]!, answer[0]!, ...answer.slice(2)];

    g.run({ type: 'submitGuess', playerId: first, order: answer });
    expect(g.round.state).toBe('GUESSING');
    expect(errorCode(() => g.run({ type: 'submitGuess', playerId: first, order: answer }))).toBe('ALREADY_SUBMITTED');
    expect(errorCode(() => g.run({ type: 'submitGuess', playerId: ranker, order: answer }))).toBe('NOT_A_GUESSER');

    g.run({ type: 'submitGuess', playerId: second, order: swapped });
    expect(g.round.state).toBe('REVEAL');
    expect(g.player(first).totalScore).toBe(5);
    expect(g.player(second).totalScore).toBe(3);
    expect(g.player(ranker).totalScore).toBe(0);
  });

  it('moves on 15 seconds after the reveal, and ends after the last round (FR-38, FR-69, FR-70)', () => {
    const g = new Game({ roundsMode: 1 });
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    g.rankAndLock();
    g.submitAll();
    g.advance(T.revealMs - 1);
    expect(g.round.state).toBe('REVEAL');
    g.advance(1);
    expect(g.state.status).toBe('FINISHED');
    expect(g.notices.some((n) => n.type === 'final')).toBe(true);
  });

  it('lets the Host end the game but there is no way to force a reveal (FR-32, FR-47)', () => {
    const g = new Game();
    g.join(2);
    g.run({ type: 'start', playerId: 'p0' });
    g.rankAndLock();
    expect(errorCode(() => g.run({ type: 'end', playerId: 'p1' }))).toBe('NOT_HOST');
    g.run({ type: 'end', playerId: 'p0' });
    expect(g.state.status).toBe('FINISHED');
    expect(g.state.endReason).toBe('HOST_ENDED');
  });
});

describe('timers and disconnects (FR-67, FR-71–75, NFR-08)', () => {
  function inGuessing() {
    const g = new Game();
    g.join(2);
    g.run({ type: 'start', playerId: 'p0' });
    g.rankAndLock();
    return g;
  }

  it('skips a Guesser who stays offline for 60 seconds and reveals without waiting', () => {
    const g = inGuessing();
    const [stays, drops] = g.guessers() as [string, string];
    g.run({ type: 'submitGuess', playerId: stays, order: g.round.answerOrder! });
    g.run({ type: 'disconnect', playerId: drops });
    expect(g.round.guesses.find((x) => x.playerId === drops)!.status).toBe('DISCONNECTED');
    expect(nextDeadline(g.state, T)).toBe(g.now + T.disconnectGraceMs);

    g.advance(T.disconnectGraceMs - 1);
    expect(g.round.state).toBe('GUESSING');
    g.advance(1);
    expect(g.round.state).toBe('REVEAL');
    expect(g.round.guesses.find((x) => x.playerId === drops)!.status).toBe('SKIPPED');
    expect(g.player(drops).totalScore).toBe(0);
  });

  it('lets a Guesser who returns within 60 seconds carry on', () => {
    const g = inGuessing();
    const drops = g.guessers()[0]!;
    g.run({ type: 'disconnect', playerId: drops });
    g.advance(30_000);
    g.run({ type: 'reconnect', playerId: drops });
    expect(g.round.guesses.find((x) => x.playerId === drops)!.status).toBe('GUESSING');
    g.advance(40_000);
    expect(g.round.state).toBe('GUESSING');
    g.run({ type: 'submitGuess', playerId: drops, order: g.round.answerOrder! });
    expect(g.round.guesses.find((x) => x.playerId === drops)!.status).toBe('SUBMITTED');
  });

  it('skips idle-but-connected Guessers when the guessing limit runs out (Q-1)', () => {
    const g = inGuessing();
    g.advance(T.guessingMs);
    expect(g.round.state).toBe('REVEAL');
    expect(g.round.guesses.every((x) => x.status === 'SKIPPED')).toBe(true);
  });

  it('skips the round when the Ranker is offline for 60 seconds or runs out of time (Q-2)', () => {
    const g = new Game({ roundsMode: 3 });
    g.join(2);
    g.run({ type: 'start', playerId: 'p0' });
    g.run({ type: 'disconnect', playerId: g.ranker });
    g.advance(T.disconnectGraceMs);
    expect(g.round.state).toBe('SKIPPED');
    expect(g.round.skipReason).toBe('RANKER_OFFLINE');
    g.advance(T.skippedRoundMs);
    expect(g.round.number).toBe(2);

    g.advance(T.rankingRandomMs);
    expect(g.round.skipReason).toBe('RANKER_TIMEOUT');
  });

  it('moves Host rights to an online player after the Host is offline for 60 seconds (Q-3)', () => {
    const g = new Game();
    g.join(2);
    g.run({ type: 'disconnect', playerId: 'p0' });
    g.advance(T.hostGraceMs);
    expect(g.state.hostPlayerId).toBe('p1');
  });

  it('ends the game when fewer than 2 players remain (Q-4)', () => {
    const g = new Game();
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    g.run({ type: 'leave', playerId: 'p1' });
    expect(g.state.status).toBe('FINISHED');
    expect(g.state.endReason).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('drops a leaver\'s turn in "each once" mode (Q-6)', () => {
    const g = new Game();
    g.join(3);
    g.run({ type: 'start', playerId: 'p0' });
    expect(plannedRounds(g.state)).toBe(4);
    const waiting = g.guessers()[0]!;
    g.run({ type: 'leave', playerId: waiting });
    expect(plannedRounds(g.state)).toBe(3);
  });

  it('a leaving Guesser does not block the reveal', () => {
    const g = inGuessing();
    const [stays, leaves] = g.guessers() as [string, string];
    g.run({ type: 'submitGuess', playerId: stays, order: g.round.answerOrder! });
    g.run({ type: 'leave', playerId: leaves });
    expect(g.round.state).toBe('REVEAL');
  });
});

describe('custom images (FR-19, FR-20, FR-61)', () => {
  function customGame() {
    const g = new Game({ imageSource: 'CUSTOM', imageCount: 5 });
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    return g;
  }

  const item = (n: number, title = `Photo ${n}`) => ({
    id: `item-${n}`,
    imageUrl: `/storage/files/img/${n}.webp`,
    title,
    fact: null,
    sourceUrl: null,
    uploadId: `upload-${n}`,
  });

  it('starts in RANKING, accepts exactly N images and needs a title on each', () => {
    const g = customGame();
    expect(g.round.state).toBe('RANKING');
    for (let n = 0; n < 5; n++) g.run({ type: 'addCustomItem', playerId: g.ranker, item: item(n, n === 4 ? '' : undefined) });
    expect(errorCode(() => g.run({ type: 'addCustomItem', playerId: g.ranker, item: item(9) }))).toBe('TOO_MANY_IMAGES');
    const ids = g.round.items.map((i) => i.id);
    expect(errorCode(() => g.run({ type: 'lock', playerId: g.ranker, order: ids }))).toBe('MISSING_TITLE');
    g.run({ type: 'renameCustomItem', playerId: g.ranker, itemId: 'item-4', title: 'Last one' });
    g.run({ type: 'lock', playerId: g.ranker, order: ids });
    expect(g.round.state).toBe('GUESSING');
  });

  it('only the Ranker can remove an image and the upload is released', () => {
    const g = customGame();
    g.run({ type: 'addCustomItem', playerId: g.ranker, item: item(1) });
    const other = g.guessers()[0]!;
    expect(errorCode(() => g.run({ type: 'removeCustomItem', playerId: other, itemId: 'item-1' }))).toBe('NOT_RANKER');
    const notices = g.run({ type: 'removeCustomItem', playerId: g.ranker, itemId: 'item-1' });
    expect(notices).toContainEqual({ type: 'uploadsReleased', uploadIds: ['upload-1'] });
  });
});

describe('play again (FR-44)', () => {
  it('returns the room to the lobby with scores reset', () => {
    const g = new Game({ roundsMode: 1 });
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    g.rankAndLock();
    g.submitAll();
    g.advance(T.revealMs);
    expect(g.state.status).toBe('FINISHED');
    g.run({ type: 'playAgain', playerId: 'p0' });
    expect(g.state.status).toBe('LOBBY');
    expect(g.state.rounds).toHaveLength(0);
    expect(g.state.players.every((p) => p.totalScore === 0)).toBe(true);
  });
});
