'use client';

import type { LeaderboardEntry } from '@gmr/shared';
import { motion } from 'motion/react';
import { useState } from 'react';
import { secondsLeft, useServerNow } from '@/lib/hooks';
import { useGame, useIsBot, useMe, useNickname } from '@/lib/game';
import { api } from '@/lib/socket';
import { CountUp, spring } from './motion';
import { ThemePicker } from './theme';
import { Avatar, Button, ConfirmDialog, cx, Dialog, Label, Pill } from './ui';

export function Countdown({ deadlineAt, label, className }: { deadlineAt: number | null; label?: string; className?: string }) {
  const { offset } = useGame();
  const now = useServerNow(offset);
  const left = secondsLeft(deadlineAt, now);
  if (left === null) return null;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  const urgent = left <= 10;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums transition-colors duration-300',
        urgent ? 'bg-bad/20 text-bad-fg' : 'bg-panel-2 text-fg',
        className,
      )}
      aria-live="off"
    >
      {label ? <span className="font-medium text-muted">{label}</span> : <span aria-hidden>⏱</span>}
      {/* Re-keyed every second near the end, so each digit change thumps. */}
      <span key={urgent ? left : 'calm'} className={urgent && left > 0 ? 'animate-tick' : undefined}>
        {mm > 0 ? `${mm}:${ss}` : `${left}с`}
      </span>
    </span>
  );
}

/** Rows glide to their new place when the order changes; totals count up. */
export function Leaderboard({ entries, deltas, winners }: { entries: LeaderboardEntry[]; deltas?: Record<string, number>; winners?: string[] }) {
  const { view } = useGame();
  return (
    <ol className="flex flex-col gap-1.5">
      {entries.map((e, i) => {
        const delta = deltas?.[e.playerId];
        return (
          <motion.li
            key={e.playerId}
            layout
            transition={spring}
            className={cx(
              'animate-rise flex items-center gap-3 rounded-xl px-3 py-2',
              e.playerId === view.meId ? 'bg-accent/15 ring-1 ring-accent/50' : 'bg-panel-2/60',
              e.left && 'opacity-50',
            )}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="w-6 text-center text-sm font-black text-muted">{e.left ? '–' : e.place}</span>
            <Avatar name={e.nickname} size={30} dim={e.left} bot={e.isBot} />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {e.nickname}
              {winners?.includes(e.playerId) ? ' 👑' : ''}
              {e.left ? <span className="ml-1 text-xs font-normal text-muted">(гарсан)</span> : null}
            </span>
            {delta !== undefined ? (
              <motion.span
                className={cx('text-sm font-bold', delta > 0 ? 'text-good' : 'text-muted')}
                initial={{ opacity: 0, y: 8, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: 0.35 + i * 0.06 }}
              >
                +{delta}
              </motion.span>
            ) : null}
            <CountUp
              value={e.totalScore}
              from={delta !== undefined ? e.totalScore - delta : undefined}
              className="w-10 text-right text-lg font-black tabular-nums"
            />
          </motion.li>
        );
      })}
    </ol>
  );
}

/** Round number, Ranker, timer and the in-game menu. */
export function GameHeader({ deadlineAt }: { deadlineAt?: number | null }) {
  const { view, run } = useGame();
  const { isHost } = useMe();
  const nameOf = useNickname();
  const [menu, setMenu] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const round = view.round;
  const progress = round ? Math.min(1, round.number / Math.max(1, view.room.plannedRounds)) : 0;

  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Round {round?.number ?? '–'} / {view.room.plannedRounds}
          </p>
          {round ? (
            <p className="truncate text-sm">
              Ranker: <span className="font-bold">{round.rankerId === view.meId ? 'Та' : nameOf(round.rankerId)}</span>
            </p>
          ) : null}
        </div>
        {deadlineAt !== undefined ? <Countdown deadlineAt={deadlineAt} /> : null}
        <Button variant="secondary" size="sm" onClick={() => setMenu(true)} aria-label="Цэс">
          ☰
        </Button>
      </div>
      {/* How far through the game we are. */}
      <div className="h-1 overflow-hidden rounded-full bg-panel-2">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
          initial={false}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>

      <Dialog open={menu} onClose={() => setMenu(false)}>
        <h2 className="mb-3 text-lg font-bold">Оноо</h2>
        <Leaderboard entries={view.leaderboard} />
        <p className="mt-3 text-xs text-muted">Өрөөний код: {view.room.code}</p>
        <div className="mt-4">
          <Label>Харагдац</Label>
          <ThemePicker />
        </div>
        <div className="mt-4 grid gap-2">
          {isHost ? (
            <Button variant="danger" onClick={() => { setMenu(false); setConfirmEnd(true); }}>
              Тоглоомыг дуусгах
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => { setMenu(false); setConfirmLeave(true); }}>
            Өрөөнөөс гарах
          </Button>
          <Button variant="ghost" onClick={() => setMenu(false)}>
            Хаах
          </Button>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="Тоглоомыг дуусгах уу?"
        body="Бүх тоглогчид одоогийн оноогоор эцсийн дүнг харна."
        confirmLabel="Дуусгах"
        tone="danger"
        onConfirm={() => void run(() => api.end())}
      />
      <LeaveDialog open={confirmLeave} onClose={() => setConfirmLeave(false)} />
    </header>
  );
}

export function LeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { view, run } = useGame();
  const inGame = view.room.status === 'IN_GAME';
  const bots = view.room.settings.mode === 'BOTS';
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Өрөөнөөс гарах уу?"
      body={bots ? 'Bot-той өрөө хаагдана.' : inGame ? 'Гарсны дараа энэ тоглоомд буцаж орох боломжгүй.' : undefined}
      confirmLabel="Гарах"
      tone="danger"
      onConfirm={() =>
        void run(async () => {
          await api.leave();
          window.dispatchEvent(new CustomEvent('gmr:left'));
        })
      }
    />
  );
}

export function GuessStatusList() {
  const { view } = useGame();
  const nameOf = useNickname();
  const isBot = useIsBot();
  const round = view.round;
  if (!round) return null;
  const labels = {
    GUESSING: { text: 'Тааж байна', tone: 'muted' as const },
    DISCONNECTED: { text: 'Холболт тасарсан', tone: 'bad' as const },
    SUBMITTED: { text: 'Илгээсэн', tone: 'good' as const },
    SKIPPED: { text: 'Алгассан', tone: 'muted' as const },
  };
  return (
    <ul className="flex flex-col gap-1.5">
      {round.guessStatuses.map((g, i) => {
        const player = view.players.find((p) => p.id === g.playerId);
        const label = labels[g.status];
        return (
          <li key={g.playerId} className="animate-rise flex items-center gap-3 rounded-xl bg-panel-2/60 px-3 py-2" style={{ animationDelay: `${i * 50}ms` }}>
            <Avatar name={player?.nickname ?? ''} size={28} dim={g.status === 'SKIPPED'} bot={isBot(g.playerId)} />
            <span className="min-w-0 flex-1 truncate font-medium">
              {player?.nickname ?? nameOf(g.playerId)}
              {g.playerId === view.meId ? ' (Та)' : ''}
            </span>
            {g.status === 'DISCONNECTED' && player?.graceDeadlineAt ? (
              <Countdown deadlineAt={player.graceDeadlineAt} className="!text-xs" />
            ) : null}
            {/* Re-keyed so the pill pops when a player's status changes. */}
            <motion.span key={g.status} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
              <Pill tone={label.tone}>
                {g.status === 'SUBMITTED' ? '✓ ' : ''}
                {label.text}
              </Pill>
            </motion.span>
          </li>
        );
      })}
    </ul>
  );
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-panel-2">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 180, damping: 24 }}
      />
    </div>
  );
}
