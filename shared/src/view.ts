// What a single player is allowed to see. Built by the server for each viewer.
import type {
  Connection,
  EndReason,
  GuessStatus,
  ItemKind,
  RoomSettings,
  RoomStatus,
  RoundState,
  SkipReason,
} from './types';

export interface PublicPlayer {
  id: string;
  nickname: string;
  isBot: boolean;
  connection: Connection;
  totalScore: number;
  isHost: boolean;
  left: boolean;
  /** When an offline player will be skipped / lose host rights. */
  graceDeadlineAt: number | null;
}

export interface ItemView {
  id: string;
  imageUrl: string;
  title: string;
  fact: string | null;
  sourceUrl: string | null;
  kind: ItemKind;
}

export interface CategoryOption {
  id: string;
  name: string;
  emoji: string;
  itemCount: number;
}

export interface RevealGuessView {
  playerId: string;
  order: string[] | null;
  status: GuessStatus;
  score: number;
}

export type RoundRole = 'RANKER' | 'GUESSER' | 'SPECTATOR';

export interface RoundView {
  id: string;
  number: number;
  rankerId: string;
  state: RoundState;
  deadlineAt: number | null;
  skipReason: SkipReason | null;
  categoryName: string | null;
  refreshLeft: number;
  imageCount: number;
  myRole: RoundRole;
  /**
   * Ranker: drawn/uploaded items (then the locked order). Guesser: their own shuffled order.
   * Everyone after REVEAL: the Ranker's order. Otherwise null.
   */
  items: ItemView[] | null;
  myGuess: { status: GuessStatus; order: string[] | null; score: number | null } | null;
  guessStatuses: { playerId: string; status: GuessStatus }[];
  progress: { submitted: number; skipped: number; total: number } | null;
  reveal: { answerOrder: string[]; guesses: RevealGuessView[] } | null;
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  isBot: boolean;
  totalScore: number;
  place: number;
  left: boolean;
}

export interface PlayerView {
  serverNow: number;
  meId: string;
  room: {
    id: string;
    code: string;
    inviteToken: string;
    status: RoomStatus;
    hostPlayerId: string;
    settings: RoomSettings;
    plannedRounds: number;
    endReason: EndReason | null;
  };
  players: PublicPlayer[];
  round: RoundView | null;
  /** Only for the Ranker while choosing a category. */
  categories: CategoryOption[] | null;
  leaderboard: LeaderboardEntry[];
  final: { winnerIds: string[] } | null;
}
