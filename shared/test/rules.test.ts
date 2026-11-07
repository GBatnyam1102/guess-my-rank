import { describe, expect, it } from 'vitest';
import {
  GameError,
  isPermutationOf,
  normalizeNickname,
  pickRanker,
  placings,
  scoreGuess,
  seededRng,
  shuffleUnlike,
  validateSettings,
  winnersOf,
  type Player,
} from '../src';

function player(id: string, extra: Partial<Player> = {}): Player {
  return {
    id,
    nickname: id,
    isBot: false,
    sessionTokenHash: '',
    connection: 'ONLINE',
    disconnectedAt: null,
    rankedInCycle: false,
    totalScore: 0,
    joinedAt: 0,
    leftAt: null,
    ...extra,
  };
}

describe('scoreGuess (FR-33, FR-34)', () => {
  it('gives one point per image in the right position', () => {
    expect(scoreGuess(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(4);
    expect(scoreGuess(['a', 'b', 'c', 'd'], ['a', 'c', 'b', 'd'])).toBe(2);
    expect(scoreGuess(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a'])).toBe(0);
  });
});

describe('isPermutationOf', () => {
  it('accepts exactly the same ids in any order', () => {
    expect(isPermutationOf(['b', 'a', 'c'], ['a', 'b', 'c'])).toBe(true);
  });
  it('rejects duplicates, missing, extra and non-string ids', () => {
    expect(isPermutationOf(['a', 'a', 'c'], ['a', 'b', 'c'])).toBe(false);
    expect(isPermutationOf(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    expect(isPermutationOf(['a', 'b', 'x'], ['a', 'b', 'c'])).toBe(false);
    expect(isPermutationOf([1, 2, 3], ['a', 'b', 'c'])).toBe(false);
    expect(isPermutationOf('abc', ['a', 'b', 'c'])).toBe(false);
  });
});

describe('pickRanker (FR-15, 16, 63, 64)', () => {
  it('never repeats a Ranker within a cycle and starts a new cycle afterwards', () => {
    const rng = seededRng(7);
    const players = ['a', 'b', 'c', 'd'].map((id) => player(id));
    const picked: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = pickRanker(players, picked.at(-1) ?? null, rng)!;
      expect(res.newCycle).toBe(false);
      picked.push(res.rankerId);
      players.find((p) => p.id === res.rankerId)!.rankedInCycle = true;
    }
    expect(new Set(picked).size).toBe(4);

    const next = pickRanker(players, picked.at(-1)!, rng)!;
    expect(next.newCycle).toBe(true);
    expect(next.rankerId).not.toBe(picked.at(-1));
  });

  it('prefers online players', () => {
    const players = [player('a', { connection: 'OFFLINE' }), player('b')];
    for (let seed = 0; seed < 20; seed++) {
      expect(pickRanker(players, null, seededRng(seed))!.rankerId).toBe('b');
    }
  });
});

describe('placings and winners (FR-42, FR-43)', () => {
  const players = [
    { id: 'a', totalScore: 5 },
    { id: 'b', totalScore: 7 },
    { id: 'c', totalScore: 7 },
    { id: 'd', totalScore: 1 },
  ];
  it('shares places on ties', () => {
    expect(placings(players).map((p) => [p.playerId, p.place])).toEqual([
      ['b', 1],
      ['c', 1],
      ['a', 3],
      ['d', 4],
    ]);
  });
  it('returns every player on the top score', () => {
    expect(winnersOf(players).sort()).toEqual(['b', 'c']);
  });
});

describe('shuffleUnlike (FR-66)', () => {
  it('never returns the avoided order', () => {
    const rng = seededRng(1);
    const ids = ['a', 'b', 'c'];
    for (let i = 0; i < 200; i++) expect(shuffleUnlike(ids, ids, rng)).not.toEqual(ids);
  });
});

describe('input validation', () => {
  it('normalises nicknames', () => {
    expect(normalizeNickname('  Бат   Эрдэнэ ')).toBe('Бат Эрдэнэ');
    expect(() => normalizeNickname('   ')).toThrow(GameError);
    expect(() => normalizeNickname('x'.repeat(21))).toThrow(GameError);
  });

  it('validates settings (FR-01–07)', () => {
    const ok = { mode: 'BOTS', maxPlayers: 6, imageCount: 8, imageSource: 'CUSTOM', roundsMode: 3 };
    expect(validateSettings(ok)).toEqual(ok);
    const { mode: _mode, ...legacy } = ok;
    expect(validateSettings(legacy).mode).toBe('HUMANS');
    expect(() => validateSettings({ ...ok, mode: 'ROBOTS' })).toThrow(GameError);
    expect(() => validateSettings({ ...ok, maxPlayers: 11 })).toThrow(GameError);
    expect(() => validateSettings({ ...ok, imageCount: 7 })).toThrow(GameError);
    expect(() => validateSettings({ ...ok, roundsMode: 2 })).toThrow(GameError);
  });
});
