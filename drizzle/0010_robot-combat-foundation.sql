CREATE TYPE "public"."robot_combat_match_phase" AS ENUM('WAITING_FOR_OPPONENT', 'READY_CHECK', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISCONNECTED');--> statement-breakpoint
CREATE TABLE "robot_combat_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"build_key" varchar(64) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"latest_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "robot_combat_builds_revision_nonnegative" CHECK ("robot_combat_builds"."latest_revision" >= 0)
);--> statement-breakpoint
CREATE TABLE "robot_combat_build_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"blueprint_hash" varchar(64) NOT NULL,
	"blueprint" jsonb NOT NULL,
	"inspection" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "robot_combat_build_revisions_revision_positive" CHECK ("robot_combat_build_revisions"."revision" > 0),
	CONSTRAINT "robot_combat_build_revisions_hash_sha256" CHECK ("robot_combat_build_revisions"."blueprint_hash" ~ '^[0-9a-f]{64}$')
);--> statement-breakpoint
CREATE TABLE "robot_combat_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arena_key" varchar(96) NOT NULL,
	"ruleset_version" varchar(64) NOT NULL,
	"phase" "robot_combat_match_phase" DEFAULT 'WAITING_FOR_OPPONENT' NOT NULL,
	"player_a_id" uuid NOT NULL,
	"player_b_id" uuid,
	"state_snapshot" jsonb NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	"terminal_reason" varchar(96),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "robot_combat_matches_sequence_positive" CHECK ("robot_combat_matches"."next_sequence" > 0),
	CONSTRAINT "robot_combat_matches_players_distinct" CHECK ("robot_combat_matches"."player_b_id" IS NULL OR "robot_combat_matches"."player_a_id" <> "robot_combat_matches"."player_b_id")
);--> statement-breakpoint
CREATE TABLE "robot_combat_match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"action_id" varchar(128) NOT NULL,
	"player_id" uuid,
	"command_type" varchar(48) NOT NULL,
	"command_payload" jsonb NOT NULL,
	"state_hash_before" varchar(64) NOT NULL,
	"state_hash_after" varchar(64) NOT NULL,
	"accepted" boolean NOT NULL,
	"rejection_code" varchar(96),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "robot_combat_match_events_sequence_positive" CHECK ("robot_combat_match_events"."sequence" > 0),
	CONSTRAINT "robot_combat_match_events_hash_sha256" CHECK ("robot_combat_match_events"."state_hash_before" ~ '^[0-9a-f]{64}$' AND "robot_combat_match_events"."state_hash_after" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "robot_combat_match_events_rejection_consistent" CHECK (("robot_combat_match_events"."accepted" AND "robot_combat_match_events"."rejection_code" IS NULL) OR (NOT "robot_combat_match_events"."accepted" AND "robot_combat_match_events"."rejection_code" IS NOT NULL AND "robot_combat_match_events"."state_hash_after" = "robot_combat_match_events"."state_hash_before"))
);--> statement-breakpoint
ALTER TABLE "robot_combat_builds" ADD CONSTRAINT "robot_combat_builds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_combat_build_revisions" ADD CONSTRAINT "robot_combat_build_revisions_build_id_robot_combat_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."robot_combat_builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_combat_build_revisions" ADD CONSTRAINT "robot_combat_build_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_combat_matches" ADD CONSTRAINT "robot_combat_matches_player_a_id_users_id_fk" FOREIGN KEY ("player_a_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_combat_matches" ADD CONSTRAINT "robot_combat_matches_player_b_id_users_id_fk" FOREIGN KEY ("player_b_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_combat_match_events" ADD CONSTRAINT "robot_combat_match_events_match_id_robot_combat_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."robot_combat_matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_combat_match_events" ADD CONSTRAINT "robot_combat_match_events_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "robot_combat_builds_user_key_unique" ON "robot_combat_builds" USING btree ("user_id","build_key");--> statement-breakpoint
CREATE INDEX "robot_combat_builds_user_idx" ON "robot_combat_builds" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "robot_combat_build_revisions_build_revision_unique" ON "robot_combat_build_revisions" USING btree ("build_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "robot_combat_build_revisions_hash_unique" ON "robot_combat_build_revisions" USING btree ("build_id","blueprint_hash");--> statement-breakpoint
CREATE INDEX "robot_combat_build_revisions_user_idx" ON "robot_combat_build_revisions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "robot_combat_matches_phase_idx" ON "robot_combat_matches" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "robot_combat_matches_player_a_idx" ON "robot_combat_matches" USING btree ("player_a_id");--> statement-breakpoint
CREATE INDEX "robot_combat_matches_player_b_idx" ON "robot_combat_matches" USING btree ("player_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "robot_combat_match_events_match_sequence_unique" ON "robot_combat_match_events" USING btree ("match_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "robot_combat_match_events_match_action_unique" ON "robot_combat_match_events" USING btree ("match_id","action_id");--> statement-breakpoint
CREATE INDEX "robot_combat_match_events_match_idx" ON "robot_combat_match_events" USING btree ("match_id");
