import {
  ERROR_MESSAGES,
  type AckResult,
  type ClientToServerEvents,
  type CreateRoomPayload,
  type JoinedRoom,
  type JoinRoomPayload,
  type PresignedUpload,
  type ServerToClientEvents,
} from '@gmr/shared';
import { io, type Socket } from 'socket.io-client';
import { serverUrl } from './config';

export type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameClientSocket | null = null;

/** One socket per tab, shared by every page so navigation does not drop the connection. */
export function getSocket(): GameClientSocket {
  if (!socket) {
    socket = io(serverUrl(), {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
  }
  return socket;
}

export class ActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 12_000;

async function request<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
  const s = getSocket();
  if (!s.connected) s.connect();
  const untyped = s as unknown as {
    timeout(ms: number): { emitWithAck(ev: string, ...args: unknown[]): Promise<AckResult<T>> };
  };
  let res: AckResult<T>;
  try {
    res =
      payload === undefined
        ? await untyped.timeout(TIMEOUT_MS).emitWithAck(event)
        : await untyped.timeout(TIMEOUT_MS).emitWithAck(event, payload);
  } catch {
    throw new ActionError('TIMEOUT', 'Сервертэй холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.');
  }
  if (!res.ok) throw new ActionError(res.error, res.message || ERROR_MESSAGES[res.error] || ERROR_MESSAGES.INTERNAL);
  return res.data;
}

export const api = {
  create: (p: CreateRoomPayload) => request<JoinedRoom>('room:create', p),
  join: (p: JoinRoomPayload) => request<JoinedRoom>('room:join', p),
  leave: () => request<null>('room:leave'),
  addBot: () => request<null>('bot:add'),
  removeBot: (playerId: string) => request<null>('bot:remove', { playerId }),
  start: () => request<null>('game:start'),
  end: () => request<null>('game:end'),
  again: () => request<null>('game:again'),
  category: (categoryId: string) => request<null>('ranker:category', { categoryId }),
  refresh: () => request<null>('ranker:refresh'),
  lock: (order: string[]) => request<null>('ranker:lock', { order }),
  presign: (mime: string, bytes: number) => request<PresignedUpload>('upload:presign', { mime, bytes }),
  uploadDone: (uploadId: string, title: string) => request<null>('upload:done', { uploadId, title }),
  rename: (itemId: string, title: string) => request<null>('upload:rename', { itemId, title }),
  remove: (itemId: string) => request<null>('upload:remove', { itemId }),
  submit: (order: string[]) => request<null>('guess:submit', { order }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ActionError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return ERROR_MESSAGES.INTERNAL;
}
