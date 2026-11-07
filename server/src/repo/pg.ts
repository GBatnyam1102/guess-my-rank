import {
  CUSTOM_IMAGE_RETENTION_MS,
  plannedRounds,
  type ContentCategory,
  type Guess,
  type Player,
  type RoomState,
  type Round,
  type RoundItem,
  type RoundsMode,
} from '@gmr/shared';
import { and, asc, eq, getTableColumns, gt, inArray, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '../db/schema';
import type { Repo, UploadRecord } from './types';

type Db = PostgresJsDatabase<typeof schema>;

const toDate = (ms: number | null): Date | null => (ms === null ? null : new Date(ms));
const toMs = (d: Date | null): number | null => (d === null ? null : d.getTime());

/** `SET col = excluded.col` for every column except the primary key, for multi-row upserts. */
function excludedSet(table: PgTable): Record<string, SQL> {
  const cols = getTableColumns(table);
  return Object.fromEntries(
    Object.entries(cols)
      .filter(([key]) => key !== 'id')
      .map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)]),
  );
}

export class PgRepo implements Repo {
  readonly kind = 'postgres' as const;
  private readonly client: postgres.Sql;
  private readonly db: Db;

  constructor(url: string) {
    this.client = postgres(connectionUrl(url), {
      max: 10,
      // Close idle connections so a serverless database (Neon) can scale to zero between games.
      idle_timeout: 60,
      onnotice: () => {},
    });
    this.db = drizzle(this.client, { schema });
  }

  async migrate(migrationsFolder: string): Promise<void> {
    await migrate(this.db, { migrationsFolder });
  }

  async loadContent(): Promise<ContentCategory[]> {
    const cats = await this.db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder));
    const items = await this.db.select().from(schema.categoryItems).orderBy(asc(schema.categoryItems.sortOrder));
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      items: items
        .filter((i) => i.categoryId === c.id)
        .map((i) => ({
          id: i.id,
          categoryId: i.categoryId,
          imageUrl: i.imageUrl,
          title: i.title,
          fact: i.fact,
          sourceUrl: i.sourceUrl,
          license: i.license,
          credit: i.credit,
        })),
    }));
  }

  async upsertContent(content: ContentCategory[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const catRows = content.map((c, i) => ({ id: c.id, name: c.name, emoji: c.emoji, sortOrder: i }));
      if (catRows.length) {
        await tx.insert(schema.categories).values(catRows).onConflictDoUpdate({
          target: schema.categories.id,
          set: excludedSet(schema.categories),
        });
      }
      const itemRows = content.flatMap((c) =>
        c.items.map((item, i) => ({ ...item, categoryId: c.id, sortOrder: i })),
      );
      if (itemRows.length) {
        await tx.insert(schema.categoryItems).values(itemRows).onConflictDoUpdate({
          target: schema.categoryItems.id,
          set: excludedSet(schema.categoryItems),
        });
      }
    });
  }

  async loadRooms(): Promise<RoomState[]> {
    // Old finished rooms are loaded too; the manager's sweep deletes them.
    const roomRows = await this.db.select().from(schema.rooms);
    if (roomRows.length === 0) return [];
    const roomIds = roomRows.map((r) => r.id);
    const playerRows = await this.db
      .select()
      .from(schema.players)
      .where(inArray(schema.players.roomId, roomIds))
      .orderBy(asc(schema.players.joinedAt));
    const roundRows = await this.db
      .select()
      .from(schema.rounds)
      .where(inArray(schema.rounds.roomId, roomIds))
      .orderBy(asc(schema.rounds.number));
    const roundIds = roundRows.map((r) => r.id);
    const itemRows = roundIds.length
      ? await this.db
          .select()
          .from(schema.roundItems)
          .where(inArray(schema.roundItems.roundId, roundIds))
          .orderBy(asc(schema.roundItems.position))
      : [];
    const guessRows = roundIds.length
      ? await this.db.select().from(schema.guesses).where(inArray(schema.guesses.roundId, roundIds))
      : [];

    return roomRows.map((room) => {
      const players: Player[] = playerRows
        .filter((p) => p.roomId === room.id)
        .map((p) => ({
          id: p.id,
          nickname: p.nickname,
          isBot: p.isBot,
          sessionTokenHash: p.sessionTokenHash,
          connection: p.connection,
          disconnectedAt: toMs(p.disconnectedAt),
          rankedInCycle: p.rankedInCycle,
          totalScore: p.totalScore,
          joinedAt: p.joinedAt.getTime(),
          leftAt: toMs(p.leftAt),
        }));
      const rounds: Round[] = roundRows
        .filter((r) => r.roomId === room.id)
        .map((r) => ({
          id: r.id,
          number: r.number,
          rankerId: r.rankerId,
          categoryId: r.categoryId,
          state: r.state,
          refreshCount: r.refreshCount,
          items: itemRows
            .filter((i) => i.roundId === r.id)
            .map<RoundItem>((i) => ({
              id: i.id,
              imageUrl: i.imageUrl,
              title: i.title,
              fact: i.fact,
              sourceUrl: i.sourceUrl,
              kind: i.kind,
              contentItemId: i.contentItemId,
              uploadId: i.uploadId,
            })),
          usedContentIds: r.usedContentIds,
          answerOrder: r.answerOrder ?? null,
          deadlineAt: toMs(r.deadlineAt),
          guesses: guessRows
            .filter((g) => g.roundId === r.id)
            .map<Guess>((g) => ({
              id: g.id,
              playerId: g.playerId,
              shownOrder: g.shownOrder,
              order: g.guessOrder ?? null,
              status: g.status,
              disconnectedAt: toMs(g.disconnectedAt),
              score: g.score,
              submittedAt: toMs(g.submittedAt),
            })),
          startedAt: r.startedAt.getTime(),
          skipReason: r.skipReason as Round['skipReason'],
        }));
      return {
        id: room.id,
        code: room.code,
        inviteToken: room.inviteToken,
        status: room.status,
        hostPlayerId: room.hostPlayerId,
        settings: {
          mode: room.mode,
          maxPlayers: room.maxPlayers,
          imageCount: room.imageCount,
          imageSource: room.imageSource,
          roundsMode: (room.roundsMode === 'EACH' ? 'EACH' : Number(room.roundsMode)) as RoundsMode,
        },
        players,
        rounds,
        endReason: room.endReason as RoomState['endReason'],
        createdAt: room.createdAt.getTime(),
        updatedAt: room.updatedAt.getTime(),
        finishedAt: toMs(room.finishedAt),
        version: room.version,
      };
    });
  }

  /** Writes the whole room aggregate in one transaction (a room is at most ~200 rows). */
  async saveRoom(s: RoomState): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = s.status === 'IN_GAME' ? s.rounds[s.rounds.length - 1] : undefined;
      await tx
        .insert(schema.rooms)
        .values({
          id: s.id,
          code: s.code,
          inviteToken: s.inviteToken,
          hostPlayerId: s.hostPlayerId,
          status: s.status,
          mode: s.settings.mode,
          maxPlayers: s.settings.maxPlayers,
          imageCount: s.settings.imageCount,
          imageSource: s.settings.imageSource,
          roundsMode: String(s.settings.roundsMode),
          totalRounds: plannedRounds(s),
          currentRoundId: current?.id ?? null,
          endReason: s.endReason,
          version: s.version,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
          finishedAt: toDate(s.finishedAt),
        })
        .onConflictDoUpdate({ target: schema.rooms.id, set: excludedSet(schema.rooms) });

      const playerIds = s.players.map((p) => p.id);
      await tx
        .delete(schema.players)
        .where(
          and(
            eq(schema.players.roomId, s.id),
            playerIds.length ? notInArray(schema.players.id, playerIds) : undefined,
          ),
        );
      if (s.players.length) {
        await tx
          .insert(schema.players)
          .values(
            s.players.map((p) => ({
              id: p.id,
              roomId: s.id,
              nickname: p.nickname,
              isBot: p.isBot,
              sessionTokenHash: p.sessionTokenHash,
              isHost: p.id === s.hostPlayerId,
              connection: p.connection,
              disconnectedAt: toDate(p.disconnectedAt),
              rankedInCycle: p.rankedInCycle,
              totalScore: p.totalScore,
              joinedAt: new Date(p.joinedAt),
              leftAt: toDate(p.leftAt),
            })),
          )
          .onConflictDoUpdate({ target: schema.players.id, set: excludedSet(schema.players) });
      }

      const roundIds = s.rounds.map((r) => r.id);
      await tx
        .delete(schema.rounds)
        .where(
          and(eq(schema.rounds.roomId, s.id), roundIds.length ? notInArray(schema.rounds.id, roundIds) : undefined),
        );
      if (s.rounds.length) {
        await tx
          .insert(schema.rounds)
          .values(
            s.rounds.map((r) => ({
              id: r.id,
              roomId: s.id,
              number: r.number,
              rankerId: r.rankerId,
              categoryId: r.categoryId,
              state: r.state,
              refreshCount: r.refreshCount,
              answerOrder: r.answerOrder,
              usedContentIds: r.usedContentIds,
              deadlineAt: toDate(r.deadlineAt),
              skipReason: r.skipReason,
              startedAt: new Date(r.startedAt),
            })),
          )
          .onConflictDoUpdate({ target: schema.rounds.id, set: excludedSet(schema.rounds) });

        const items = s.rounds.flatMap((r) =>
          r.items.map((i, position) => ({
            id: i.id,
            roundId: r.id,
            position,
            imageUrl: i.imageUrl,
            title: i.title,
            fact: i.fact,
            sourceUrl: i.sourceUrl,
            kind: i.kind,
            contentItemId: i.contentItemId,
            uploadId: i.uploadId,
          })),
        );
        const itemIds = items.map((i) => i.id);
        await tx
          .delete(schema.roundItems)
          .where(
            and(
              inArray(schema.roundItems.roundId, roundIds),
              itemIds.length ? notInArray(schema.roundItems.id, itemIds) : undefined,
            ),
          );
        if (items.length) {
          await tx
            .insert(schema.roundItems)
            .values(items)
            .onConflictDoUpdate({ target: schema.roundItems.id, set: excludedSet(schema.roundItems) });
        }

        const guessRows = s.rounds.flatMap((r) =>
          r.guesses.map((g) => ({
            id: g.id,
            roundId: r.id,
            playerId: g.playerId,
            shownOrder: g.shownOrder,
            guessOrder: g.order,
            status: g.status,
            disconnectedAt: toDate(g.disconnectedAt),
            score: g.score,
            submittedAt: toDate(g.submittedAt),
          })),
        );
        if (guessRows.length) {
          await tx
            .insert(schema.guesses)
            .values(guessRows)
            .onConflictDoUpdate({ target: schema.guesses.id, set: excludedSet(schema.guesses) });
        }
      }

      if (s.status === 'FINISHED' && s.finishedAt !== null) {
        const expiresAt = new Date(s.finishedAt + CUSTOM_IMAGE_RETENTION_MS);
        await tx
          .update(schema.uploads)
          .set({ expiresAt })
          .where(and(eq(schema.uploads.roomId, s.id), gt(schema.uploads.expiresAt, expiresAt)));
      }
    });
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.db.delete(schema.rooms).where(eq(schema.rooms.id, roomId));
  }

  async createUpload(u: UploadRecord): Promise<void> {
    await this.db.insert(schema.uploads).values({
      ...u,
      createdAt: new Date(u.createdAt),
      expiresAt: new Date(u.expiresAt),
    });
  }

  async getUpload(id: string): Promise<UploadRecord | null> {
    const [row] = await this.db.select().from(schema.uploads).where(eq(schema.uploads.id, id));
    return row ? fromUploadRow(row) : null;
  }

  async updateUpload(id: string, patch: Partial<Omit<UploadRecord, 'id'>>): Promise<void> {
    const { createdAt, expiresAt, ...rest } = patch;
    await this.db
      .update(schema.uploads)
      .set({
        ...rest,
        ...(createdAt !== undefined ? { createdAt: new Date(createdAt) } : {}),
        ...(expiresAt !== undefined ? { expiresAt: new Date(expiresAt) } : {}),
      })
      .where(eq(schema.uploads.id, id));
  }

  async deleteUpload(id: string): Promise<void> {
    await this.db.delete(schema.uploads).where(eq(schema.uploads.id, id));
  }

  async listExpiredUploads(now: number): Promise<UploadRecord[]> {
    const rows = await this.db.select().from(schema.uploads).where(lte(schema.uploads.expiresAt, new Date(now)));
    return rows.map(fromUploadRow);
  }

  // ---------- blobs (STORAGE_DRIVER=db) ----------

  async getBlob(key: string): Promise<Buffer | null> {
    const [row] = await this.db.select({ data: schema.blobs.data }).from(schema.blobs).where(eq(schema.blobs.key, key));
    return row?.data ?? null;
  }

  async putBlob(key: string, data: Buffer, mime: string): Promise<void> {
    await this.db
      .insert(schema.blobs)
      .values({ key, data, mime })
      .onConflictDoUpdate({ target: schema.blobs.key, set: { data, mime } });
  }

  async deleteBlob(key: string): Promise<void> {
    await this.db.delete(schema.blobs).where(eq(schema.blobs.key, key));
  }

  async close(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

/**
 * postgres.js sends unknown URL parameters to the server as settings, and the server rejects
 * `channel_binding` (Neon puts `channel_binding=require` in its connection strings).
 */
export function connectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('channel_binding')) return url;
    parsed.searchParams.delete('channel_binding');
    return parsed.toString();
  } catch {
    return url;
  }
}

function fromUploadRow(row: typeof schema.uploads.$inferSelect): UploadRecord {
  return { ...row, createdAt: row.createdAt.getTime(), expiresAt: row.expiresAt.getTime() };
}
