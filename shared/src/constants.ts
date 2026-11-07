import type { RoomSettings, RoundsMode } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const IMAGE_COUNT_OPTIONS = [5, 6, 8, 10] as const;
export const ROUNDS_OPTIONS: readonly RoundsMode[] = [1, 3, 5, 'EACH'];
export const MAX_REFRESH = 3;
export const NICKNAME_MAX = 20;
/** Bot room size picked on the New Game screen; the Host can add or remove bots in the lobby. */
export const DEFAULT_BOT_COUNT = 3;
export const BOT_NAMES = ['Робо', 'Пиксел', 'Чип', 'Нано', 'Турбо', 'Байт', 'Гига', 'Кибер', 'Бит'] as const;
export const TITLE_MAX = 40;

export const ROOM_CODE_LENGTH = 6;
/** No 0/O/1/I so codes are easy to read aloud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

/** Custom images are deleted this long after the game finishes (Q-8). */
export const CUSTOM_IMAGE_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface Timings {
  /** Guesser/Ranker may be offline this long before being skipped (FR-71–73). */
  disconnectGraceMs: number;
  /** Host rights move to another online player after this (Q-3). */
  hostGraceMs: number;
  /** Ranker phase limit: category pick + ranking (Q-2). */
  rankingRandomMs: number;
  /** Ranker phase limit when the Ranker also uploads images. */
  rankingCustomMs: number;
  /** Guessing limit, so an idle Guesser cannot block the game (Q-1). */
  guessingMs: number;
  /** Reveal countdown before the next round (FR-38, FR-69). */
  revealMs: number;
  /** How long the "round skipped" notice stays up. */
  skippedRoundMs: number;
}

export const DEFAULT_TIMINGS: Timings = {
  disconnectGraceMs: 60_000,
  hostGraceMs: 60_000,
  rankingRandomMs: 180_000,
  rankingCustomMs: 300_000,
  guessingMs: 120_000,
  revealMs: 15_000,
  skippedRoundMs: 5_000,
};

/** "Each player once" is the default so every player gets to rank (Q-11). */
export const DEFAULT_SETTINGS: RoomSettings = {
  mode: 'HUMANS',
  maxPlayers: MAX_PLAYERS,
  imageCount: 5,
  imageSource: 'RANDOM',
  roundsMode: 'EACH',
};
