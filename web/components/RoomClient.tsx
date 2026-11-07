'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { GameHeader } from './common';
import { Final, Reveal, SkippedRound } from './screens/Results';
import { Guessing, WaitingForGuesses } from './screens/GuessPhase';
import { Lobby } from './screens/Lobby';
import { CategoryPicker, CustomRanking, RandomRanking, WaitingForRanker } from './screens/RankerPhase';
import { Button, Card, cx, Screen, Spinner } from './ui';
import { GameProvider, useGame, useGameConnection, type GameApi } from '@/lib/game';
import { clearSession } from '@/lib/session';

function Toasts({ game }: { game: GameApi }) {
  return (
    // Above the sticky action buttons, so toasts never cover the header or the timer.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {game.toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            type="button"
            onClick={() => game.dismiss(t.id)}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className={cx(
              'pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm font-semibold shadow-xl ring-1',
              t.tone === 'error' && 'bg-rose-50 text-rose-900 ring-bad/40 dark:bg-rose-950 dark:text-rose-100',
              t.tone === 'good' && 'bg-emerald-50 text-emerald-900 ring-good/40 dark:bg-emerald-950 dark:text-emerald-100',
              t.tone === 'info' && 'bg-panel text-fg ring-line',
            )}
          >
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

function GameScreen() {
  const game = useGame();
  const { view } = game;
  const round = view.round;

  let key: string;
  let body: ReactNode;
  if (view.room.status === 'LOBBY') {
    key = 'lobby';
    body = <Lobby />;
  } else if (view.room.status === 'FINISHED') {
    key = 'final';
    body = <Final />;
  } else if (!round) {
    return null;
  } else {
    const ranker = round.myRole === 'RANKER';
    const custom = view.room.settings.imageSource === 'CUSTOM';
    key = `${round.id}:${round.state}`;
    switch (round.state) {
      case 'CATEGORY':
        body = ranker ? <CategoryPicker /> : <WaitingForRanker />;
        break;
      case 'RANKING':
        body = ranker ? custom ? <CustomRanking /> : <RandomRanking /> : <WaitingForRanker />;
        break;
      case 'GUESSING':
        if (round.myGuess?.status === 'GUESSING' && round.items) {
          body = <Guessing />;
        } else {
          key += ':waiting';
          body = <WaitingForGuesses />;
        }
        break;
      case 'REVEAL':
        body = <Reveal />;
        break;
      case 'SKIPPED':
        body = <SkippedRound />;
        break;
    }
  }

  return (
    <>
      {view.room.status === 'IN_GAME' ? <GameHeader /> : null}
      {/*
        Keyed by phase so draft orders and dialogs reset between phases. The leaving screen
        keeps its own copy of the game state, so it can fade out after the room has moved on.
      */}
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          className="flex min-h-0 flex-1 flex-col gap-4"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <GameProvider value={game}>{body}</GameProvider>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default function RoomClient({ code }: { code: string }) {
  const game = useGameConnection(code);
  const router = useRouter();

  useEffect(() => {
    const onLeft = () => {
      clearSession(code);
      router.push('/');
    };
    window.addEventListener('gmr:left', onLeft);
    return () => window.removeEventListener('gmr:left', onLeft);
  }, [code, router]);

  if (game.fatal) {
    return (
      <Screen className="justify-center">
        <Card className="animate-rise text-center">
          <p className="text-4xl">🚪</p>
          <h1 className="mt-2 text-xl font-bold">Өрөөнд орж чадсангүй</h1>
          <p className="mt-1 text-sm text-muted">{game.fatal.message}</p>
          <div className="mt-4 grid gap-2">
            <Button onClick={() => router.push(`/join?code=${code}`)}>Өрөөнд нэгдэх</Button>
            <Button variant="ghost" onClick={() => router.push('/')}>
              Нүүр хуудас
            </Button>
          </div>
        </Card>
      </Screen>
    );
  }

  return (
    <GameProvider value={game}>
      <AnimatePresence>
        {!game.online ? (
          <motion.div
            key="offline"
            className="fixed inset-x-0 bottom-0 z-30 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-neutral-950"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
          >
            Холболт тасарлаа. Дахин холбогдож байна…
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Toasts game={game} />
      {/* The reveal is laid out to fit one screen; its tables scroll inside themselves. */}
      <Screen className={game.view?.room.status === 'IN_GAME' && game.view.round?.state === 'REVEAL' ? 'h-dvh' : undefined}>
        {game.view ? (
          <GameScreen />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
            <Spinner className="size-8" />
            <p>Өрөөнд холбогдож байна…</p>
          </div>
        )}
      </Screen>
    </GameProvider>
  );
}
