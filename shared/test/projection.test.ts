import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS, projectFor } from '../src';
import { content, Game } from './helpers';

const view = (g: Game, playerId: string) =>
  projectFor(g.state, playerId, { now: g.now, content, timings: DEFAULT_TIMINGS });

describe('projection security (NFR-03, FR-66)', () => {
  it('never exposes the Ranker order to Guessers before REVEAL', () => {
    const g = new Game();
    g.join(3);
    g.run({ type: 'start', playerId: 'p0' });
    g.run({ type: 'chooseCategory', playerId: g.ranker, categoryId: 'food' });

    for (const id of g.guessers()) {
      const v = view(g, id);
      expect(v.round!.items).toBeNull();
      expect(v.categories).toBeNull();
    }

    const answer = g.rankAndLock((ids) => [...ids].reverse());
    const [first] = g.guessers() as [string];
    const firstGuess = g.round.guesses.find((x) => x.playerId === first)!;
    g.run({ type: 'submitGuess', playerId: first, order: firstGuess.shownOrder });

    for (const id of g.guessers()) {
      const v = view(g, id);
      const guess = g.round.guesses.find((x) => x.playerId === id)!;
      expect(v.round!.reveal).toBeNull();
      expect(v.round!.items!.map((i) => i.id)).toEqual(guess.shownOrder);
      // No other Guesser's order either.
      const others = g.round.guesses.filter((x) => x.playerId !== id && x.order);
      const json = JSON.stringify(v);
      for (const o of others) expect(json).not.toContain(JSON.stringify(o.order));
      expect(json).not.toContain(JSON.stringify(answer));
    }

    const rankerView = view(g, g.ranker);
    expect(rankerView.round!.items!.map((i) => i.id)).toEqual(answer);
  });

  it('shows the answer, every guess and scores once revealed (FR-36, FR-56–60)', () => {
    const g = new Game();
    g.join(2);
    g.run({ type: 'start', playerId: 'p0' });
    const answer = g.rankAndLock();
    g.submitAll();
    const v = view(g, g.guessers()[0]!);
    expect(v.round!.state).toBe('REVEAL');
    expect(v.round!.reveal!.answerOrder).toEqual(answer);
    expect(v.round!.reveal!.guesses).toHaveLength(2);
    expect(v.round!.myGuess!.score).toBe(5);
    expect(v.leaderboard[0]!.totalScore).toBe(5);
  });

  it('offers categories only to the Ranker during CATEGORY', () => {
    const g = new Game();
    g.join(1);
    g.run({ type: 'start', playerId: 'p0' });
    const v = view(g, g.ranker);
    expect(v.categories!.map((c) => c.id)).toEqual(['food']);
  });

  it('marks joint winners on the final screen (FR-43)', () => {
    const g = new Game({ roundsMode: 1 });
    g.join(2);
    g.run({ type: 'start', playerId: 'p0' });
    g.rankAndLock();
    const guessers = g.guessers();
    g.submitAll();
    g.advance(DEFAULT_TIMINGS.revealMs);
    const v = view(g, 'p0');
    expect(v.final!.winnerIds.sort()).toEqual(guessers.sort());
  });
});
