import { boolean, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    inviteToken: text('invite_token').notNull(),
    hostPlayerId: uuid('host_player_id').notNull(),
    status: text('status', { enum: ['LOBBY', 'IN_GAME', 'FINISHED'] }).notNull(),
    mode: text('mode', { enum: ['HUMANS', 'BOTS'] }).notNull().default('HUMANS'),
    maxPlayers: integer('max_players').notNull(),
    imageCount: integer('image_count').notNull(),
    imageSource: text('image_source', { enum: ['RANDOM', 'CUSTOM'] }).notNull(),
    /** '1' | '3' | '5' | 'EACH' */
    roundsMode: text('rounds_mode').notNull(),
    totalRounds: integer('total_rounds').notNull(),
    currentRoundId: uuid('current_round_id'),
    endReason: text('end_reason'),
    version: integer('version').notNull(),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    finishedAt: ts('finished_at'),
  },
  (t) => [uniqueIndex('rooms_code_uq').on(t.code), uniqueIndex('rooms_invite_uq').on(t.inviteToken)],
);

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    isBot: boolean('is_bot').notNull().default(false),
    sessionTokenHash: text('session_token_hash').notNull(),
    isHost: boolean('is_host').notNull(),
    connection: text('connection', { enum: ['ONLINE', 'OFFLINE'] }).notNull(),
    disconnectedAt: ts('disconnected_at'),
    rankedInCycle: boolean('ranked_in_cycle').notNull(),
    totalScore: integer('total_score').notNull(),
    joinedAt: ts('joined_at').notNull(),
    leftAt: ts('left_at'),
  },
  (t) => [index('players_room_idx').on(t.roomId)],
);

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    rankerId: uuid('ranker_id').notNull(),
    categoryId: text('category_id'),
    state: text('state', { enum: ['CATEGORY', 'RANKING', 'GUESSING', 'REVEAL', 'SKIPPED'] }).notNull(),
    refreshCount: integer('refresh_count').notNull(),
    answerOrder: jsonb('answer_order').$type<string[] | null>(),
    usedContentIds: jsonb('used_content_ids').$type<string[]>().notNull(),
    /** Every timer is a stored deadline so a restarted server can resume it (NFR-08). */
    deadlineAt: ts('deadline_at'),
    skipReason: text('skip_reason'),
    startedAt: ts('started_at').notNull(),
  },
  (t) => [index('rounds_room_idx').on(t.roomId)],
);

export const roundItems = pgTable(
  'round_items',
  {
    id: uuid('id').primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    imageUrl: text('image_url').notNull(),
    title: text('title').notNull(),
    fact: text('fact'),
    sourceUrl: text('source_url'),
    kind: text('kind', { enum: ['RANDOM', 'CUSTOM'] }).notNull(),
    contentItemId: text('content_item_id'),
    uploadId: uuid('upload_id'),
  },
  (t) => [index('round_items_round_idx').on(t.roundId)],
);

export const guesses = pgTable(
  'guesses',
  {
    id: uuid('id').primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id').notNull(),
    shownOrder: jsonb('shown_order').$type<string[]>().notNull(),
    guessOrder: jsonb('guess_order').$type<string[] | null>(),
    status: text('status', { enum: ['GUESSING', 'DISCONNECTED', 'SUBMITTED', 'SKIPPED'] }).notNull(),
    disconnectedAt: ts('disconnected_at'),
    score: integer('score').notNull(),
    submittedAt: ts('submitted_at'),
  },
  (t) => [uniqueIndex('guesses_round_player_uq').on(t.roundId, t.playerId)],
);

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const categoryItems = pgTable(
  'category_items',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    title: text('title').notNull(),
    fact: text('fact'),
    sourceUrl: text('source_url'),
    license: text('license'),
    credit: text('credit'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [index('category_items_category_idx').on(t.categoryId)],
);

/** Custom images. No FK to rooms so a row outlives its room until the file is deleted (FR-62). */
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey(),
    roomId: uuid('room_id').notNull(),
    roundId: uuid('round_id').notNull(),
    playerId: uuid('player_id').notNull(),
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    status: text('status', { enum: ['PENDING', 'READY'] }).notNull(),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [index('uploads_expires_idx').on(t.expiresAt), index('uploads_room_idx').on(t.roomId)],
);

/** Image bytes for STORAGE_DRIVER=db (hosts without a persistent disk). Keys match uploads.storage_key. */
export const blobs = pgTable('blobs', {
  key: text('key').primaryKey(),
  mime: text('mime').notNull(),
  data: bytea('data').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});
