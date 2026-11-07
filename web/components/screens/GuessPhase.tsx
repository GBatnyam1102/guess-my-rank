'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { Countdown, GuessStatusList, ProgressBar } from '../common';
import { RankList } from '../items';
import { Button, Card, ConfirmDialog } from '../ui';
import { useDraftOrder } from '@/lib/hooks';
import { useGame, useNickname } from '@/lib/game';
import { api } from '@/lib/socket';

export function Guessing() {
  const { view, run } = useGame();
  const nameOf = useNickname();
  const round = view.round!;
  const items = round.items ?? [];
  const [order, setOrder] = useDraftOrder(`gmr.guess.${round.id}`, items.map((i) => i.id));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await run(() => api.submit(order));
    setBusy(false);
  };

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">{nameOf(round.rankerId)} хэрхэн эрэмбэлсэн бэ?</h1>
          <p className="text-sm text-muted">Таны бодлоор 1 = {nameOf(round.rankerId)}-ийн хамгийн дуртай.</p>
        </div>
        <Countdown deadlineAt={round.deadlineAt} />
      </div>
      {round.categoryName ? <p className="text-sm text-muted">Category: {round.categoryName}</p> : null}
      <RankList items={items} order={order} onChange={setOrder} />
      <div className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pt-6 pb-2">
        <Button size="lg" className="w-full" busy={busy} onClick={() => setConfirm(true)}>
          Таамаг илгээх
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Таамгаа илгээх үү?"
        body="Нэг л удаа илгээнэ. Дараа нь өөрчлөх боломжгүй."
        confirmLabel="Илгээх"
        onConfirm={() => void submit()}
      />
    </>
  );
}

/** After submitting (or for the Ranker / a skipped Guesser): live progress (FR-30, FR-31). */
export function WaitingForGuesses() {
  const { view } = useGame();
  const round = view.round!;
  const progress = round.progress ?? { submitted: 0, skipped: 0, total: 0 };
  const done = progress.submitted + progress.skipped;
  const role = round.myRole;
  const skipped = round.myGuess?.status === 'SKIPPED';

  return (
    <>
      <Card className="text-center">
        <motion.p
          className="text-3xl"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.1 }}
        >
          {role === 'RANKER' ? '🔒' : skipped ? '⏭️' : '✅'}
        </motion.p>
        <p className="mt-2 text-lg font-bold">
          {role === 'RANKER' ? 'Таны эрэмбэ түгжигдлээ' : skipped ? 'Хугацаа дууссан тул таны ээлж алгасагдлаа' : 'Таамаг илгээгдлээ'}
        </p>
        <p className="mt-1 text-sm text-muted">Бусад тоглогчийг хүлээж байна. Үр дүн бүгд дуусахад нээгдэнэ.</p>
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar value={done} total={progress.total} />
          <span className="shrink-0 text-sm font-bold tabular-nums">
            {progress.submitted} / {progress.total}
          </span>
        </div>
        <div className="mt-3 flex justify-center">
          <Countdown deadlineAt={round.deadlineAt} label="Хугацаа" />
        </div>
      </Card>
      <GuessStatusList />
      {role === 'RANKER' && round.items ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted">Таны эрэмбэ</h2>
          <RankList items={round.items} order={round.items.map((i) => i.id)} />
        </div>
      ) : null}
    </>
  );
}
