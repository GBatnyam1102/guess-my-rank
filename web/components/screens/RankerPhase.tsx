'use client';

import type { ItemView } from '@gmr/shared';
import { useRef, useState } from 'react';
import { Countdown } from '../common';
import { RankList } from '../items';
import { Avatar, Button, ConfirmDialog, cx, Spinner } from '../ui';
import { assetUrl } from '@/lib/config';
import { useDraftOrder } from '@/lib/hooks';
import { useGame, useIsBot, useNickname } from '@/lib/game';
import { prepareImage } from '@/lib/image';
import { api, errorMessage } from '@/lib/socket';

/** What everyone except the Ranker sees while the Ranker works (FR-52). */
export function WaitingForRanker() {
  const { view } = useGame();
  const nameOf = useNickname();
  const isBot = useIsBot();
  const round = view.round!;
  const ranker = view.players.find((p) => p.id === round.rankerId);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div className="animate-float relative">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
        <Avatar name={ranker?.nickname ?? ''} size={88} bot={isBot(round.rankerId)} />
      </div>
      <div>
        <p className="text-2xl font-black">{nameOf(round.rankerId)}</p>
        <p className="loading-dots mt-1 text-muted">
          {round.state === 'CATEGORY' ? 'Category сонгож байна' : 'Эрэмбэлж байна'}
        </p>
      </div>
      {round.categoryName ? <p className="animate-pop rounded-full bg-panel-2 px-3 py-1 text-sm">{round.categoryName}</p> : null}
      <Countdown deadlineAt={round.deadlineAt} label="Үлдсэн" />
      <p className="max-w-xs text-sm text-muted">Удахгүй та {nameOf(round.rankerId)}-ийн эрэмбийг таана. Бэлэн байгаарай!</p>
    </div>
  );
}

export function CategoryPicker() {
  const { view, run } = useGame();
  const [busy, setBusy] = useState<string | null>(null);
  const categories = view.categories ?? [];
  const pick = async (id: string) => {
    setBusy(id);
    await run(() => api.category(id));
    setBusy(null);
  };
  return (
    <>
      <div>
        <h1 className="text-2xl font-black">Та Ranker боллоо!</h1>
        <p className="mt-1 text-muted">Category сонго. {view.room.settings.imageCount} зураг гарч ирнэ.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {categories.map((c, i) => (
          <button
            key={c.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void pick(c.id)}
            style={{ animationDelay: `${i * 60}ms` }}
            className="animate-rise flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl bg-panel p-3 ring-1 ring-line transition hover:-translate-y-0.5 hover:bg-panel-2 hover:shadow-lg hover:shadow-accent/15 hover:ring-accent active:scale-[0.97] disabled:opacity-60"
          >
            <span className="text-5xl">{busy === c.id ? <Spinner className="size-8" /> : c.emoji}</span>
            <span className="font-bold">{c.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function LockBar({ disabled, onLock, hint }: { disabled: boolean; onLock: () => Promise<void>; hint?: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pt-6 pb-2">
      {hint ? <p className="mb-2 text-center text-xs text-muted">{hint}</p> : null}
      <Button size="lg" className="w-full" disabled={disabled} busy={busy} onClick={() => setConfirm(true)}>
        🔒 Эрэмбээ түгжих
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Эрэмбээ түгжих үү?"
        body="Түгжсэний дараа дараалал болон зургийг өөрчлөх боломжгүй."
        confirmLabel="Түгжих"
        onConfirm={async () => {
          setBusy(true);
          await onLock();
          setBusy(false);
        }}
      />
    </div>
  );
}

export function RandomRanking() {
  const { view, run } = useGame();
  const round = view.round!;
  const items = round.items ?? [];
  const [order, setOrder] = useDraftOrder(`gmr.rank.${round.id}`, items.map((i) => i.id));
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await run(() => api.refresh());
    setRefreshing(false);
  };

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Эрэмбэлээрэй</h1>
          <p className="text-sm text-muted">1 = хамгийн дуртай. Чирж эсвэл ▲▼ дарж байрлуул.</p>
        </div>
        <Countdown deadlineAt={round.deadlineAt} />
      </div>
      <div className="flex items-center justify-between rounded-xl bg-panel-2/60 px-3 py-2 text-sm">
        <span>
          Category: <span className="font-bold">{round.categoryName}</span>
        </span>
        <Button variant="secondary" size="sm" disabled={round.refreshLeft === 0} busy={refreshing} onClick={() => void refresh()}>
          🔄 Refresh ({round.refreshLeft})
        </Button>
      </div>
      <RankList items={items} order={order} onChange={setOrder} />
      <LockBar disabled={items.length === 0} onLock={async () => void (await run(() => api.lock(order)))} />
    </>
  );
}

interface Pending {
  key: number;
  name: string;
  preview: string;
}

export function CustomRanking() {
  const { view, run, toast } = useGame();
  const round = view.round!;
  const items = round.items ?? [];
  const needed = round.imageCount;
  const [order, setOrder] = useDraftOrder(`gmr.rank.${round.id}`, items.map((i) => i.id));
  const [pending, setPending] = useState<Pending[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const nextKey = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const room = needed - items.length - pending.length;

  const titleOf = (item: ItemView) => titles[item.id] ?? item.title;
  const allTitled = items.every((i) => titleOf(i).trim().length > 0);

  const uploadOne = async (file: File) => {
    const key = nextKey.current++;
    const preview = URL.createObjectURL(file);
    setPending((p) => [...p, { key, name: file.name, preview }]);
    try {
      const blob = await prepareImage(file);
      const presigned = await api.presign(blob.type, blob.size);
      const res = await fetch(assetUrl(presigned.url), { method: presigned.method, headers: presigned.headers, body: blob });
      if (!res.ok) throw new Error(res.status === 413 ? 'Зураг 10 MB-аас хэтрэхгүй байх ёстой.' : 'Зураг илгээж чадсангүй.');
      await api.uploadDone(presigned.uploadId, '');
    } catch (err) {
      toast(`${file.name}: ${errorMessage(err)}`, 'error');
    } finally {
      URL.revokeObjectURL(preview);
      setPending((p) => p.filter((x) => x.key !== key));
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > list.length) toast(`Дахиад ${Math.max(0, room)} зураг л нэмэх боломжтой`, 'error');
    for (const f of list) await uploadOne(f);
    if (inputRef.current) inputRef.current.value = '';
  };

  const saveTitle = async (item: ItemView) => {
    const title = titles[item.id];
    if (title === undefined || title === item.title) return;
    const ok = await run(() => api.rename(item.id, title));
    if (ok) setTitles(({ [item.id]: _saved, ...rest }) => rest);
  };

  const lock = async () => {
    for (const item of items) {
      const title = titles[item.id];
      if (title !== undefined && title !== item.title && !(await run(() => api.rename(item.id, title)))) return;
    }
    await run(() => api.lock(order));
  };

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Өөрийн зургаа оруул</h1>
          <p className="text-sm text-muted">
            {items.length} / {needed} зураг · нэр өгөөд эрэмбэл (1 = хамгийн дуртай)
          </p>
        </div>
        <Countdown deadlineAt={round.deadlineAt} />
      </div>

      {room > 0 ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line bg-panel/60 p-5 text-center transition hover:border-accent">
          <span className="text-3xl">📷</span>
          <span className="font-bold">Зураг нэмэх ({room} үлдсэн)</span>
          <span className="text-xs text-muted">JPG, PNG, WebP, HEIC · 10 MB хүртэл</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      ) : null}

      {pending.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {pending.map((p) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-xl bg-panel-2">
              {/* local preview of the file being uploaded */}
              <img src={p.preview} alt={p.name} className="size-full object-cover opacity-50" />
              <Spinner className="absolute inset-0 m-auto size-6" />
            </div>
          ))}
        </div>
      ) : null}

      {items.length > 0 ? (
        <RankList
          items={items}
          order={order}
          onChange={setOrder}
          renderMeta={(item) => (
            <div className="flex items-center gap-1">
              <input
                value={titleOf(item)}
                maxLength={40}
                placeholder="Нэр өгөх…"
                onChange={(e) => setTitles((t) => ({ ...t, [item.id]: e.target.value }))}
                onBlur={() => void saveTitle(item)}
                className={cx(
                  'h-9 w-full min-w-0 rounded-lg bg-ink/60 px-2 text-sm font-semibold ring-1 outline-none focus:ring-accent',
                  titleOf(item).trim() ? 'ring-line' : 'ring-bad/60',
                )}
              />
              <button
                type="button"
                onClick={() => void run(() => api.remove(item.id))}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bad/20 hover:text-bad"
                aria-label="Зургийг устгах"
              >
                ✕
              </button>
            </div>
          )}
        />
      ) : null}

      <LockBar
        disabled={items.length !== needed || !allTitled || pending.length > 0}
        hint={items.length !== needed ? `${needed} зураг хэрэгтэй` : !allTitled ? 'Зураг бүрт нэр өгнө үү' : undefined}
        onLock={lock}
      />
    </>
  );
}
