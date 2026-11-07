'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { THEME_COLORS, THEME_KEY as KEY, type Theme } from './theme-init';

export type ThemePref = 'system' | 'light' | 'dark';
export type { Theme };

const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): Theme {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(pref: ThemePref): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  const swap = () => {
    root.dataset.theme = theme;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', THEME_COLORS[theme]);
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && typeof document.startViewTransition === 'function') document.startViewTransition(swap);
  else swap();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const media = matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => {
    if (readPref() === 'system') applyTheme(systemTheme());
    onChange();
  };
  // Another tab changed the theme.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    applyTheme(resolveTheme(readPref()));
    onChange();
  };
  media.addEventListener('change', onSystem);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onSystem);
    window.removeEventListener('storage', onStorage);
  };
}

const snapshot = () => `${readPref()}:${resolveTheme(readPref())}`;

export function useTheme(): { pref: ThemePref; theme: Theme; setPref: (pref: ThemePref) => void } {
  const [pref, theme] = useSyncExternalStore(subscribe, snapshot, () => 'system:dark').split(':') as [ThemePref, Theme];
  const setPref = useCallback((next: ThemePref) => {
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // storage blocked: the theme still changes now, it just is not remembered
    }
    applyTheme(resolveTheme(next));
    for (const l of listeners) l();
  }, []);
  return { pref, theme, setPref };
}
