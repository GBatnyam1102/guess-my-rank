CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_items" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"image_url" text NOT NULL,
	"title" text NOT NULL,
	"fact" text,
	"source_url" text,
	"license" text,
	"credit" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guesses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"round_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"shown_order" jsonb NOT NULL,
	"guess_order" jsonb,
	"status" text NOT NULL,
	"disconnected_at" timestamp with time zone,
	"score" integer NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"session_token_hash" text NOT NULL,
	"is_host" boolean NOT NULL,
	"connection" text NOT NULL,
	"disconnected_at" timestamp with time zone,
	"ranked_in_cycle" boolean NOT NULL,
	"total_score" integer NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"invite_token" text NOT NULL,
	"host_player_id" uuid NOT NULL,
	"status" text NOT NULL,
	"max_players" integer NOT NULL,
	"image_count" integer NOT NULL,
	"image_source" text NOT NULL,
	"rounds_mode" text NOT NULL,
	"total_rounds" integer NOT NULL,
	"current_round_id" uuid,
	"end_reason" text,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "round_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"round_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"image_url" text NOT NULL,
	"title" text NOT NULL,
	"fact" text,
	"source_url" text,
	"kind" text NOT NULL,
	"content_item_id" text,
	"upload_id" uuid
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"ranker_id" uuid NOT NULL,
	"category_id" text,
	"state" text NOT NULL,
	"refresh_count" integer NOT NULL,
	"answer_order" jsonb,
	"used_content_ids" jsonb NOT NULL,
	"deadline_at" timestamp with time zone,
	"skip_reason" text,
	"started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_items" ADD CONSTRAINT "category_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_items" ADD CONSTRAINT "round_items_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_items_category_idx" ON "category_items" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guesses_round_player_uq" ON "guesses" USING btree ("round_id","player_id");--> statement-breakpoint
CREATE INDEX "players_room_idx" ON "players" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_uq" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_invite_uq" ON "rooms" USING btree ("invite_token");--> statement-breakpoint
CREATE INDEX "round_items_round_idx" ON "round_items" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "rounds_room_idx" ON "rounds" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "uploads_expires_idx" ON "uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "uploads_room_idx" ON "uploads" USING btree ("room_id");