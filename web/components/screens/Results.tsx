'use client';

import type { ItemView, SkipReason } from '@gmr/shared';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Countdown, Leaderboard, LeaveDialog } from '../common';
import { ItemInfoDialog } from '../items';
import { Confetti, CountUp, spring } from '../motion';
import { boardRevealMs, RevealBoard, ScoreTable } from '../RevealBoard';
import { Button, Card, cx } from '../ui';
import { useGame, useMe } from '@/lib/game';
import { api } from '@/lib/socket';

/**
 * Fits one screen (FR-36–42, 56–60): a one-line score strip, the side-by-side comparison of
 * every Guesser with the Ranker, then the totals as their own small table.
 */
export function Reveal() {
  const { view } = useGame();
  const [info, setInfo] = useState<ItemView | null>(null);
  const round = view.round!;
  const reveal = round.reveal!;
  const items = round.items ?? [];
  const last = round.number >= view.room.plannedRounds;
  const mine = reveal.guesses.find((g) => g.playerId === view.meId);
  const iRanked = round.rankerId === view.meId;
  const deltas: Record<string, number> = Object.fromEntries([
    [round.rankerId, 0],
    ...reveal.guesses.map((g) => [g.playerId, g.score]),
  ]);
  const perfect = mine?.status === 'SUBMITTED' && mine.score === round.imageCount;

  let title: string;
  let subtitle: string;
  if (mine) {
    title =
      mine.status === 'SKIPPED'
        ? 'Таны ээлж алгасагдсан'
        : perfect
          ? '🎯 Төгс! Бүгдийг зөв таалаа'
          : mine.score > 0
            ? 'Та оноо авлаа'
            : 'Энэ удаад таарсангүй';
    subtitle = `${round.imageCount}-аас ${mine.score} нь зөв${last ? ' · сүүлийн round' : ''}`;
  } else if (iRanked) {
    title = 'Та Ranker байсан';
    subtitle = 'Бусад таны эрэмбийг хэр таасныг хараарай';
  } else {
    title = `Round ${round.number} — үр дүн`;
    subtitle = 'Зөв эрэмбэ болон таамгууд';
  }

  return (
    <>
      <motion.div
        className={cx(
          'flex shrink-0 items-center gap-3 rounded-2xl bg-panel/90 px-3 py-2.5 ring-1 ring-line',
          mine && mine.score > 0 && 'ring-good/50',
        )}
        initial={{ opacity: 0, scale: 0.9, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      >
        {mine ? (
          <p className="w-14 shrink-0 text-center text-3xl font-black text-good">
            +<CountUp value={mine.score} from={0} duration={0.8} />
          </p>
        ) : (
          <span className="w-14 shrink-0 text-center text-3xl" aria-hidden>
            {iRanked ? '🎲' : '👀'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{title}</p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        {/* Without a label, so the strip keeps room for the text; "last round" is in the subtitle. */}
        <Countdown deadlineAt={round.deadlineAt} />
      </motion.div>
      {perfect ? <Confetti count={36} seed={round.number} /> : null}

      <RevealBoard
        className="min-h-0 flex-1"
        items={items}
        answer={reveal.answerOrder}
        guesses={reveal.guesses}
        onInfo={setInfo}
      />
      <ScoreTable
        entries={view.leaderboard}
        deltas={deltas}
        rankerId={round.rankerId}
        appearAfterMs={boardRevealMs(reveal.guesses.length, reveal.answerOrder.length)}
      />
      <ItemInfoDialog item={info} onClose={() => setInfo(null)} />
    </>
  );
}

const skipText: Record<SkipReason, string> = {
  RANKER_TIMEOUT: 'Ranker хугацаандаа эрэмбээ түгжсэнгүй.',
  RANKER_OFFLINE: 'Ranker-ийн холболт 60 секундээс удаан тасарсан.',
  RANKER_LEFT: 'Ranker тоглоомоос гарсан.',
};

export function SkippedRound() {
  const { view } = useGame();
  const round = view.round!;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <motion.p className="text-5xl" initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={spring}>
        ⏭️
      </motion.p>
      <h1 className="text-2xl font-black">Round {round.number} алгасагдлаа</h1>
      <p className="text-muted">{round.skipReason ? skipText[round.skipReason] : null}</p>
      <Countdown deadlineAt={round.deadlineAt} label="Үргэлжлэх" />
    </div>
  );
}

const endText = {
  COMPLETED: null,
  HOST_ENDED: 'Host тоглоомыг дуусгасан.',
  NOT_ENOUGH_PLAYERS: 'Тоглогч 2-оос цөөн болсон тул тоглоом дууслаа.',
} as const;

/** Final leaderboard with joint winners and play again (FR-42–44). */
export function Final() {
  const { view, run } = useGame();
  const { isHost } = useMe();
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const winners = view.final?.winnerIds ?? [];
  const iWon = winners.includes(view.meId);
  const reason = view.room.endReason ? endText[view.room.endReason] : null;

  return (
    <>
      {winners.length > 0 ? <Confetti count={iWon ? 64 : 40} /> : null}
      <div className="pt-4 text-center">
        <motion.p
          className="text-6xl"
          initial={{ scale: 0, rotate: -40, y: 30 }}
          animate={{ scale: 1, rotate: 0, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.1 }}
        >
          {iWon ? '🏆' : '🎉'}
        </motion.p>
        <h1 className="animate-rise mt-2 text-3xl font-black" style={{ animationDelay: '250ms' }}>
          {winners.length > 1 ? 'Тэнцсэн ялагчид' : 'Ялагч'}
        </h1>
        <div className="animate-rise" style={{ animationDelay: '380ms' }}>
          <p className="mt-1 text-2xl font-black">
            {winners.length === 0 ? '—' : null}
            {winners.map((id, i) => {
              const p = view.players.find((x) => x.id === id);
              return (
                <span key={id}>
                  {i > 0 ? ', ' : null}
                  {/* The robot stays outside the gradient: emoji clipped to text turn into a blob. */}
                  <span className="animate-shimmer bg-gradient-to-r from-amber-500 via-pink-500 to-amber-500 bg-clip-text text-transparent dark:from-amber-200 dark:via-pink-300 dark:to-amber-200">
                    {p?.nickname ?? 'Тоглогч'}
                  </span>
                  {p?.isBot ? ' 🤖' : null}
                </span>
              );
            })}
          </p>
        </div>
        {reason ? <p className="mt-2 text-sm text-muted">{reason}</p> : null}
      </div>
      <Card className="animate-rise">
        <h2 className="mb-2 font-bold">Эцсийн дүн</h2>
        <Leaderboard entries={view.leaderboard} winners={winners} />
      </Card>
      <div className="mt-auto grid gap-2">
        {isHost ? (
          <Button
            size="lg"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              await run(() => api.again());
              setBusy(false);
            }}
          >
            Дахин тоглох
          </Button>
        ) : (
          <p className="py-2 text-center text-sm text-muted">Host дахин тоглуулж болно.</p>
        )}
        <Button variant="secondary" onClick={() => setLeaving(true)}>
          Нүүр хуудас руу
        </Button>
      </div>
      <LeaveDialog open={leaving} onClose={() => setLeaving(false)} />
    </>
  );
}
