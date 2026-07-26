ALTER TABLE "game_sessions" ADD COLUMN "session_mode" varchar(32) DEFAULT 'PRACTICE' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "state_snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "activity_clock_snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "seed_ciphertext" text NOT NULL;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_mode_allowed" CHECK ("game_sessions"."session_mode" IN ('PRACTICE', 'NONCASH_COMPETITION'));