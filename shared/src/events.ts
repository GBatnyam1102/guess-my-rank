// Socket.IO contract shared by web and server.
import type { ErrorCode } from './errors';
import type { Connection, EndReason, RoomSettings, SkipReason } from './types';
import type { PlayerView } from './view';

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };
export type Ack<T> = (result: AckResult<T>) => void;

export interface JoinedRoom {
  code: string;
  playerId: string;
  sessionToken: string;
}

export interface CreateRoomPayload {
  nickname: string;
  settings: RoomSettings;
  /** Bot rooms only: how many bots join at the start. */
  botCount?: number;
}

/** Join by code or invite token with a nickname, or rejoin with a stored session token (FR-46). */
export interface JoinRoomPayload {
  code?: string;
  inviteToken?: string;
  nickname?: string;
  sessionToken?: string;
}

export interface PresignedUpload {
  uploadId: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: Ack<JoinedRoom>) => void;
  'room:join': (payload: JoinRoomPayload, ack: Ack<JoinedRoom>) => void;
  'room:leave': (ack: Ack<null>) => void;
  'bot:add': (ack: Ack<null>) => void;
  'bot:remove': (payload: { playerId: string }, ack: Ack<null>) => void;
  'game:start': (ack: Ack<null>) => void;
  'game:end': (ack: Ack<null>) => void;
  'game:again': (ack: Ack<null>) => void;
  'ranker:category': (payload: { categoryId: string }, ack: Ack<null>) => void;
  'ranker:refresh': (ack: Ack<null>) => void;
  'ranker:lock': (payload: { order: string[] }, ack: Ack<null>) => void;
  'upload:presign': (payload: { mime: string; bytes: number }, ack: Ack<PresignedUpload>) => void;
  'upload:done': (payload: { uploadId: string; title: string }, ack: Ack<null>) => void;
  'upload:rename': (payload: { itemId: string; title: string }, ack: Ack<null>) => void;
  'upload:remove': (payload: { itemId: string }, ack: Ack<null>) => void;
  'guess:submit': (payload: { order: string[] }, ack: Ack<null>) => void;
}

export type NoticePayload =
  | { kind: 'HOST_CHANGED'; playerId: string; nickname: string }
  | { kind: 'ROUND_SKIPPED'; roundNumber: number; reason: SkipReason };

export interface ServerToClientEvents {
  /** Full per-player projection; also the snapshot sent on (re)join. */
  state: (view: PlayerView) => void;
  'round:started': (payload: { roundNumber: number; rankerId: string; rankerName: string }) => void;
  'guess:progress': (payload: { submitted: number; total: number }) => void;
  'player:connection': (payload: {
    playerId: string;
    nickname: string;
    connection: Connection;
    graceDeadlineAt: number | null;
  }) => void;
  'round:reveal': (payload: { roundNumber: number }) => void;
  'game:final': (payload: { winnerIds: string[]; reason: EndReason }) => void;
  notice: (payload: NoticePayload) => void;
}
