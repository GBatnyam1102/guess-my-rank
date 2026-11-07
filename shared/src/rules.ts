import { IMAGE_COUNT_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, NICKNAME_MAX, ROUNDS_OPTIONS, TITLE_MAX } from './constants';
import { GameError } from './errors';
import { pickOne, type Rng } from './random';
import type { Player, RoomSettings } from './types';

/** One point per image in the same position as the Ranker's order (FR-33, FR-34). */
export function scoreGuess(answer: readonly string[], guess: readonly string[]): number {
  let score = 0;
  for (let i = 0; i < answer.length; i++) {
    if (answer[i] === guess[i]) score++;
  }
  return score;
}

export function isPermutationOf(order: unknown, ids: readonly string[]): order is string[] {
  if (!Array.isArray(order) || order.length !== ids.length) return false;
  const expected = new Set(ids);
  const seen = new Set<string>();
  for (const id of order) {
    if (typeof id !== 'string' || !expected.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/**
 * Picks the next Ranker: random among players who have not ranked in this cycle,
 * preferring online players; a new cycle starts once everyone has ranked (FR-15, 16, 63, 64).
 */
export function pickRanker(
  active: readonly Player[],
  lastRankerId: string | null,
  rng: Rng,
): { rankerId: string; newCycle: boolean } | null {
  let pool = active.filter((p) => !p.rankedInCycle);
  let newCycle = false;
  if (pool.length === 0) {
    newCycle = true;
    pool = active.length > 1 ? active.filter((p) => p.id !== lastRankerId) : active.slice();
  }
  const online = pool.filter((p) => p.connection === 'ONLINE');
  const chosen = pickOne(online.length > 0 ? online : pool, rng);
  return chosen ? { rankerId: chosen.id, newCycle } : null;
}

export interface Placing {
  playerId: string;
  totalScore: number;
  place: number;
}

/** Standard competition ranking: equal scores share a place (1, 1, 3). */
export function placings(players: readonly Pick<Player, 'id' | 'totalScore'>[]): Placing[] {
  const sorted = players.slice().sort((a, b) => b.totalScore - a.totalScore);
  return sorted.map((p) => ({
    playerId: p.id,
    totalScore: p.totalScore,
    place: sorted.findIndex((q) => q.totalScore === p.totalScore) + 1,
  }));
}

/** Everyone sharing the top score wins (FR-43). */
export function winnersOf(players: readonly Pick<Player, 'id' | 'totalScore'>[]): string[] {
  if (players.length === 0) return [];
  const top = Math.max(...players.map((p) => p.totalScore));
  return players.filter((p) => p.totalScore === top).map((p) => p.id);
}

function graphemeLength(value: string): number {
  return [...value].length;
}

export function normalizeNickname(raw: unknown): string {
  if (typeof raw !== 'string') throw new GameError('INVALID_NICKNAME');
  const nickname = raw.replace(/\s+/g, ' ').trim();
  const length = graphemeLength(nickname);
  if (length < 1 || length > NICKNAME_MAX) throw new GameError('INVALID_NICKNAME');
  return nickname;
}

export function normalizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') throw new GameError('INVALID_TITLE');
  const title = raw.replace(/\s+/g, ' ').trim();
  if (graphemeLength(title) > TITLE_MAX) throw new GameError('INVALID_TITLE');
  return title;
}

export function validateSettings(raw: unknown): RoomSettings {
  if (typeof raw !== 'object' || raw === null) throw new GameError('INVALID_SETTINGS');
  const s = raw as Record<string, unknown>;
  // Older clients do not send a mode; they always meant a room for friends.
  const mode = s.mode ?? 'HUMANS';
  const maxPlayers = s.maxPlayers;
  const imageCount = s.imageCount;
  const imageSource = s.imageSource;
  const roundsMode = s.roundsMode;
  const ok =
    (mode === 'HUMANS' || mode === 'BOTS') &&
    typeof maxPlayers === 'number' &&
    Number.isInteger(maxPlayers) &&
    maxPlayers >= MIN_PLAYERS &&
    maxPlayers <= MAX_PLAYERS &&
    (IMAGE_COUNT_OPTIONS as readonly unknown[]).includes(imageCount) &&
    (imageSource === 'RANDOM' || imageSource === 'CUSTOM') &&
    (ROUNDS_OPTIONS as readonly unknown[]).includes(roundsMode);
  if (!ok) throw new GameError('INVALID_SETTINGS');
  return {
    mode,
    maxPlayers,
    imageCount: imageCount as number,
    imageSource,
    roundsMode: roundsMode as RoomSettings['roundsMode'],
  };
}
