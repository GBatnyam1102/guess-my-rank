'use client';

import { useEffect, useState } from 'react';

/** Server-adjusted clock that re-renders a few times per second for countdowns. */
export function useServerNow(offsetMs: number, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => clearInterval(id);
  }, [offsetMs, intervalMs]);
  return now;
}

export function secondsLeft(deadlineAt: number | null, now: number): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

function reconcile(stored: readonly string[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const kept = stored.filter((id) => wanted.has(id));
  const keptSet = new Set(kept);
  return [...kept, ...ids.filter((id) => !keptSet.has(id))];
}

function readDraft(key: string): string[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The player's in-progress order. It lives only in this tab (sessionStorage) until
 * they lock or submit, so a page refresh does not lose it.
 */
export function useDraftOrder(key: string, ids: readonly string[]): [string[], (order: string[]) => void] {
  const [stored, setStored] = useState<{ key: string; order: string[] }>(() => ({
    key,
    order: readDraft(key) ?? [...ids],
  }));
  const base = stored.key === key ? stored.order : (readDraft(key) ?? [...ids]);
  const order = reconcile(base, ids);
  const setOrder = (next: string[]) => {
    setStored({ key, order: next });
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  };
  return [order, setOrder];
}
