// Builds the per-player view. The Ranker's answer order is only included for the
// Ranker themself or once the round reaches REVEAL (NFR-03, FR-66).
import { MAX_REFRESH, type Timings } from './constants';
import { activePlayers, currentRound, plannedRounds, type ContentIndex } from './engine';
import { placings, winnersOf } from './rules';
import type { RoomState, Round, RoundItem } from './types';
import type { CategoryOption, ItemView, LeaderboardEntry, PlayerView, PublicPlayer, RoundView } from './view';

export interface ProjectionOptions {
  now: number;
  content: ContentIndex;
  timings: Timings;
}

function itemView(i: RoundItem): ItemView {
  return { id: i.id, imageUrl: i.imageUrl, title: i.title, fact: i.fact, sourceUrl: i.sourceUrl, kind: i.kind };
}

function inOrder(items: readonly RoundItem[], order: readonly string[]): ItemView[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return order.map((id) => byId.get(id)).filter((i): i is RoundItem => i !== undefined).map(itemView);
}

function roundView(s: RoomState, r: Round, viewerId: string, content: ContentIndex): RoundView {
  const isRanker = r.rankerId === viewerId;
  const guess = r.guesses.find((g) => g.playerId === viewerId) ?? null;
  const revealed = r.state === 'REVEAL';
  const myRole = isRanker ? 'RANKER' : guess ? 'GUESSER' : r.state === 'GUESSING' || revealed ? 'SPECTATOR' : 'GUESSER';

  let items: ItemView[] | null = null;
  if (revealed && r.answerOrder) {
    items = inOrder(r.items, r.answerOrder);
  } else if (isRanker && r.state === 'RANKING') {
    items = r.items.map(itemView);
  } else if (isRanker && r.state === 'GUESSING' && r.answerOrder) {
    items = inOrder(r.items, r.answerOrder);
  } else if (guess && r.state === 'GUESSING') {
    items = inOrder(r.items, guess.shownOrder);
  }

  const tracksGuesses = r.state === 'GUESSING' || revealed;
  const submitted = r.guesses.filter((g) => g.status === 'SUBMITTED').length;
  const skipped = r.guesses.filter((g) => g.status === 'SKIPPED').length;

  return {
    id: r.id,
    number: r.number,
    rankerId: r.rankerId,
    state: r.state,
    deadlineAt: r.deadlineAt,
    skipReason: r.skipReason,
    categoryName: r.categoryId ? (content.get(r.categoryId)?.name ?? null) : null,
    refreshLeft: Math.max(0, MAX_REFRESH - r.refreshCount),
    imageCount: s.settings.imageCount,
    myRole,
    items,
    myGuess: guess
      ? { status: guess.status, order: guess.order, score: revealed ? guess.score : null }
      : null,
    guessStatuses: tracksGuesses ? r.guesses.map((g) => ({ playerId: g.playerId, status: g.status })) : [],
    progress: tracksGuesses ? { submitted, skipped, total: r.guesses.length } : null,
    reveal:
      revealed && r.answerOrder
        ? {
            answerOrder: r.answerOrder,
            guesses: r.guesses.map((g) => ({
              playerId: g.playerId,
              order: g.status === 'SUBMITTED' ? g.order : null,
              status: g.status,
              score: g.status === 'SUBMITTED' ? g.score : 0,
            })),
          }
        : null,
  };
}

export function projectFor(s: RoomState, viewerId: string, opts: ProjectionOptions): PlayerView {
  const { content, timings } = opts;
  const inLobby = s.status === 'LOBBY';
  const visiblePlayers = inLobby ? activePlayers(s) : s.players;

  const players: PublicPlayer[] = visiblePlayers.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    isBot: p.isBot,
    connection: p.connection,
    totalScore: p.totalScore,
    isHost: p.id === s.hostPlayerId,
    left: p.leftAt !== null,
    graceDeadlineAt:
      p.connection === 'OFFLINE' && p.leftAt === null && p.disconnectedAt !== null
        ? p.disconnectedAt + timings.disconnectGraceMs
        : null,
  }));

  const r = currentRound(s);
  const round = r ? roundView(s, r, viewerId, content) : null;

  let categories: CategoryOption[] | null = null;
  if (r && r.state === 'CATEGORY' && r.rankerId === viewerId) {
    categories = content.categories
      .filter((c) => c.items.length >= s.settings.imageCount)
      .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, itemCount: c.items.length }));
  }

  const byId = new Map(s.players.map((p) => [p.id, p]));
  const leaderboard: LeaderboardEntry[] = inLobby
    ? []
    : [
        ...placings(activePlayers(s)).map((pl) => ({
          playerId: pl.playerId,
          nickname: byId.get(pl.playerId)?.nickname ?? '',
          isBot: byId.get(pl.playerId)?.isBot ?? false,
          totalScore: pl.totalScore,
          place: pl.place,
          left: false,
        })),
        ...s.players
          .filter((p) => p.leftAt !== null)
          .map((p) => ({
            playerId: p.id,
            nickname: p.nickname,
            isBot: p.isBot,
            totalScore: p.totalScore,
            place: 0,
            left: true,
          })),
      ];

  return {
    serverNow: opts.now,
    meId: viewerId,
    room: {
      id: s.id,
      code: s.code,
      inviteToken: s.inviteToken,
      status: s.status,
      hostPlayerId: s.hostPlayerId,
      settings: s.settings,
      plannedRounds: s.status === 'LOBBY' && s.settings.roundsMode === 'EACH' ? activePlayers(s).length : plannedRounds(s),
      endReason: s.endReason,
    },
    players,
    round,
    categories,
    leaderboard,
    final: s.status === 'FINISHED' ? { winnerIds: winnersOf(activePlayers(s)) } : null,
  };
}
