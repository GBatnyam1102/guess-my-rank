'use client';

import {
  DEFAULT_BOT_COUNT,
  DEFAULT_SETTINGS,
  IMAGE_COUNT_OPTIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NICKNAME_MAX,
  type ImageSource,
  type RoomMode,
  type RoundsMode,
} from '@gmr/shared';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { spring } from '@/components/motion';
import { ThemeToggle } from '@/components/theme';
import { Avatar, Button, Card, cx, Label, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/socket';
import { lastNickname, rememberNickname, saveSession } from '@/lib/session';

const roundOptions: { value: string; label: string }[] = [
  { value: 'EACH', label: 'Хүн бүр' },
  { value: '1', label: '1' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
];

const modes: { value: RoomMode; icon: string; title: string; text: string }[] = [
  { value: 'HUMANS', icon: '👥', title: 'Найзуудтайгаа', text: 'Код хуваалцаад хүн бүр утаснаасаа нэгдэнэ' },
  { value: 'BOTS', icon: '🤖', title: 'Bot-той', text: 'Ганцаараа bot-уудтай тоглож дасгал хийнэ' },
];

/** "Who do you play with?" — the highlight glides between the two cards. */
function ModePicker({ value, onChange }: { value: RoomMode; onChange: (m: RoomMode) => void }) {
  const id = useId();
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Хэнтэй тоглох вэ?">
      {modes.map((m) => {
        const selected = m.value === value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m.value)}
            className={cx(
              'relative flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-1 transition active:scale-[0.98]',
              selected ? 'ring-accent' : 'bg-ink/40 ring-line hover:ring-accent/50',
            )}
          >
            {selected ? (
              <motion.span layoutId={`mode-${id}`} className="absolute inset-0 rounded-2xl bg-accent/12 ring-2 ring-accent" transition={spring} />
            ) : null}
            <motion.span
              className="relative text-3xl"
              animate={selected ? { scale: [1, 1.25, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }}
              transition={{ duration: 0.4 }}
            >
              {m.icon}
            </motion.span>
            <span className="relative font-bold">{m.title}</span>
            <span className="relative text-xs leading-snug text-muted">{m.text}</span>
          </button>
        );
      })}
    </div>
  );
}

/** New Game settings (FR-01–07), plus the room type: friends or bots. */
export default function NewGame() {
  const router = useRouter();
  const [nickname, setNickname] = useState(lastNickname);
  const [mode, setMode] = useState<RoomMode>(DEFAULT_SETTINGS.mode);
  const [botCount, setBotCount] = useState(DEFAULT_BOT_COUNT);
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_SETTINGS.maxPlayers);
  const [imageCount, setImageCount] = useState(DEFAULT_SETTINGS.imageCount);
  const [imageSource, setImageSource] = useState<ImageSource>(DEFAULT_SETTINGS.imageSource);
  const [rounds, setRounds] = useState<string>(String(DEFAULT_SETTINGS.roundsMode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bots = mode === 'BOTS';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const roundsMode: RoundsMode = rounds === 'EACH' ? 'EACH' : (Number(rounds) as RoundsMode);
      const joined = await api.create({
        nickname,
        // A bot room keeps every seat free so bots can be added in the lobby.
        settings: { mode, maxPlayers: bots ? MAX_PLAYERS : maxPlayers, imageCount, imageSource, roundsMode },
        botCount: bots ? botCount : undefined,
      });
      rememberNickname(nickname.trim());
      saveSession({ code: joined.code, playerId: joined.playerId, token: joined.sessionToken });
      router.push(`/room/${joined.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <div className="flex items-center gap-2">
        <Link href="/" className="rounded-lg px-2 py-1 text-muted hover:text-fg" aria-label="Буцах">
          ←
        </Link>
        <h1 className="flex-1 text-2xl font-black">Шинэ тоглоом</h1>
        <ThemeToggle />
      </div>
      <form onSubmit={(e) => void submit(e)} className="flex flex-1 flex-col gap-4">
        <Card className="animate-rise flex flex-col gap-4">
          <label>
            <Label>Таны нэр</Label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={NICKNAME_MAX}
              placeholder="Жишээ нь: Бат"
              autoComplete="nickname"
              className="h-12 w-full rounded-xl bg-ink/60 px-3 text-base font-semibold ring-1 ring-line outline-none focus:ring-accent"
              required
            />
          </label>
          <div>
            <Label>Хэнтэй тоглох вэ?</Label>
            <ModePicker value={mode} onChange={setMode} />
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            {bots ? (
              <motion.div key="bots" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Label>Bot-ын тоо: {botCount}</Label>
                <input
                  type="range"
                  min={1}
                  max={MAX_PLAYERS - 1}
                  value={botCount}
                  onChange={(e) => setBotCount(Number(e.target.value))}
                  className="w-full accent-violet-500"
                  aria-label="Bot-ын тоо"
                />
                <div className="mt-2 flex h-9 flex-wrap items-center gap-1.5" aria-hidden>
                  <AnimatePresence initial={false}>
                    {Array.from({ length: botCount }, (_, i) => (
                      <motion.span
                        key={i}
                        initial={{ scale: 0, rotate: -30 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      >
                        <Avatar name={`bot-${i}`} size={30} bot />
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              <motion.div key="humans" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Label>Тоглогчийн дээд тоо: {maxPlayers}</Label>
                <input
                  type="range"
                  min={MIN_PLAYERS}
                  max={MAX_PLAYERS}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full accent-violet-500"
                  aria-label="Тоглогчийн дээд тоо"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
        <Card className="animate-rise flex flex-col gap-4">
          <div>
            <Label>Зургийн тоо</Label>
            <Segmented
              options={IMAGE_COUNT_OPTIONS.map((n) => ({ value: n as number, label: String(n) }))}
              value={imageCount}
              onChange={setImageCount}
            />
          </div>
          <div>
            <Label>Зургийн эх сурвалж</Label>
            <Segmented
              options={[
                { value: 'RANDOM' as ImageSource, label: '🎲 Random' },
                { value: 'CUSTOM' as ImageSource, label: '📷 Өөрийн' },
              ]}
              value={imageSource}
              onChange={setImageSource}
            />
            <p className="mt-1.5 text-xs text-muted">
              {imageSource === 'RANDOM'
                ? 'Ranker category сонгоход зураг автоматаар гарна.'
                : bots
                  ? 'Та Ranker болохдоо өөрийн зургийг оруулна. Bot Ranker болохдоо сангаас зураг сонгоно.'
                  : 'Ranker өөрийн утаснаас зураг оруулна. Тоглоом дууссанаас хойш 24 цагт устгагдана.'}
            </p>
          </div>
          <div>
            <Label>Round-ийн тоо</Label>
            <Segmented options={roundOptions} value={rounds} onChange={setRounds} />
            {rounds === 'EACH' ? <p className="mt-1.5 text-xs text-muted">Тоглогч бүр нэг удаа Ranker болно.</p> : null}
          </div>
        </Card>
        {error ? <p className="animate-pop rounded-xl bg-bad/15 px-3 py-2 text-sm font-medium text-bad-fg">{error}</p> : null}
        <Button type="submit" size="lg" className="mt-auto" busy={busy} disabled={!nickname.trim()}>
          {bots ? '🤖 Bot-той өрөө үүсгэх' : 'Өрөө үүсгэх'}
        </Button>
      </form>
    </Screen>
  );
}
