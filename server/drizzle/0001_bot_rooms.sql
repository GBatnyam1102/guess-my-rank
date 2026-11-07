ALTER TABLE "players" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "mode" text DEFAULT 'HUMANS' NOT NULL;