// What server-run bots do next. Pure like the engine: the server only decides *when*
// a move happens (a short, human-looking delay) and then applies its command.
import { activePlayers, currentRound, type Command, type ContentIndex } from './engine';
import { pickOne, shuffle, type Rng } from './random';
import type { RoomState } from './types';

export type BotMoveKind = 'category' | 'addImage' | 'lock' | 'guess';

export interface BotMove {
  /** Stays the same while the move is still due, so the server schedules it only once. */
  key: string;
  kind: BotMoveKind;
  botId: string;
  cmd: Command;
}

export interface BotCtx {
  rng: Rng;
  newId: () => string;
  content: ContentIndex;
}

export function botMoves(s: RoomState, ctx: BotCtx): BotMove[] {
  const r = currentRound(s);
  if (!r) return [];
  const bots = new Set(activePlayers(s).filter((p) => p.isBot).map((p) => p.id));
  if (bots.size === 0) return [];
  const moves: BotMove[] = [];
  const keyFor = (botId: string) => `${r.id}:${r.state}:${botId}:${r.items.length}`;
  const rankerId = bots.has(r.rankerId) ? r.rankerId : null;

  if (rankerId && r.state === 'CATEGORY') {
    const category = pickOne(
      ctx.content.categories.filter((c) => c.items.length >= s.settings.imageCount),
      ctx.rng,
    );
    if (category) {
      moves.push({
        key: keyFor(rankerId),
        kind: 'category',
        botId: rankerId,
        cmd: { type: 'chooseCategory', playerId: rankerId, categoryId: category.id },
      });
    }
  }

  if (rankerId && r.state === 'RANKING') {
    if (r.items.length < s.settings.imageCount) {
      // A bot has no photos of its own, so in a custom-image game it brings library pictures.
      const used = new Set(r.items.map((i) => i.imageUrl));
      const item = pickOne(
        ctx.content.categories.flatMap((c) => c.items).filter((i) => !used.has(i.imageUrl)),
        ctx.rng,
      );
      if (s.settings.imageSource === 'CUSTOM' && item) {
        moves.push({
          key: keyFor(rankerId),
          kind: 'addImage',
          botId: rankerId,
          cmd: {
            type: 'addCustomItem',
            playerId: rankerId,
            item: {
              id: ctx.newId(),
              imageUrl: item.imageUrl,
              title: item.title,
              fact: item.fact,
              sourceUrl: item.sourceUrl,
              uploadId: null,
            },
          },
        });
      }
    } else {
      moves.push({
        key: keyFor(rankerId),
        kind: 'lock',
        botId: rankerId,
        cmd: { type: 'lock', playerId: rankerId, order: shuffle(r.items.map((i) => i.id), ctx.rng) },
      });
    }
  }

  if (r.state === 'GUESSING') {
    for (const g of r.guesses) {
      if (g.status !== 'GUESSING' || !bots.has(g.playerId)) continue;
      moves.push({
        key: keyFor(g.playerId),
        kind: 'guess',
        botId: g.playerId,
        cmd: { type: 'submitGuess', playerId: g.playerId, order: shuffle(g.shownOrder, ctx.rng) },
      });
    }
  }
  return moves;
}
