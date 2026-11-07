// Owns every live room: applies commands through the shared engine, persists the
// result, pushes per-player projections and keeps one timer per room on its next deadline.
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  activeHumans,
  apply,
  botMoves,
  buildContentIndex,
  createRoom,
  currentRound,
  CUSTOM_IMAGE_RETENTION_MS,
  DEFAULT_BOT_COUNT,
  GameError,
  nextDeadline,
  projectFor,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_TYPES,
  type BotMoveKind,
  type ClientToServerEvents,
  type Command,
  type ContentCategory,
  type ContentIndex,
  type CreateRoomPayload,
  type JoinedRoom,
  type JoinRoomPayload,
  type Notice,
  type PresignedUpload,
  type RoomState,
  type ServerToClientEvents,
  type Timings,
} from '@gmr/shared';
import type { Server, Socket } from 'socket.io';
import { processUpload } from '../images';
import type { Logger } from '../logger';
import type { Repo } from '../repo/types';
import type { StorageDriver } from '../storage/types';

export interface SocketData {
  roomId?: string;
  playerId?: string;
}

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface ManagerDeps {
  repo: Repo;
  storage: StorageDriver;
  content: ContentCategory[];
  timings: Timings;
  log: Logger;
  now?: () => number;
  /** Scales how long bots "think" before each move; tests use a small value. */
  botPace?: number;
}

const MAX_TIMER_MS = 2 ** 31 - 1;
const PENDING_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
/** Custom images stay until the game finishes (then 24 h), but never longer than this. */
const READY_UPLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ABANDONED_LOBBY_MS = 2 * 60 * 60 * 1000;
/** Bots wait a human-looking moment before each move: [min, max] in ms. */
const BOT_THINK_MS: Record<BotMoveKind, [number, number]> = {
  category: [1500, 3000],
  addImage: [700, 1400],
  lock: [3000, 6000],
  guess: [2500, 8000],
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const roomKey = (roomId: string) => `room:${roomId}`;

export class RoomManager {
  private io: GameServer | null = null;
  private readonly rooms = new Map<string, RoomState>();
  private readonly byCode = new Map<string, string>();
  private readonly byInvite = new Map<string, string>();
  private readonly sockets = new Map<string, Set<GameSocket>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** roomId → bot move key → pending move. */
  private readonly botTimers = new Map<string, Map<string, NodeJS.Timeout>>();
  private readonly saves = new Map<string, Promise<void>>();
  private readonly content: ContentIndex;
  private readonly now: () => number;

  constructor(private readonly deps: ManagerDeps) {
    this.content = buildContentIndex(deps.content);
    this.now = deps.now ?? Date.now;
  }

  attach(io: GameServer): void {
    this.io = io;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  // ---------- lifecycle ----------

  /** Reloads stored rooms after a restart and re-arms their timers (NFR-08). */
  async restore(): Promise<number> {
    const stored = await this.deps.repo.loadRooms();
    for (let state of stored) {
      // Nobody is connected to a fresh process: start everyone's grace period now.
      // Bots live in this process, so they are back as soon as it is.
      for (const p of state.players) {
        if (p.leftAt === null && !p.isBot && p.connection === 'ONLINE') {
          state = apply(state, { type: 'disconnect', playerId: p.id }, this.ctx()).state;
        }
      }
      state = apply(state, { type: 'tick' }, this.ctx()).state;
      this.index(state);
      this.persist(state);
      this.schedule(state);
      this.planBots(state);
    }
    return stored.length;
  }

  async shutdown(): Promise<void> {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const roomId of [...this.botTimers.keys()]) this.clearBots(roomId);
    await Promise.allSettled([...this.saves.values()]);
  }

  /** Persistence is serialised per room so saves never overtake each other. */
  async flush(): Promise<void> {
    await Promise.allSettled([...this.saves.values()]);
  }

  private ctx() {
    return {
      now: this.now(),
      rng: Math.random,
      newId: randomUUID,
      content: this.content,
      timings: this.deps.timings,
    };
  }

  private index(state: RoomState): void {
    this.rooms.set(state.id, state);
    this.byCode.set(state.code, state.id);
    this.byInvite.set(state.inviteToken, state.id);
  }

  private unindex(state: RoomState): void {
    this.rooms.delete(state.id);
    this.byCode.delete(state.code);
    this.byInvite.delete(state.inviteToken);
    const timer = this.timers.get(state.id);
    if (timer) clearTimeout(timer);
    this.timers.delete(state.id);
    this.clearBots(state.id);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.byCode.has(code)) return code;
    }
  }

  // ---------- connections ----------

  createRoom(socket: GameSocket, payload: CreateRoomPayload): JoinedRoom {
    const sessionToken = randomBytes(24).toString('base64url');
    const playerId = randomUUID();
    const botRoom = (payload?.settings as { mode?: unknown } | undefined)?.mode === 'BOTS';
    const botCount = botRoom ? (payload.botCount ?? DEFAULT_BOT_COUNT) : 0;
    if (!Number.isInteger(botCount) || botCount < 0 || botCount > 50) throw new GameError('INVALID_SETTINGS');
    const state = createRoom(
      {
        id: randomUUID(),
        code: this.newCode(),
        inviteToken: randomBytes(12).toString('base64url'),
        hostId: playerId,
        nickname: payload?.nickname,
        sessionTokenHash: hashToken(sessionToken),
        settings: payload?.settings,
        botIds: Array.from({ length: botCount }, () => randomUUID()),
      },
      this.now(),
    );
    this.index(state);
    this.bind(socket, state.id, playerId);
    this.persist(state);
    this.broadcast(state);
    this.deps.log.info('room created', { roomId: state.id, code: state.code });
    return { code: state.code, playerId, sessionToken };
  }

  join(socket: GameSocket, payload: JoinRoomPayload): JoinedRoom {
    const code = typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : undefined;
    const invite = typeof payload?.inviteToken === 'string' ? payload.inviteToken : undefined;
    const roomId = (code && this.byCode.get(code)) || (invite && this.byInvite.get(invite)) || undefined;
    const state = roomId ? this.rooms.get(roomId) : undefined;
    if (!state) throw new GameError('ROOM_NOT_FOUND');

    // Rejoin with a stored session (FR-46).
    if (typeof payload.sessionToken === 'string' && payload.sessionToken) {
      const hash = hashToken(payload.sessionToken);
      const player = state.players.find((p) => p.sessionTokenHash === hash && p.leftAt === null);
      if (!player) throw new GameError('INVALID_SESSION');
      this.bind(socket, state.id, player.id);
      if (player.connection === 'OFFLINE') {
        this.dispatch(state.id, { type: 'reconnect', playerId: player.id });
      } else {
        this.sendState(state, player.id);
      }
      return { code: state.code, playerId: player.id, sessionToken: payload.sessionToken };
    }

    const sessionToken = randomBytes(24).toString('base64url');
    const playerId = randomUUID();
    this.dispatch(state.id, {
      type: 'join',
      playerId,
      nickname: typeof payload.nickname === 'string' ? payload.nickname : '',
      sessionTokenHash: hashToken(sessionToken),
    });
    this.bind(socket, state.id, playerId);
    this.sendState(this.rooms.get(state.id)!, playerId);
    return { code: state.code, playerId, sessionToken };
  }

  leave(socket: GameSocket): void {
    const { roomId, playerId } = this.requireBinding(socket);
    this.dispatch(roomId, { type: 'leave', playerId });
    for (const s of this.sockets.get(playerId) ?? []) {
      s.leave(roomKey(roomId));
      s.data.roomId = undefined;
      s.data.playerId = undefined;
    }
    this.sockets.delete(playerId);
    // Bots alone do not keep a room alive.
    const state = this.rooms.get(roomId);
    if (state && activeHumans(state).length === 0) void this.removeRoom(state);
  }

  handleDisconnect(socket: GameSocket): void {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const set = this.sockets.get(playerId);
    set?.delete(socket);
    if (set && set.size > 0) return; // another tab is still connected
    this.sockets.delete(playerId);
    if (this.rooms.has(roomId)) this.dispatch(roomId, { type: 'disconnect', playerId });
  }

  private bind(socket: GameSocket, roomId: string, playerId: string): void {
    const prev = socket.data;
    if (prev.playerId && (prev.playerId !== playerId || prev.roomId !== roomId)) {
      // Socket switches identity: release the old one as if it disconnected.
      this.handleDisconnect(socket);
      if (prev.roomId) socket.leave(roomKey(prev.roomId));
    }
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    socket.join(roomKey(roomId));
    let set = this.sockets.get(playerId);
    if (!set) {
      set = new Set();
      this.sockets.set(playerId, set);
    }
    set.add(socket);
  }

  private requireBinding(socket: GameSocket): { roomId: string; playerId: string } {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId || !this.rooms.has(roomId)) throw new GameError('NOT_IN_ROOM');
    return { roomId, playerId };
  }

  // ---------- player commands ----------

  command(socket: GameSocket, build: (playerId: string) => Command): void {
    const { roomId, playerId } = this.requireBinding(socket);
    this.dispatch(roomId, build(playerId));
  }

  // ---------- bots ----------

  /** Schedules every bot move that is now due; moves that are no longer due are dropped. */
  private planBots(state: RoomState): void {
    const moves = botMoves(state, this.ctx());
    let pending = this.botTimers.get(state.id);
    if (!pending && moves.length === 0) return;
    pending ??= new Map();
    this.botTimers.set(state.id, pending);
    const due = new Set(moves.map((m) => m.key));
    for (const [key, timer] of pending) {
      if (due.has(key)) continue;
      clearTimeout(timer);
      pending.delete(key);
    }
    const pace = this.deps.botPace ?? 1;
    for (const move of moves) {
      if (pending.has(move.key)) continue;
      const [min, max] = BOT_THINK_MS[move.kind];
      const timer = setTimeout(() => this.playBot(state.id, move.key), (min + Math.random() * (max - min)) * pace);
      timer.unref?.();
      pending.set(move.key, timer);
    }
  }

  private playBot(roomId: string, key: string): void {
    this.botTimers.get(roomId)?.delete(key);
    const state = this.rooms.get(roomId);
    if (!state) return;
    // Rebuilt from the current state, in case the round moved on while the bot was "thinking".
    const move = botMoves(state, this.ctx()).find((m) => m.key === key);
    if (!move) return;
    try {
      this.dispatch(roomId, move.cmd);
    } catch (err) {
      this.deps.log.warn('bot move failed', { roomId, key, err });
    }
  }

  private clearBots(roomId: string): void {
    for (const timer of this.botTimers.get(roomId)?.values() ?? []) clearTimeout(timer);
    this.botTimers.delete(roomId);
  }

  // ---------- custom uploads (FR-19, 20, 48, 61) ----------

  async presignUpload(socket: GameSocket, mime: unknown, bytes: unknown): Promise<PresignedUpload> {
    const { roomId, playerId } = this.requireBinding(socket);
    const state = this.rooms.get(roomId)!;
    const round = currentRound(state);
    if (!round || round.rankerId !== playerId) throw new GameError('NOT_RANKER');
    if (state.settings.imageSource !== 'CUSTOM' || round.state !== 'RANKING') throw new GameError('WRONG_STATE');
    if (round.items.length >= state.settings.imageCount) throw new GameError('TOO_MANY_IMAGES');
    if (typeof mime !== 'string' || !(UPLOAD_MIME_TYPES as readonly string[]).includes(mime)) {
      throw new GameError('UPLOAD_INVALID_TYPE');
    }
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) throw new GameError('BAD_REQUEST');
    if (bytes > UPLOAD_MAX_BYTES) throw new GameError('UPLOAD_TOO_LARGE');

    const uploadId = randomUUID();
    const storageKey = `raw/${roomId}/${uploadId}`;
    const now = this.now();
    await this.deps.repo.createUpload({
      id: uploadId,
      roomId,
      roundId: round.id,
      playerId,
      storageKey,
      mime,
      bytes,
      status: 'PENDING',
      createdAt: now,
      expiresAt: now + PENDING_UPLOAD_TTL_MS,
    });
    const put = await this.deps.storage.presignPut(storageKey, mime, UPLOAD_MAX_BYTES);
    return { uploadId, ...put };
  }

  async completeUpload(socket: GameSocket, uploadId: unknown, title: unknown): Promise<void> {
    const { roomId, playerId } = this.requireBinding(socket);
    if (typeof uploadId !== 'string') throw new GameError('BAD_REQUEST');
    const upload = await this.deps.repo.getUpload(uploadId);
    // Someone else's upload looks exactly like a missing one (NFR-07).
    if (!upload || upload.playerId !== playerId || upload.roomId !== roomId) throw new GameError('ITEM_NOT_FOUND');
    if (upload.status !== 'PENDING') throw new GameError('WRONG_STATE');

    const raw = await this.deps.storage.get(upload.storageKey);
    if (!raw) throw new GameError('UPLOAD_FAILED');
    const { storage, repo } = this.deps;
    try {
      const image = await processUpload(raw);
      const finalKey = `img/${roomId}/${uploadId}.webp`;
      await storage.put(finalKey, image.data, image.mime);
      await storage.delete(upload.storageKey);
      await repo.updateUpload(uploadId, {
        storageKey: finalKey,
        mime: image.mime,
        bytes: image.data.length,
        status: 'READY',
        expiresAt: this.now() + READY_UPLOAD_TTL_MS,
      });
      this.dispatch(roomId, {
        type: 'addCustomItem',
        playerId,
        item: {
          id: randomUUID(),
          imageUrl: storage.publicUrl(finalKey),
          title: typeof title === 'string' ? title : '',
          fact: null,
          sourceUrl: null,
          uploadId,
        },
      });
    } catch (err) {
      // Bad file, or the round moved on while the image was processing: drop it.
      await this.releaseUploads([uploadId]);
      throw err;
    }
  }

  private async releaseUploads(uploadIds: string[]): Promise<void> {
    for (const id of uploadIds) {
      const upload = await this.deps.repo.getUpload(id);
      if (!upload) continue;
      await this.deps.storage.delete(upload.storageKey).catch((err: unknown) => {
        this.deps.log.warn('failed to delete upload', { id, err });
      });
      await this.deps.repo.deleteUpload(id);
    }
  }

  // ---------- core loop ----------

  private dispatch(roomId: string, cmd: Command): void {
    const prev = this.rooms.get(roomId);
    if (!prev) throw new GameError('ROOM_NOT_FOUND');
    const { state, notices, changed } = apply(prev, cmd, this.ctx());
    if (!changed) {
      this.schedule(state);
      return;
    }
    this.rooms.set(roomId, state);
    this.broadcast(state);
    this.emitNotices(state, notices);
    this.persist(state);
    this.schedule(state);
    this.planBots(state);
  }

  private tick(roomId: string): void {
    this.timers.delete(roomId);
    if (!this.rooms.has(roomId)) return;
    try {
      this.dispatch(roomId, { type: 'tick' });
    } catch (err) {
      this.deps.log.error('tick failed', { roomId, err });
    }
  }

  private schedule(state: RoomState): void {
    const existing = this.timers.get(state.id);
    if (existing) clearTimeout(existing);
    this.timers.delete(state.id);
    const at = nextDeadline(state, this.deps.timings);
    if (at === null) return;
    const delay = Math.min(Math.max(0, at - this.now()) + 20, MAX_TIMER_MS);
    const timer = setTimeout(() => this.tick(state.id), delay);
    timer.unref?.();
    this.timers.set(state.id, timer);
  }

  private persist(state: RoomState): void {
    const prev = this.saves.get(state.id) ?? Promise.resolve();
    const next = prev
      .then(() => this.deps.repo.saveRoom(state))
      .catch((err: unknown) => this.deps.log.error('failed to save room', { roomId: state.id, err }));
    this.saves.set(state.id, next);
    void next.finally(() => {
      if (this.saves.get(state.id) === next) this.saves.delete(state.id);
    });
  }

  private sendState(state: RoomState, playerId: string): void {
    const sockets = this.sockets.get(playerId);
    if (!sockets?.size) return;
    const view = projectFor(state, playerId, { now: this.now(), content: this.content, timings: this.deps.timings });
    for (const s of sockets) s.emit('state', view);
  }

  private broadcast(state: RoomState): void {
    for (const p of state.players) this.sendState(state, p.id);
  }

  private emitNotices(state: RoomState, notices: Notice[]): void {
    const io = this.io;
    const to = io?.to(roomKey(state.id));
    const name = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '';
    for (const n of notices) {
      switch (n.type) {
        case 'roundStarted':
          to?.emit('round:started', { roundNumber: n.roundNumber, rankerId: n.rankerId, rankerName: name(n.rankerId) });
          break;
        case 'guessProgress':
          to?.emit('guess:progress', { submitted: n.submitted, total: n.total });
          break;
        case 'playerConnection':
          to?.emit('player:connection', {
            playerId: n.playerId,
            nickname: name(n.playerId),
            connection: n.connection,
            graceDeadlineAt: n.graceDeadlineAt,
          });
          break;
        case 'reveal':
          to?.emit('round:reveal', { roundNumber: n.roundNumber });
          break;
        case 'final':
          to?.emit('game:final', { winnerIds: n.winnerIds, reason: n.reason });
          break;
        case 'hostChanged':
          to?.emit('notice', { kind: 'HOST_CHANGED', playerId: n.playerId, nickname: name(n.playerId) });
          break;
        case 'roundSkipped':
          to?.emit('notice', { kind: 'ROUND_SKIPPED', roundNumber: n.roundNumber, reason: n.reason });
          break;
        case 'uploadsReleased':
          void this.releaseUploads(n.uploadIds);
          break;
      }
    }
  }

  // ---------- housekeeping ----------

  private async removeRoom(state: RoomState): Promise<void> {
    this.unindex(state);
    await this.saves.get(state.id);
    await this.deps.repo.deleteRoom(state.id);
    this.deps.log.info('room removed', { roomId: state.id, code: state.code });
  }

  /** Deletes expired custom images and drops finished or abandoned rooms. */
  async sweep(): Promise<void> {
    const now = this.now();
    for (const upload of await this.deps.repo.listExpiredUploads(now)) {
      await this.deps.storage.delete(upload.storageKey).catch(() => {});
      await this.deps.repo.deleteUpload(upload.id);
    }
    for (const state of [...this.rooms.values()]) {
      const finishedLongAgo =
        state.status === 'FINISHED' && state.finishedAt !== null && now - state.finishedAt > CUSTOM_IMAGE_RETENTION_MS;
      const abandonedLobby =
        state.status === 'LOBBY' &&
        activeHumans(state).every((p) => p.connection === 'OFFLINE') &&
        now - state.updatedAt > ABANDONED_LOBBY_MS;
      if (finishedLongAgo || abandonedLobby) await this.removeRoom(state);
    }
  }

  /** For tests. */
  getRoom(code: string): RoomState | undefined {
    const id = this.byCode.get(code);
    return id ? this.rooms.get(id) : undefined;
  }
}
