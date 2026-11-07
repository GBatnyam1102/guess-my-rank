'use client';

import { MIN_PLAYERS, type PublicPlayer } from '@gmr/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { LeaveDialog } from '../common';
import { spring } from '../motion';
import { ThemeToggle } from '../theme';
import { Avatar, BotTag, Button, Card, Pill } from '../ui';
import { useGame, useMe } from '@/lib/game';
import { api } from '@/lib/socket';

export function roundsLabel(mode: number | 'EACH'): string {
  return mode === 'EACH' ? 'Хүн бүр нэг удаа' : `${mode} round`;
}

function PlayerRow({ p, onRemove }: { p: PublicPlayer; onRemove?: () => void }) {
  const { view } = useGame();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, x: 40, transition: { duration: 0.18 } }}
      transition={spring}
      className="flex items-center gap-3 rounded-xl bg-panel-2/60 px-3 py-2"
    >
      <Avatar name={p.nickname} size={32} dim={p.connection === 'OFFLINE'} bot={p.isBot} />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {p.nickname}
        {p.id === view.meId ? <span className="font-normal text-muted"> (Та)</span> : null}
      </span>
      {p.isBot ? <BotTag /> : null}
      {p.isHost ? <Pill tone="accent">👑 Host</Pill> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex size-7 items-center justify-center rounded-lg text-muted transition hover:bg-bad/15 hover:text-bad active:scale-90"
          aria-label={`${p.nickname}-г хасах`}
        >
          ✕
        </button>
      ) : (
        <span
          className={p.connection === 'ONLINE' ? 'size-2.5 rounded-full bg-good' : 'size-2.5 rounded-full bg-muted/40'}
          title={p.connection === 'ONLINE' ? 'Онлайн' : 'Офлайн'}
        />
      )}
    </motion.li>
  );
}

export function Lobby() {
  const { view, run, toast } = useGame();
  const { isHost } = useMe();
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [adding, setAdding] = useState(false);
  const { room } = view;
  const botRoom = room.settings.mode === 'BOTS';
  const players = view.players.filter((p) => !p.left);
  const full = players.length >= room.settings.maxPlayers;
  const inviteUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/join?code=${room.code}&invite=${encodeURIComponent(room.inviteToken)}`;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Guess My Rank', text: `Өрөөний код: ${room.code}`, url: inviteUrl });
        return;
      }
      await navigator.clipboard.writeText(inviteUrl);
      toast('Урилгын линк хуулагдлаа', 'good');
    } catch {
      // share sheet dismissed
    }
  };

  const start = async () => {
    setStarting(true);
    await run(() => api.start());
    setStarting(false);
  };

  const addBot = async () => {
    setAdding(true);
    await run(() => api.addBot());
    setAdding(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-black">{botRoom ? 'Bot-той өрөө' : 'Лобби'}</h1>
        <ThemeToggle />
      </div>

      {botRoom ? (
        <Card className="animate-rise flex items-center gap-3">
          <motion.span
            className="text-4xl"
            animate={{ rotate: [0, -10, 10, -6, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.5 }}
            aria-hidden
          >
            🤖
          </motion.span>
          <div>
            <p className="font-bold">Ганцаараа bot-уудтай</p>
            <p className="text-sm text-muted">Bot-ууд өөрсдөө эрэмбэлж, таана. Өөр хүн энэ өрөөнд нэгдэхгүй.</p>
          </div>
        </Card>
      ) : (
        <Card className="animate-rise text-center">
          <p className="text-sm font-medium text-muted">Өрөөний код</p>
          <p className="my-1 font-mono text-5xl font-black tracking-[0.2em]">
            {[...room.code].map((ch, i) => (
              <span key={i} className="animate-rise inline-block" style={{ animationDelay: `${120 + i * 45}ms` }}>
                {ch}
              </span>
            ))}
          </p>
          <Button variant="secondary" className="mt-2 w-full" onClick={() => void share()}>
            🔗 Урилгын линк хуваалцах
          </Button>
        </Card>
      )}

      <Card className="animate-rise">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Тоглогчид</h2>
          <Pill>
            {players.length} / {room.settings.maxPlayers}
          </Pill>
        </div>
        <ul className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {players.map((p) => (
              <PlayerRow
                key={p.id}
                p={p}
                onRemove={botRoom && isHost && p.isBot ? () => void run(() => api.removeBot(p.id)) : undefined}
              />
            ))}
          </AnimatePresence>
        </ul>
        {botRoom && isHost ? (
          <Button variant="secondary" className="mt-3 w-full" busy={adding} disabled={full} onClick={() => void addBot()}>
            {full ? 'Өрөө дүүрсэн' : '＋ Bot нэмэх'}
          </Button>
        ) : null}
      </Card>

      <Card className="animate-rise">
        <h2 className="mb-2 font-bold">Тохиргоо</h2>
        <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
          <dt className="text-muted">Төрөл</dt>
          <dd className="text-right font-semibold">{botRoom ? '🤖 Bot-той' : '👥 Найзуудтай'}</dd>
          <dt className="text-muted">Зураг</dt>
          <dd className="text-right font-semibold">{room.settings.imageCount} ширхэг</dd>
          <dt className="text-muted">Эх сурвалж</dt>
          <dd className="text-right font-semibold">{room.settings.imageSource === 'RANDOM' ? 'Random' : 'Өөрийн зураг'}</dd>
          <dt className="text-muted">Round</dt>
          <dd className="text-right font-semibold">{roundsLabel(room.settings.roundsMode)}</dd>
        </dl>
      </Card>

      <div className="mt-auto grid gap-2">
        {isHost ? (
          <Button size="lg" onClick={() => void start()} busy={starting} disabled={players.length < MIN_PLAYERS}>
            {players.length < MIN_PLAYERS ? (botRoom ? 'Дор хаяж 1 bot нэмнэ үү' : 'Дор хаяж 2 тоглогч хэрэгтэй') : 'Тоглоом эхлүүлэх'}
          </Button>
        ) : (
          <p className="loading-dots py-3 text-center text-muted">Host эхлүүлэхийг хүлээж байна</p>
        )}
        <Button variant="ghost" onClick={() => setLeaving(true)}>
          Гарах
        </Button>
      </div>
      <LeaveDialog open={leaving} onClose={() => setLeaving(false)} />
    </>
  );
}
