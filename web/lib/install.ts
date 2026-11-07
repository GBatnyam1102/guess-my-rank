'use client';

// How this device can install the PWA. Chrome/Edge/Samsung fire `beforeinstallprompt`, which we keep
// so our own button can open the install dialog; iOS has no such event, so it gets instructions instead.
import { useSyncExternalStore } from 'react';

export type InstallMode =
  | 'unknown' // server render, before hydration
  | 'installed' // already running as the installed app
  | 'prompt' // our button can open the browser's install dialog
  | 'ios' // Safari/Chrome on iPhone/iPad: Share -> Add to Home Screen
  | 'android' // mobile browser without the prompt (or it was dismissed): browser menu -> Install app
  | 'desktop'; // a computer: show a QR code to open the game on a phone

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    /** Set by installCaptureScript (lib/install-init.ts) when the event fires before React hydrates. */
    __gmrInstallPrompt?: InstallPromptEvent;
  }
}

const listeners = new Set<() => void>();
let installed = false;

function notify() {
  for (const l of listeners) l();
}

function onPrompt(e: Event) {
  e.preventDefault();
  window.__gmrInstallPrompt = e as InstallPromptEvent;
  notify();
}

function onInstalled() {
  installed = true;
  window.__gmrInstallPrompt = undefined;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
  }
  const standalone = window.matchMedia('(display-mode: standalone)');
  standalone.addEventListener('change', listener);
  return () => {
    standalone.removeEventListener('change', listener);
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    }
  };
}

function snapshot(): InstallMode {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (installed || nav.standalone || window.matchMedia('(display-mode: standalone)').matches) return 'installed';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const phone = ios || /Android/.test(ua) || window.matchMedia('(pointer: coarse)').matches;
  // On a computer the game is meant for phones, so the QR code beats a desktop install.
  if (!phone) return 'desktop';
  if (window.__gmrInstallPrompt) return 'prompt';
  return ios ? 'ios' : 'android';
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, snapshot, () => 'unknown');
}

/** Opens the browser's install dialog. Resolves true when the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = window.__gmrInstallPrompt;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // The event can be used only once.
  window.__gmrInstallPrompt = undefined;
  if (outcome === 'accepted') installed = true;
  notify();
  return outcome === 'accepted';
}
