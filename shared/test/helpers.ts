import {
  apply,
  buildContentIndex,
  createRoom,
  currentRound,
  DEFAULT_TIMINGS,
  seededRng,
  type Command,
  type ContentCategory,
  type EngineCtx,
  type Notice,
  type RoomSettings,
  type RoomState,
} from '../src';

export function makeCategory(id: string, size: number): ContentCategory {
  return {
    id,
    name: `Category ${id}`,
    emoji: '🎲',
    items: Array.from({ length: size }, (_, i) => ({
      id: `${id}-${i}`,
      categoryId: id,
      imageUrl: `/content/cards/${id}-${i}.svg`,
      title: `${id} ${i}`,
      fact: null,
      sourceUrl: null,
      license: null,
      credit: null,
    })),
  };
}

export const content = buildContentIndex([makeCategory('food', 30), makeCategory('tiny', 4)]);

/** A tiny harness around the pure engine with a controllable clock. */
export class Game {
  state: RoomState;
  now = 1_000_000;
  notices: Notice[] = [];
  private idCounter = 0;
  private readonly rng = seededRng(42);

  constructor(settings: Partial<RoomSettings> = {}, hostName = 'Host', botIds: string[] = []) {
    this.state = createRoom(
      {
        id: 'room-1',
        code: 'ABCDEF',
        inviteToken: 'invite',
        hostId: 'p0',
        nickname: hostName,
        sessionTokenHash: 'hash-p0',
        settings: { mode: 'HUMANS', maxPlayers: 10, imageCount: 5, imageSource: 'RANDOM', roundsMode: 'EACH', ...settings },
        botIds,
      },
      this.now,
    );
  }

  ctx(): EngineCtx {
    return {
      now: this.now,
      rng: this.rng,
      newId: () => `id-${++this.idCounter}`,
      content,
      timings: DEFAULT_TIMINGS,
    };
  }

  run(cmd: Command): Notice[] {
    const res = apply(this.state, cmd, this.ctx());
    this.state = res.state;
    this.notices.push(...res.notices);
    return res.notices;
  }

  advance(ms: number): Notice[] {
    this.now += ms;
    return this.run({ type: 'tick' });
  }

  join(count: number): string[] {
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      const id = `p${i}`;
      this.run({ type: 'join', playerId: id, nickname: `Player ${i}`, sessionTokenHash: `hash-${id}` });
      ids.push(id);
    }
    return ids;
  }

  get round() {
    const r = currentRound(this.state);
    if (!r) throw new Error('no current round');
    return r;
  }

  get ranker() {
    return this.round.rankerId;
  }

  guessers(): string[] {
    return this.state.players.filter((p) => p.leftAt === null && p.id !== this.ranker).map((p) => p.id);
  }

  /** Ranker picks a category and locks the drawn order as-is. Returns the answer order. */
  rankAndLock(order?: (ids: string[]) => string[]): string[] {
    if (this.round.state === 'CATEGORY') {
      this.run({ type: 'chooseCategory', playerId: this.ranker, categoryId: 'food' });
    }
    const ids = this.round.items.map((i) => i.id);
    const answer = order ? order(ids) : ids;
    this.run({ type: 'lock', playerId: this.ranker, order: answer });
    return answer;
  }

  submitAll(answerFor: (playerId: string, answer: string[]) => string[] = (_p, a) => a): void {
    const answer = this.round.answerOrder!;
    for (const g of this.round.guesses.filter((x) => x.status === 'GUESSING')) {
      this.run({ type: 'submitGuess', playerId: g.playerId, order: answerFor(g.playerId, answer) });
    }
  }

  player(id: string) {
    const p = this.state.players.find((x) => x.id === id);
    if (!p) throw new Error(`no player ${id}`);
    return p;
  }
}
