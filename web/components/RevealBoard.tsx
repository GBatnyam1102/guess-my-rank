'use client';

import type { ItemView, LeaderboardEntry, RevealGuessView } from '@gmr/shared';
import { motion } from 'motion/react';
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ItemImage } from './items';
import { CountUp, spring } from './motion';
import { Avatar, cx } from './ui';
import { useGame, useIsBot, useNickname } from '@/lib/game';

/** Whether a scrolling box can still scroll left / right, and how tall it is. */
function useScrollBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ start: true, end: true, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft <= 1;
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      const height = el.clientHeight;
      setBox((b) => (b.start === start && b.end === end && b.height === height ? b : { start, end, height }));
    };
    el.addEventListener('scroll', update, { passive: true });
    // Also fires once right away, which sets the initial state.
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      resize.disconnect();
    };
  }, []);
  return [ref, box] as const;
}

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/** Approximate height of the header row (avatar, name, points). */
const HEADER_PX = 80;
/** Vertical padding of a row around its picture. */
const ROW_PAD_PX = 12;

/**
 * Picture size: as big as the available height allows so every row fits without scrolling,
 * between 40 and 64 px. Before the box is measured, a guess from the number of pictures.
 */
function thumbPx(boxHeight: number, rows: number): number {
  const fit = boxHeight > 0 ? Math.floor((boxHeight - HEADER_PX) / rows) - ROW_PAD_PX : rows <= 5 ? 56 : 44;
  return Math.max(40, Math.min(64, fit));
}

/** How long the board takes to fill in, so the score table can follow it. */
export function boardRevealMs(columns: number, rows: number): number {
  return Math.min(1300, columns * 80 + rows * 45 + 350);
}

/**
 * The reveal as one table: the Ranker's order stays pinned on the left and every Guesser
 * gets a column beside it, so each position is compared across a single row. You come first,
 * then the others by score. The table fills the space it is given: rows stretch when there is
 * room, and it scrolls inside itself (never the page) when there are many players or pictures.
 */
export function RevealBoard({
  items,
  answer,
  guesses,
  onInfo,
  className,
}: {
  items: readonly ItemView[];
  answer: readonly string[];
  guesses: readonly RevealGuessView[];
  onInfo: (item: ItemView) => void;
  className?: string;
}) {
  const { view } = useGame();
  const nameOf = useNickname();
  const isBot = useIsBot();
  const [scroller, box] = useScrollBox();
  const round = view.round!;
  const byId = new Map(items.map((i) => [i.id, i]));
  const nick = (id: string) => view.players.find((p) => p.id === id)?.nickname ?? '';
  const iRanked = round.rankerId === view.meId;
  const columns = [...guesses].sort((a, b) =>
    a.playerId === view.meId ? -1 : b.playerId === view.meId ? 1 : b.score - a.score,
  );
  const isMe = (g: RevealGuessView) => g.playerId === view.meId;
  const thumb = thumbPx(box.height, answer.length);
  const answerCol = `${thumb + 108}px`;
  const guessCol = `${thumb + 22}px`;
  // The pinned column casts a shadow once something has scrolled under it.
  const pinned = cx('sticky left-0 bg-panel', !box.start && 'shadow-[10px_0_12px_-10px_rgb(0_0_0/0.45)]');

  return (
    <section className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Харьцуулалт</h2>
        {!box.end ? <span className="animate-pulse text-xs font-medium text-accent-fg">Хажуу тийш гүйлгэ →</span> : null}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-panel shadow-sm shadow-violet-950/5 ring-1 ring-line dark:shadow-none">
        <div
          ref={scroller}
          className="h-full snap-x snap-proximity overflow-auto overscroll-contain"
          style={{ scrollPaddingLeft: answerCol }}
        >
          {/*
            Columns keep their width and scroll sideways when there are many; with few they share
            the full width. Rows stretch to fill the height and never get smaller than a picture.
          */}
          <div
            className="grid min-h-full w-max min-w-full"
            style={{
              gridTemplateColumns: `${answerCol} repeat(${columns.length}, minmax(${guessCol}, 1fr))`,
              gridTemplateRows: `auto repeat(${answer.length}, minmax(${thumb + ROW_PAD_PX}px, 1fr))`,
            }}
          >
            {/* Header row (stays on top when the table scrolls down): whose order each column shows. */}
            <div className={cx(pinned, 'sticky top-0 z-20 flex items-center gap-2 border-b border-line px-2.5 py-1.5')}>
              <Avatar name={nick(round.rankerId)} size={30} bot={isBot(round.rankerId)} />
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-wide text-good uppercase">{iRanked ? 'Таны эрэмбэ' : 'Зөв эрэмбэ'}</p>
                <p className="truncate text-xs font-semibold">{iRanked ? 'Та' : nameOf(round.rankerId)}</p>
              </div>
            </div>
            {columns.map((g, c) => (
              <div
                key={g.playerId}
                className={cx(
                  'animate-rise sticky top-0 z-10 flex snap-start flex-col items-center justify-center border-b border-line px-1 py-1.5 text-center',
                  isMe(g) ? 'bg-mine' : 'bg-panel',
                )}
                style={delay(c * 80)}
              >
                <Avatar name={nick(g.playerId)} size={28} bot={isBot(g.playerId)} dim={g.status === 'SKIPPED'} />
                <p className="w-full max-w-16 truncate text-[11px] font-semibold">{isMe(g) ? 'Та' : nick(g.playerId)}</p>
                <p className={cx('text-xs font-black', g.score > 0 ? 'text-good' : 'text-muted')}>
                  {g.status === 'SUBMITTED' ? `+${g.score}` : 'Алгассан'}
                </p>
              </div>
            ))}

            {/* One row per position: the right answer, then what each Guesser put there. */}
            {answer.map((id, row) => {
              const item = byId.get(id);
              const line = row > 0 && 'border-t border-line/60';
              return (
                <Fragment key={id}>
                  <div className={cx(pinned, line, 'z-[5] flex items-center gap-1.5 px-2 py-1.5')}>
                    <span
                      className={cx(
                        'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black',
                        row === 0 ? 'bg-gradient-to-br from-amber-300 to-orange-500 text-neutral-950' : 'bg-panel-2 text-fg',
                      )}
                    >
                      {row + 1}
                    </span>
                    {item ? (
                      <>
                        <button type="button" onClick={() => onInfo(item)} className="shrink-0 transition active:scale-95">
                          <ItemImage item={item} size={thumb} className="ring-2 ring-good/60" />
                        </button>
                        <span className="line-clamp-2 min-w-0 text-xs leading-tight font-semibold">{item.title}</span>
                      </>
                    ) : null}
                  </div>
                  {columns.map((g, c) => {
                    const guessed = g.order?.[row];
                    const guessedItem = guessed ? byId.get(guessed) : undefined;
                    const ok = guessed === id;
                    const at = c * 80 + row * 45 + 120;
                    return (
                      <div
                        key={g.playerId}
                        className={cx('flex items-center justify-center px-1 py-1.5', line, isMe(g) && 'bg-mine')}
                      >
                        {guessedItem ? (
                          <button
                            type="button"
                            onClick={() => onInfo(guessedItem)}
                            className="animate-rise relative transition active:scale-95"
                            style={delay(at)}
                            aria-label={`${isMe(g) ? 'Та' : nick(g.playerId)}: ${row + 1}-р байранд ${guessedItem.title} — ${ok ? 'зөв' : 'буруу'}`}
                          >
                            <ItemImage
                              item={guessedItem}
                              size={thumb}
                              className={cx('ring-2', ok ? 'ring-good' : 'opacity-60 ring-bad/70 saturate-50')}
                            />
                            <span
                              className={cx(
                                'animate-pop absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[11px] font-black text-white',
                                ok ? 'bg-good' : 'bg-bad',
                              )}
                              style={delay(at + 260)}
                              aria-hidden
                            >
                              {ok ? '✓' : '✗'}
                            </span>
                          </button>
                        ) : (
                          <span
                            className="rounded-xl border-2 border-dashed border-line"
                            style={{ width: thumb, height: thumb }}
                            aria-label="Таамаг байхгүй"
                          />
                        )}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
        {/* Fades the last visible column while more columns are off to the right. */}
        {!box.end ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-panel to-transparent" />
        ) : null}
      </div>
    </section>
  );
}

/**
 * Totals as their own small table under the comparison. It slides in once the comparison has
 * filled in, keeps a fixed share of the screen and scrolls inside itself with many players.
 */
export function ScoreTable({
  entries,
  deltas,
  rankerId,
  appearAfterMs,
}: {
  entries: LeaderboardEntry[];
  deltas: Record<string, number>;
  rankerId: string;
  appearAfterMs: number;
}) {
  const { view } = useGame();
  return (
    <motion.section
      className="flex max-h-[24dvh] min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl bg-panel shadow-sm shadow-violet-950/5 ring-1 ring-line dark:shadow-none"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: appearAfterMs / 1000 }}
    >
      <div className="overflow-y-auto overscroll-contain">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-16" />
            <col className="w-14" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-panel text-[11px] tracking-wide text-muted uppercase">
            <tr>
              <th colSpan={2} className="py-2 pl-3 text-left font-bold text-fg">
                🏆 Нийт оноо
              </th>
              <th className="px-2 py-2 text-right font-semibold">Round</th>
              <th className="py-2 pr-3 text-right font-semibold">Нийт</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const delta = deltas[e.playerId];
              const me = e.playerId === view.meId;
              return (
                <motion.tr
                  key={e.playerId}
                  layout
                  className={cx('border-t border-line/60', me && 'bg-mine', e.left && 'opacity-50')}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: appearAfterMs / 1000 + 0.1 + i * 0.05 }}
                >
                  <td className="py-1.5 pl-2 text-center font-black text-muted">{e.left ? '–' : e.place}</td>
                  <td className="py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={e.nickname} size={26} dim={e.left} bot={e.isBot} />
                      <span className="truncate font-semibold">
                        {e.nickname}
                        {me ? <span className="font-normal text-muted"> (Та)</span> : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {e.playerId === rankerId ? (
                      <span className="text-xs text-muted">Ranker</span>
                    ) : delta !== undefined ? (
                      <span className={cx('font-bold', delta > 0 ? 'text-good' : 'text-muted')}>+{delta}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-base font-black tabular-nums">
                    <CountUp value={e.totalScore} from={e.totalScore - (delta ?? 0)} delay={appearAfterMs / 1000 + 0.3} />
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}
