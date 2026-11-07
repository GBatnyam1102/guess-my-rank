'use client';

import type { PlayerView } from '@gmr/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ActionError, errorMessage, getSocket } from './socket';
import { clearSession, getSession } from './session';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'good';
}

export interface Fatal {
  code: string;
  message: string;
}

export interface GameApi {
  view: PlayerView | null;
  online: boolean;
  fatal: Fatal | null;
  /** serverNow − Date.now(), so countdowns follow the server clock. */
  offset: number;
  toasts: Toast[];
  toast(text: string, tone?: Toast['tone']): void;
  dismiss(id: number): void;
  /** Runs an action; failures become an error toast. Resolves to false on failure. */
  run(action: () => Promise<unknown>): Promise<boolean>;
}

const SESSION_ERRORS = new Set(['INVALID_SESSION', 'ROOM_NOT_FOUND', 'NOT_IN_ROOM']);

export function useGameConnection(code: string): GameApi {
  const session = useMemo(() => getSession(code), [code]);
  const [view, setView] = useState<PlayerView | null>(null);
  const [online, setOnline] = useState(() => getSocket().connected);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [offset, setOffset] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);
  const viewRef = useRef<PlayerView | null>(null);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, tone: Toast['tone'] = 'info') => {
      const id = nextToast.current++;
      setToasts((t) => [...t.slice(-3), { id, text, tone }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 5000 : 3500);
    },
    [dismiss],
  );

  useEffect(() => {
    if (!session) return;
    const socket = getSocket();
    const nameOf = (id: string) => {
      const p = viewRef.current?.players.find((x) => x.id === id);
      return p ? displayName(p) : 'Тоглогч';
    };

    const join = async () => {
      try {
        await api.join({ code, sessionToken: session.token });
      } catch (err) {
        if (err instanceof ActionError && SESSION_ERRORS.has(err.code)) {
          clearSession(code);
          setFatal({ code: err.code, message: err.message });
        }
      }
    };

    const onConnect = () => {
      setOnline(true);
      void join();
    };
    const onDisconnect = () => setOnline(false);
    const onState = (v: PlayerView) => {
      viewRef.current = v;
      setOffset(v.serverNow - Date.now());
      setView(v);
    };
    const onRoundStarted = (p: { roundNumber: number; rankerId: string; rankerName: string }) => {
      const me = viewRef.current?.meId;
      toast(p.rankerId === me ? `Round ${p.roundNumber}: Та Ranker боллоо!` : `Round ${p.roundNumber}: ${nameOf(p.rankerId)} эрэмбэлнэ`);
    };
    const onConnection = (p: { playerId: string; nickname: string; connection: 'ONLINE' | 'OFFLINE' }) => {
      if (p.playerId === viewRef.current?.meId || viewRef.current?.room.status !== 'IN_GAME') return;
      toast(p.connection === 'OFFLINE' ? `${p.nickname}-ийн холболт тасарлаа` : `${p.nickname} буцаж ирлээ`);
    };
    const onNotice = (n: { kind: string; playerId?: string; nickname?: string }) => {
      if (n.kind === 'HOST_CHANGED') {
        toast(n.playerId === viewRef.current?.meId ? 'Та одоо Host боллоо' : `Шинэ Host: ${n.nickname ?? nameOf(n.playerId ?? '')}`);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    socket.on('round:started', onRoundStarted);
    socket.on('player:connection', onConnection);
    socket.on('notice', onNotice);
    if (socket.connected) void join();
    else socket.connect();

    // Phones suspend sockets in the background; reconnect as soon as the tab is visible.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
      socket.off('round:started', onRoundStarted);
      socket.off('player:connection', onConnection);
      socket.off('notice', onNotice);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [code, session, toast]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        return true;
      } catch (err) {
        toast(errorMessage(err), 'error');
        return false;
      }
    },
    [toast],
  );

  return {
    view,
    online,
    fatal: session ? fatal : { code: 'NO_SESSION', message: 'Энэ өрөөнд нэгдээгүй байна.' },
    offset,
    toasts,
    toast,
    dismiss,
    run,
  };
}

const GameContext = createContext<GameApi | null>(null);

export const GameProvider = GameContext.Provider;

export function useGame(): GameApi & { view: PlayerView } {
  const ctx = useContext(GameContext);
  if (!ctx?.view) throw new Error('useGame() outside a loaded game');
  return ctx as GameApi & { view: PlayerView };
}

export function useMe() {
  const { view } = useGame();
  const me = view.players.find((p) => p.id === view.meId);
  return { me, isHost: view.room.hostPlayerId === view.meId };
}

/** Bots carry a robot after their name wherever a name stands on its own (toasts, headings). */
export function displayName(p: { nickname: string; isBot: boolean }): string {
  return p.isBot ? `${p.nickname} 🤖` : p.nickname;
}

export function useNickname() {
  const { view } = useGame();
  return (id: string) => {
    const p = view.players.find((x) => x.id === id);
    return p ? displayName(p) : 'Тоглогч';
  };
}

export function useIsBot() {
  const { view } = useGame();
  return (id: string) => view.players.find((p) => p.id === id)?.isBot ?? false;
}
