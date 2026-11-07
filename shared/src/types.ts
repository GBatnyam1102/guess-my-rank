// Domain model. All timestamps are epoch milliseconds so the state stays JSON-serialisable.

export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED';
export type ImageSource = 'RANDOM' | 'CUSTOM';
export type RoundsMode = 1 | 3 | 5 | 'EACH';
export type Connection = 'ONLINE' | 'OFFLINE';
export type ItemKind = 'RANDOM' | 'CUSTOM';
/** HUMANS: friends join with the code. BOTS: one player against server-run bots. */
export type RoomMode = 'HUMANS' | 'BOTS';

/** CATEGORY → RANKING → GUESSING → REVEAL, or SKIPPED when the Ranker drops out. */
export type RoundState = 'CATEGORY' | 'RANKING' | 'GUESSING' | 'REVEAL' | 'SKIPPED';
export type GuessStatus = 'GUESSING' | 'DISCONNECTED' | 'SUBMITTED' | 'SKIPPED';
export type SkipReason = 'RANKER_TIMEOUT' | 'RANKER_OFFLINE' | 'RANKER_LEFT';
export type EndReason = 'COMPLETED' | 'HOST_ENDED' | 'NOT_ENOUGH_PLAYERS';

export interface RoomSettings {
  mode: RoomMode;
  maxPlayers: number;
  imageCount: number;
  imageSource: ImageSource;
  roundsMode: RoundsMode;
}

export interface Player {
  id: string;
  nickname: string;
  /** Bots are played by the server; they are always online and never become Host. */
  isBot: boolean;
  sessionTokenHash: string;
  connection: Connection;
  disconnectedAt: number | null;
  rankedInCycle: boolean;
  totalScore: number;
  joinedAt: number;
  leftAt: number | null;
}

export interface RoundItem {
  id: string;
  imageUrl: string;
  title: string;
  fact: string | null;
  sourceUrl: string | null;
  kind: ItemKind;
  contentItemId: string | null;
  uploadId: string | null;
}

export interface Guess {
  id: string;
  playerId: string;
  /** Order the images were shown to this Guesser (a fresh shuffle per Guesser). */
  shownOrder: string[];
  order: string[] | null;
  status: GuessStatus;
  disconnectedAt: number | null;
  score: number;
  submittedAt: number | null;
}

export interface Round {
  id: string;
  number: number;
  rankerId: string;
  categoryId: string | null;
  state: RoundState;
  refreshCount: number;
  items: RoundItem[];
  /** Content items already drawn this round, so refresh does not repeat them. */
  usedContentIds: string[];
  /** The Ranker's secret order. Never leaves the server before REVEAL. */
  answerOrder: string[] | null;
  deadlineAt: number | null;
  guesses: Guess[];
  startedAt: number;
  skipReason: SkipReason | null;
}

export interface RoomState {
  id: string;
  code: string;
  inviteToken: string;
  status: RoomStatus;
  hostPlayerId: string;
  settings: RoomSettings;
  players: Player[];
  rounds: Round[];
  endReason: EndReason | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  version: number;
}

export interface ContentItem {
  id: string;
  categoryId: string;
  imageUrl: string;
  title: string;
  fact: string | null;
  sourceUrl: string | null;
  license: string | null;
  credit: string | null;
}

export interface ContentCategory {
  id: string;
  name: string;
  emoji: string;
  items: ContentItem[];
}
