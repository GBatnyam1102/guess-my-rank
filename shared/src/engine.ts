// Pure game engine. The server owns the only copy of RoomState and feeds every
// player action and timer tick through `apply` (NFR-05, NFR-11). No I/O here, so
// rules, timers and Ranker selection are tested without a server.

import { BOT_NAMES, MAX_REFRESH, MIN_PLAYERS, type Timings } from './constants';
import { GameError } from './errors';
import { shuffle, shuffleUnlike, type Rng } from './random';
import {
  isPermutationOf,
  normalizeNickname,
  normalizeTitle,
  pickRanker,
  scoreGuess,
  validateSettings,
  winnersOf,
} from './rules';
import type {
  Connection,
  ContentCategory,
  ContentItem,
  EndReason,
  Guess,
  Player,
  RoomState,
  Round,
  RoundItem,
  SkipReason,
} from './types';

export interface ContentIndex {
  categories: readonly ContentCategory[];
  get(id: string): ContentCategory | undefined;
}

export function buildContentIndex(categories: readonly ContentCategory[]): ContentIndex {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return { categories, get: (id) => byId.get(id) };
}

export interface EngineCtx {
  now: number;
  rng: Rng;
  newId: () => string;
  content: ContentIndex;
  timings: Timings;
}

export type Command =
  | { type: 'join'; playerId: string; nickname: string; sessionTokenHash: string }
  | { type: 'reconnect'; playerId: string }
  | { type: 'disconnect'; playerId: string }
  | { type: 'leave'; playerId: string }
  | { type: 'addBot'; playerId: string; botId: string }
  | { type: 'removeBot'; playerId: string; botId: string }
  | { type: 'start'; playerId: string }
  | { type: 'end'; playerId: string }
  | { type: 'playAgain'; playerId: string }
  | { type: 'chooseCategory'; playerId: string; categoryId: string }
  | { type: 'refresh'; playerId: string }
  | { type: 'addCustomItem'; playerId: string; item: Omit<RoundItem, 'kind' | 'contentItemId'> }
  | { type: 'removeCustomItem'; playerId: string; itemId: string }
  | { type: 'renameCustomItem'; playerId: string; itemId: string; title: string }
  | { type: 'lock'; playerId: string; order: string[] }
  | { type: 'submitGuess'; playerId: string; order: string[] }
  | { type: 'tick' };

export type Notice =
  | { type: 'roundStarted'; roundNumber: number; rankerId: string }
  | { type: 'guessProgress'; submitted: number; total: number }
  | { type: 'playerConnection'; playerId: string; connection: Connection; graceDeadlineAt: number | null }
  | { type: 'reveal'; roundNumber: number }
  | { type: 'final'; winnerIds: string[]; reason: EndReason }
  | { type: 'hostChanged'; playerId: string }
  | { type: 'roundSkipped'; roundNumber: number; reason: SkipReason }
  | { type: 'uploadsReleased'; uploadIds: string[] };

export interface ApplyResult {
  state: RoomState;
  notices: Notice[];
  changed: boolean;
}

interface Tx {
  s: RoomState;
  ctx: EngineCtx;
  notices: Notice[];
}

// ---------- queries ----------

export function activePlayers(s: RoomState): Player[] {
  return s.players.filter((p) => p.leftAt === null);
}

export function activeHumans(s: RoomState): Player[] {
  return activePlayers(s).filter((p) => !p.isBot);
}

export function currentRound(s: RoomState): Round | null {
  if (s.status !== 'IN_GAME') return null;
  return s.rounds[s.rounds.length - 1] ?? null;
}

/** Fixed modes play N rounds; "each once" ends when every remaining player has ranked (Q-6). */
export function plannedRounds(s: RoomState): number {
  if (s.settings.roundsMode !== 'EACH') return s.settings.roundsMode;
  const waiting = activePlayers(s).filter((p) => !p.rankedInCycle).length;
  return s.rounds.length + waiting;
}

/** Earliest moment at which a `tick` would change something, or null. */
export function nextDeadline(s: RoomState, timings: Timings): number | null {
  const times: number[] = [];
  const host = s.players.find((p) => p.id === s.hostPlayerId);
  if (host && host.connection === 'OFFLINE' && host.disconnectedAt !== null && hostCandidate(s, true)) {
    times.push(host.disconnectedAt + timings.hostGraceMs);
  }
  const r = currentRound(s);
  if (r) {
    if (r.deadlineAt !== null) times.push(r.deadlineAt);
    if (r.state === 'CATEGORY' || r.state === 'RANKING') {
      const ranker = s.players.find((p) => p.id === r.rankerId);
      if (ranker && ranker.connection === 'OFFLINE' && ranker.disconnectedAt !== null) {
        times.push(ranker.disconnectedAt + timings.disconnectGraceMs);
      }
    }
    if (r.state === 'GUESSING') {
      for (const g of r.guesses) {
        if (g.status === 'DISCONNECTED' && g.disconnectedAt !== null) {
          times.push(g.disconnectedAt + timings.disconnectGraceMs);
        }
      }
    }
  }
  return times.length > 0 ? Math.min(...times) : null;
}

// ---------- room creation ----------

export interface CreateRoomInput {
  id: string;
  code: string;
  inviteToken: string;
  hostId: string;
  nickname: unknown;
  sessionTokenHash: string;
  settings: unknown;
  /** Bot rooms start with these bots (1 … maxPlayers − 1); a room for friends has none. */
  botIds?: readonly string[];
}

export function createRoom(input: CreateRoomInput, now: number): RoomState {
  const settings = validateSettings(input.settings);
  const nickname = normalizeNickname(input.nickname);
  const botIds = input.botIds ?? [];
  const botsOk =
    settings.mode === 'BOTS' ? botIds.length >= 1 && botIds.length < settings.maxPlayers : botIds.length === 0;
  if (!botsOk) throw new GameError('INVALID_SETTINGS');
  const s: RoomState = {
    id: input.id,
    code: input.code,
    inviteToken: input.inviteToken,
    status: 'LOBBY',
    hostPlayerId: input.hostId,
    settings,
    players: [newPlayer(input.hostId, nickname, input.sessionTokenHash, now)],
    rounds: [],
    endReason: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    version: 1,
  };
  for (const id of botIds) s.players.push(newBot(s, id, now));
  return s;
}

function newPlayer(id: string, nickname: string, sessionTokenHash: string, now: number, isBot = false): Player {
  return {
    id,
    nickname,
    isBot,
    sessionTokenHash,
    connection: 'ONLINE',
    disconnectedAt: null,
    rankedInCycle: false,
    totalScore: 0,
    joinedAt: now,
    leftAt: null,
  };
}

/** The first free bot name, so bots never clash with each other or with the player. */
function newBot(s: RoomState, id: string, now: number): Player {
  const taken = new Set(activePlayers(s).map((p) => p.nickname.toLowerCase()));
  let name: string | undefined = BOT_NAMES.find((n) => !taken.has(n.toLowerCase()));
  for (let n = 1; !name; n++) if (!taken.has(`бот ${n}`)) name = `Бот ${n}`;
  // An empty session hash can never match a real token, so nobody can take a bot over.
  return newPlayer(id, name, '', now, true);
}

// ---------- apply ----------

export function apply(state: RoomState, cmd: Command, ctx: EngineCtx): ApplyResult {
  const before = JSON.stringify(state);
  const t: Tx = { s: structuredClone(state), ctx, notices: [] };
  advance(t);
  run(t, cmd);
  advance(t);
  const changed = JSON.stringify(t.s) !== before;
  if (changed) {
    t.s.updatedAt = ctx.now;
    t.s.version += 1;
  }
  return { state: t.s, notices: t.notices, changed };
}

function run(t: Tx, cmd: Command): void {
  switch (cmd.type) {
    case 'join':
      return join(t, cmd.playerId, cmd.nickname, cmd.sessionTokenHash);
    case 'reconnect':
      return reconnect(t, cmd.playerId);
    case 'disconnect':
      return disconnect(t, cmd.playerId);
    case 'leave':
      return leave(t, cmd.playerId);
    case 'addBot':
      return addBot(t, cmd.playerId, cmd.botId);
    case 'removeBot':
      return removeBot(t, cmd.playerId, cmd.botId);
    case 'start':
      return start(t, cmd.playerId);
    case 'end':
      return end(t, cmd.playerId);
    case 'playAgain':
      return playAgain(t, cmd.playerId);
    case 'chooseCategory':
      return chooseCategory(t, cmd.playerId, cmd.categoryId);
    case 'refresh':
      return refresh(t, cmd.playerId);
    case 'addCustomItem':
      return addCustomItem(t, cmd.playerId, cmd.item);
    case 'removeCustomItem':
      return removeCustomItem(t, cmd.playerId, cmd.itemId);
    case 'renameCustomItem':
      return renameCustomItem(t, cmd.playerId, cmd.itemId, cmd.title);
    case 'lock':
      return lock(t, cmd.playerId, cmd.order);
    case 'submitGuess':
      return submitGuess(t, cmd.playerId, cmd.order);
    case 'tick':
      return;
  }
}

// ---------- lobby & membership ----------

function join(t: Tx, playerId: string, rawNickname: string, sessionTokenHash: string): void {
  const { s } = t;
  if (s.settings.mode === 'BOTS') throw new GameError('BOT_ROOM');
  // Joining is lobby-only; afterwards players can only rejoin with their session (Q-5).
  if (s.status !== 'LOBBY') throw new GameError('GAME_ALREADY_STARTED');
  const nickname = normalizeNickname(rawNickname);
  const active = activePlayers(s);
  if (active.length >= s.settings.maxPlayers) throw new GameError('ROOM_FULL');
  if (active.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
    throw new GameError('NICKNAME_TAKEN');
  }
  s.players.push(newPlayer(playerId, nickname, sessionTokenHash, t.ctx.now));
}

function requirePlayer(s: RoomState, playerId: string): Player {
  const p = s.players.find((x) => x.id === playerId);
  if (!p || p.leftAt !== null) throw new GameError('NOT_IN_ROOM');
  return p;
}

function requireHost(s: RoomState, playerId: string): Player {
  const p = requirePlayer(s, playerId);
  if (s.hostPlayerId !== p.id) throw new GameError('NOT_HOST');
  return p;
}

function reconnect(t: Tx, playerId: string): void {
  const p = requirePlayer(t.s, playerId);
  if (p.connection === 'ONLINE') return;
  p.connection = 'ONLINE';
  p.disconnectedAt = null;
  const r = currentRound(t.s);
  if (r?.state === 'GUESSING') {
    const g = r.guesses.find((x) => x.playerId === playerId);
    if (g?.status === 'DISCONNECTED') {
      g.status = 'GUESSING';
      g.disconnectedAt = null;
    }
  }
  t.notices.push({ type: 'playerConnection', playerId, connection: 'ONLINE', graceDeadlineAt: null });
}

function disconnect(t: Tx, playerId: string): void {
  const p = t.s.players.find((x) => x.id === playerId);
  if (!p || p.leftAt !== null || p.connection === 'OFFLINE') return;
  const now = t.ctx.now;
  p.connection = 'OFFLINE';
  p.disconnectedAt = now;
  const r = currentRound(t.s);
  if (r?.state === 'GUESSING') {
    const g = r.guesses.find((x) => x.playerId === playerId);
    if (g?.status === 'GUESSING') {
      g.status = 'DISCONNECTED';
      g.disconnectedAt = now;
    }
  }
  t.notices.push({
    type: 'playerConnection',
    playerId,
    connection: 'OFFLINE',
    graceDeadlineAt: now + t.ctx.timings.disconnectGraceMs,
  });
}

function leave(t: Tx, playerId: string): void {
  const { s } = t;
  const p = requirePlayer(s, playerId);
  if (s.status === 'LOBBY') {
    s.players = s.players.filter((x) => x.id !== playerId);
  } else {
    p.leftAt = t.ctx.now;
    p.connection = 'OFFLINE';
    p.disconnectedAt ??= t.ctx.now;
    const r = currentRound(s);
    if (r?.state === 'GUESSING') {
      const g = r.guesses.find((x) => x.playerId === playerId);
      if (g && (g.status === 'GUESSING' || g.status === 'DISCONNECTED')) g.status = 'SKIPPED';
    }
    // A Ranker who leaves is handled by advance(): the round is skipped.
  }
  if (s.hostPlayerId === playerId) transferHost(t, false);
}

function addBot(t: Tx, playerId: string, botId: string): void {
  const { s } = t;
  requireHost(s, playerId);
  if (s.settings.mode !== 'BOTS') throw new GameError('NOT_A_BOT_ROOM');
  if (s.status !== 'LOBBY') throw new GameError('WRONG_STATE');
  if (activePlayers(s).length >= s.settings.maxPlayers) throw new GameError('ROOM_FULL');
  s.players.push(newBot(s, botId, t.ctx.now));
}

function removeBot(t: Tx, playerId: string, botId: string): void {
  const { s } = t;
  requireHost(s, playerId);
  if (s.status !== 'LOBBY') throw new GameError('WRONG_STATE');
  if (!s.players.some((p) => p.id === botId && p.isBot)) throw new GameError('BOT_NOT_FOUND');
  s.players = s.players.filter((p) => p.id !== botId);
}

function hostCandidate(s: RoomState, onlineOnly: boolean): Player | undefined {
  const others = activeHumans(s)
    .filter((p) => p.id !== s.hostPlayerId)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  return others.find((p) => p.connection === 'ONLINE') ?? (onlineOnly ? undefined : others[0]);
}

function transferHost(t: Tx, onlineOnly: boolean): boolean {
  const next = hostCandidate(t.s, onlineOnly);
  if (!next) return false;
  t.s.hostPlayerId = next.id;
  t.notices.push({ type: 'hostChanged', playerId: next.id });
  return true;
}

function start(t: Tx, playerId: string): void {
  const { s } = t;
  requireHost(s, playerId);
  if (s.status !== 'LOBBY') throw new GameError('WRONG_STATE');
  const active = activePlayers(s);
  if (active.length < MIN_PLAYERS) throw new GameError('NOT_ENOUGH_PLAYERS');
  s.status = 'IN_GAME';
  s.rounds = [];
  s.endReason = null;
  s.finishedAt = null;
  for (const p of active) {
    p.totalScore = 0;
    p.rankedInCycle = false;
  }
  startNextRound(t);
}

function end(t: Tx, playerId: string): void {
  requireHost(t.s, playerId);
  if (t.s.status !== 'IN_GAME') throw new GameError('WRONG_STATE');
  finish(t, 'HOST_ENDED');
}

function playAgain(t: Tx, playerId: string): void {
  const { s } = t;
  requireHost(s, playerId);
  if (s.status !== 'FINISHED') throw new GameError('WRONG_STATE');
  s.players = activePlayers(s);
  for (const p of s.players) {
    p.totalScore = 0;
    p.rankedInCycle = false;
  }
  s.status = 'LOBBY';
  s.rounds = [];
  s.endReason = null;
  s.finishedAt = null;
}

// ---------- Ranker ----------

function requireRankerRound(t: Tx, playerId: string, state: Round['state']): Round {
  requirePlayer(t.s, playerId);
  const r = currentRound(t.s);
  if (!r) throw new GameError('WRONG_STATE');
  if (r.rankerId !== playerId) throw new GameError('NOT_RANKER');
  if (r.state !== state) throw new GameError('WRONG_STATE');
  return r;
}

function toRoundItem(item: ContentItem, newId: () => string): RoundItem {
  return {
    id: newId(),
    imageUrl: item.imageUrl,
    title: item.title,
    fact: item.fact,
    sourceUrl: item.sourceUrl,
    kind: 'RANDOM',
    contentItemId: item.id,
    uploadId: null,
  };
}

/** Draws `count` distinct items, preferring ones not yet shown this round (FR-50). */
export function drawItems(
  category: ContentCategory,
  count: number,
  used: readonly string[],
  current: readonly string[],
  rng: Rng,
): ContentItem[] {
  const usedSet = new Set(used);
  const currentSet = new Set(current);
  const fresh = shuffle(category.items.filter((i) => !usedSet.has(i.id)), rng);
  const seenBefore = shuffle(category.items.filter((i) => usedSet.has(i.id) && !currentSet.has(i.id)), rng);
  const showingNow = shuffle(category.items.filter((i) => currentSet.has(i.id)), rng);
  const picked = [...fresh, ...seenBefore, ...showingNow].slice(0, count);
  return shuffle(picked, rng);
}

function chooseCategory(t: Tx, playerId: string, categoryId: string): void {
  const { s, ctx } = t;
  const r = requireRankerRound(t, playerId, 'CATEGORY');
  if (s.settings.imageSource !== 'RANDOM') throw new GameError('WRONG_STATE');
  const category = typeof categoryId === 'string' ? ctx.content.get(categoryId) : undefined;
  if (!category) throw new GameError('UNKNOWN_CATEGORY');
  if (category.items.length < s.settings.imageCount) throw new GameError('CATEGORY_TOO_SMALL');
  const picked = drawItems(category, s.settings.imageCount, [], [], ctx.rng);
  r.categoryId = category.id;
  r.items = picked.map((i) => toRoundItem(i, ctx.newId));
  r.usedContentIds = picked.map((i) => i.id);
  r.state = 'RANKING';
}

function refresh(t: Tx, playerId: string): void {
  const { s, ctx } = t;
  const r = requireRankerRound(t, playerId, 'RANKING');
  if (s.settings.imageSource !== 'RANDOM' || !r.categoryId) throw new GameError('WRONG_STATE');
  if (r.refreshCount >= MAX_REFRESH) throw new GameError('REFRESH_LIMIT');
  const category = ctx.content.get(r.categoryId);
  if (!category) throw new GameError('UNKNOWN_CATEGORY');
  const current = r.items.map((i) => i.contentItemId).filter((id): id is string => id !== null);
  // Refresh replaces the whole set (Q-9).
  const picked = drawItems(category, s.settings.imageCount, r.usedContentIds, current, ctx.rng);
  r.items = picked.map((i) => toRoundItem(i, ctx.newId));
  r.usedContentIds = [...new Set([...r.usedContentIds, ...picked.map((i) => i.id)])];
  r.refreshCount += 1;
}

function addCustomItem(t: Tx, playerId: string, item: Omit<RoundItem, 'kind' | 'contentItemId'>): void {
  const { s } = t;
  const r = requireRankerRound(t, playerId, 'RANKING');
  if (s.settings.imageSource !== 'CUSTOM') throw new GameError('WRONG_STATE');
  if (r.items.length >= s.settings.imageCount) throw new GameError('TOO_MANY_IMAGES');
  r.items.push({ ...item, title: normalizeTitle(item.title), kind: 'CUSTOM', contentItemId: null });
}

function removeCustomItem(t: Tx, playerId: string, itemId: string): void {
  const r = requireRankerRound(t, playerId, 'RANKING');
  if (t.s.settings.imageSource !== 'CUSTOM') throw new GameError('WRONG_STATE');
  const index = r.items.findIndex((i) => i.id === itemId);
  if (index < 0) throw new GameError('ITEM_NOT_FOUND');
  const [removed] = r.items.splice(index, 1);
  if (removed?.uploadId) t.notices.push({ type: 'uploadsReleased', uploadIds: [removed.uploadId] });
}

function renameCustomItem(t: Tx, playerId: string, itemId: string, title: string): void {
  const r = requireRankerRound(t, playerId, 'RANKING');
  if (t.s.settings.imageSource !== 'CUSTOM') throw new GameError('WRONG_STATE');
  const item = r.items.find((i) => i.id === itemId);
  if (!item) throw new GameError('ITEM_NOT_FOUND');
  item.title = normalizeTitle(title);
}

function lock(t: Tx, playerId: string, order: unknown): void {
  const { s, ctx } = t;
  const r = requireRankerRound(t, playerId, 'RANKING');
  if (r.items.length !== s.settings.imageCount) throw new GameError('NOT_ENOUGH_IMAGES');
  if (r.items.some((i) => i.title.length === 0)) throw new GameError('MISSING_TITLE');
  const ids = r.items.map((i) => i.id);
  if (!isPermutationOf(order, ids)) throw new GameError('INVALID_ORDER');
  r.answerOrder = order.slice();
  r.state = 'GUESSING';
  r.deadlineAt = ctx.now + ctx.timings.guessingMs;
  r.guesses = activePlayers(s)
    .filter((p) => p.id !== r.rankerId)
    .map<Guess>((p) => ({
      id: ctx.newId(),
      playerId: p.id,
      shownOrder: shuffleUnlike(ids, order, ctx.rng),
      order: null,
      status: p.connection === 'ONLINE' ? 'GUESSING' : 'DISCONNECTED',
      disconnectedAt: p.connection === 'ONLINE' ? null : (p.disconnectedAt ?? ctx.now),
      score: 0,
      submittedAt: null,
    }));
  pushProgress(t, r);
}

// ---------- Guesser ----------

function submitGuess(t: Tx, playerId: string, order: unknown): void {
  requirePlayer(t.s, playerId);
  const r = currentRound(t.s);
  if (!r || r.state !== 'GUESSING' || !r.answerOrder) throw new GameError('WRONG_STATE');
  const g = r.guesses.find((x) => x.playerId === playerId);
  if (!g) throw new GameError('NOT_A_GUESSER');
  if (g.status === 'SUBMITTED') throw new GameError('ALREADY_SUBMITTED');
  if (g.status === 'SKIPPED') throw new GameError('GUESS_SKIPPED');
  if (!isPermutationOf(order, r.items.map((i) => i.id))) throw new GameError('INVALID_ORDER');
  g.order = order.slice();
  g.status = 'SUBMITTED';
  g.submittedAt = t.ctx.now;
  g.disconnectedAt = null;
  g.score = scoreGuess(r.answerOrder, g.order);
  pushProgress(t, r);
}

function pushProgress(t: Tx, r: Round): void {
  const submitted = r.guesses.filter((g) => g.status === 'SUBMITTED').length;
  t.notices.push({ type: 'guessProgress', submitted, total: r.guesses.length });
}

// ---------- automatic transitions ----------

function advance(t: Tx): void {
  for (let guard = 0; guard < 64; guard++) {
    if (!step(t)) return;
  }
  throw new Error('advance() did not settle');
}

function step(t: Tx): boolean {
  const { s, ctx } = t;
  const now = ctx.now;
  const T = ctx.timings;

  const host = s.players.find((p) => p.id === s.hostPlayerId);
  if (
    host &&
    host.leftAt === null &&
    host.connection === 'OFFLINE' &&
    host.disconnectedAt !== null &&
    now >= host.disconnectedAt + T.hostGraceMs &&
    transferHost(t, true)
  ) {
    return true;
  }

  if (s.status !== 'IN_GAME') return false;
  // Bots never play on their own once every person has left.
  if (activePlayers(s).length < MIN_PLAYERS || activeHumans(s).length === 0) {
    finish(t, 'NOT_ENOUGH_PLAYERS');
    return true;
  }
  const r = currentRound(s);
  if (!r) {
    startNextRound(t);
    return true;
  }

  switch (r.state) {
    case 'CATEGORY':
    case 'RANKING': {
      const ranker = s.players.find((p) => p.id === r.rankerId);
      if (!ranker || ranker.leftAt !== null) {
        skipRound(t, r, 'RANKER_LEFT');
        return true;
      }
      if (
        ranker.connection === 'OFFLINE' &&
        ranker.disconnectedAt !== null &&
        now >= ranker.disconnectedAt + T.disconnectGraceMs
      ) {
        skipRound(t, r, 'RANKER_OFFLINE');
        return true;
      }
      if (r.deadlineAt !== null && now >= r.deadlineAt) {
        skipRound(t, r, 'RANKER_TIMEOUT');
        return true;
      }
      return false;
    }
    case 'GUESSING': {
      let changed = false;
      const timeUp = r.deadlineAt !== null && now >= r.deadlineAt;
      for (const g of r.guesses) {
        const graceOver =
          g.status === 'DISCONNECTED' && g.disconnectedAt !== null && now >= g.disconnectedAt + T.disconnectGraceMs;
        if (graceOver || (timeUp && (g.status === 'GUESSING' || g.status === 'DISCONNECTED'))) {
          g.status = 'SKIPPED';
          g.score = 0;
          changed = true;
        }
      }
      // Reveal opens only when every Guesser has submitted or been skipped (FR-32).
      if (r.guesses.every((g) => g.status === 'SUBMITTED' || g.status === 'SKIPPED')) {
        reveal(t, r);
        return true;
      }
      if (changed) pushProgress(t, r);
      return changed;
    }
    case 'REVEAL':
    case 'SKIPPED':
      if (r.deadlineAt !== null && now >= r.deadlineAt) {
        startNextRound(t);
        return true;
      }
      return false;
  }
}

function startNextRound(t: Tx): void {
  const { s, ctx } = t;
  if (s.rounds.length >= plannedRounds(s)) {
    finish(t, 'COMPLETED');
    return;
  }
  const active = activePlayers(s);
  const lastRankerId = s.rounds[s.rounds.length - 1]?.rankerId ?? null;
  const pick = pickRanker(active, lastRankerId, ctx.rng);
  if (!pick) {
    finish(t, 'NOT_ENOUGH_PLAYERS');
    return;
  }
  if (pick.newCycle) for (const p of active) p.rankedInCycle = false;
  const ranker = active.find((p) => p.id === pick.rankerId)!;
  ranker.rankedInCycle = true;
  const custom = s.settings.imageSource === 'CUSTOM';
  const round: Round = {
    id: ctx.newId(),
    number: s.rounds.length + 1,
    rankerId: ranker.id,
    categoryId: null,
    state: custom ? 'RANKING' : 'CATEGORY',
    refreshCount: 0,
    items: [],
    usedContentIds: [],
    answerOrder: null,
    deadlineAt: ctx.now + (custom ? ctx.timings.rankingCustomMs : ctx.timings.rankingRandomMs),
    guesses: [],
    startedAt: ctx.now,
    skipReason: null,
  };
  s.rounds.push(round);
  t.notices.push({ type: 'roundStarted', roundNumber: round.number, rankerId: ranker.id });
}

function reveal(t: Tx, r: Round): void {
  const { s, ctx } = t;
  r.state = 'REVEAL';
  r.deadlineAt = ctx.now + ctx.timings.revealMs;
  // The Ranker scores nothing for their own round (FR-35).
  for (const g of r.guesses) {
    if (g.status !== 'SUBMITTED') continue;
    const p = s.players.find((x) => x.id === g.playerId);
    if (p) p.totalScore += g.score;
  }
  t.notices.push({ type: 'reveal', roundNumber: r.number });
}

function skipRound(t: Tx, r: Round, reason: SkipReason): void {
  r.state = 'SKIPPED';
  r.skipReason = reason;
  r.deadlineAt = t.ctx.now + t.ctx.timings.skippedRoundMs;
  t.notices.push({ type: 'roundSkipped', roundNumber: r.number, reason });
}

function finish(t: Tx, reason: EndReason): void {
  const { s } = t;
  s.status = 'FINISHED';
  s.finishedAt = t.ctx.now;
  s.endReason = reason;
  t.notices.push({ type: 'final', winnerIds: winnersOf(activePlayers(s)), reason });
}
