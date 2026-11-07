import { randomUUID } from 'node:crypto';
import { ERROR_MESSAGES, GameError, type AckResult } from '@gmr/shared';
import type { Socket } from 'socket.io';
import type { Logger } from './logger';
import type { GameServer, GameSocket, RoomManager } from './rooms/manager';

function record(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new GameError('BAD_REQUEST');
  return payload as Record<string, unknown>;
}

function str(value: unknown): string {
  if (typeof value !== 'string') throw new GameError('BAD_REQUEST');
  return value;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50 || !value.every((v) => typeof v === 'string')) {
    throw new GameError('INVALID_ORDER');
  }
  return value as string[];
}

export function registerSocketHandlers(io: GameServer, manager: RoomManager, log: Logger): void {
  io.on('connection', (typed: GameSocket) => {
    const socket = typed as unknown as Socket;

    /** Every client event carries an ack; errors become `{ ok: false }` instead of crashing. */
    const on = (event: string, withPayload: boolean, fn: (payload: unknown) => unknown) => {
      socket.on(event, async (...args: unknown[]) => {
        const ack = args[args.length - 1];
        if (typeof ack !== 'function') return;
        const reply = ack as (r: AckResult<unknown>) => void;
        try {
          const data = await fn(withPayload ? args[0] : undefined);
          reply({ ok: true, data: data ?? null });
        } catch (err) {
          if (err instanceof GameError) {
            reply({ ok: false, error: err.code, message: err.message });
          } else {
            log.error('socket handler failed', { event, err });
            reply({ ok: false, error: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL });
          }
        }
      });
    };

    on('room:create', true, (p) => {
      const payload = record(p);
      return manager.createRoom(typed, {
        nickname: str(payload.nickname),
        settings: record(payload.settings) as never,
        botCount: payload.botCount === undefined ? undefined : Number(payload.botCount),
      });
    });
    on('room:join', true, (p) => manager.join(typed, record(p)));
    on('room:leave', false, () => manager.leave(typed));
    on('bot:add', false, () => manager.command(typed, (playerId) => ({ type: 'addBot', playerId, botId: randomUUID() })));
    on('bot:remove', true, (p) => {
      const botId = str(record(p).playerId);
      manager.command(typed, (playerId) => ({ type: 'removeBot', playerId, botId }));
    });

    on('game:start', false, () => manager.command(typed, (playerId) => ({ type: 'start', playerId })));
    on('game:end', false, () => manager.command(typed, (playerId) => ({ type: 'end', playerId })));
    on('game:again', false, () => manager.command(typed, (playerId) => ({ type: 'playAgain', playerId })));

    on('ranker:category', true, (p) => {
      const categoryId = str(record(p).categoryId);
      manager.command(typed, (playerId) => ({ type: 'chooseCategory', playerId, categoryId }));
    });
    on('ranker:refresh', false, () => manager.command(typed, (playerId) => ({ type: 'refresh', playerId })));
    on('ranker:lock', true, (p) => {
      const order = strArray(record(p).order);
      manager.command(typed, (playerId) => ({ type: 'lock', playerId, order }));
    });

    on('upload:presign', true, (p) => {
      const payload = record(p);
      return manager.presignUpload(typed, payload.mime, payload.bytes);
    });
    on('upload:done', true, (p) => {
      const payload = record(p);
      return manager.completeUpload(typed, payload.uploadId, payload.title ?? '');
    });
    on('upload:rename', true, (p) => {
      const payload = record(p);
      const itemId = str(payload.itemId);
      const title = str(payload.title);
      manager.command(typed, (playerId) => ({ type: 'renameCustomItem', playerId, itemId, title }));
    });
    on('upload:remove', true, (p) => {
      const itemId = str(record(p).itemId);
      manager.command(typed, (playerId) => ({ type: 'removeCustomItem', playerId, itemId }));
    });

    on('guess:submit', true, (p) => {
      const order = strArray(record(p).order);
      manager.command(typed, (playerId) => ({ type: 'submitGuess', playerId, order }));
    });

    socket.on('disconnect', () => {
      try {
        manager.handleDisconnect(typed);
      } catch (err) {
        log.error('disconnect handling failed', { err });
      }
    });
  });
}
