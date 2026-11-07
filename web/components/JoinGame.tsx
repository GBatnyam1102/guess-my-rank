'use client';

import { NICKNAME_MAX, ROOM_CODE_LENGTH } from '@gmr/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { ThemeToggle } from '@/components/theme';
import { Button, Card, Label, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/socket';
import { getSession, lastNickname, rememberNickname, saveSession } from '@/lib/session';

/** Join by room code or invite link (FR-08–10). */
function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get('invite') ?? undefined;
  const [code, setCode] = useState(() => (params.get('code') ?? '').toUpperCase());
  const [nickname, setNickname] = useState(lastNickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    // Already in this room on this device: go straight back in (FR-46).
    if (normalized && getSession(normalized)) {
      router.push(`/room/${normalized}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const joined = await api.join({ code: normalized || undefined, inviteToken: invite, nickname });
      rememberNickname(nickname.trim());
      saveSession({ code: joined.code, playerId: joined.playerId, token: joined.sessionToken });
      router.push(`/room/${joined.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-1 flex-col gap-4">
      <Card className="animate-rise flex flex-col gap-4">
        <label>
          <Label>Өрөөний код</Label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            className="h-14 w-full rounded-xl bg-ink/60 px-3 text-center font-mono text-3xl font-black tracking-[0.3em] ring-1 ring-line outline-none focus:ring-accent"
            required={!invite}
          />
        </label>
        <label>
          <Label>Таны нэр</Label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX}
            placeholder="Жишээ нь: Сараа"
            autoComplete="nickname"
            className="h-12 w-full rounded-xl bg-ink/60 px-3 text-base font-semibold ring-1 ring-line outline-none focus:ring-accent"
            required
          />
        </label>
      </Card>
      {error ? <p className="animate-pop rounded-xl bg-bad/15 px-3 py-2 text-sm font-medium text-bad-fg">{error}</p> : null}
      <Button
        type="submit"
        size="lg"
        className="mt-auto"
        busy={busy}
        disabled={!nickname.trim() || (!invite && code.length !== ROOM_CODE_LENGTH)}
      >
        Нэгдэх
      </Button>
    </form>
  );
}

export default function JoinGame() {
  return (
    <Screen>
      <div className="flex items-center gap-2">
        <Link href="/" className="rounded-lg px-2 py-1 text-muted hover:text-fg" aria-label="Буцах">
          ←
        </Link>
        <h1 className="flex-1 text-2xl font-black">Тоглоомд нэгдэх</h1>
        <ThemeToggle />
      </div>
      <Suspense>
        <JoinForm />
      </Suspense>
    </Screen>
  );
}
