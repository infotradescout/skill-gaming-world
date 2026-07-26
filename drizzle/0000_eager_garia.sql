CREATE TYPE "public"."admin_role" AS ENUM('SUPPORT', 'FRAUD_REVIEW', 'CONTENT_ADMIN', 'FINANCE_AUDITOR', 'COMPLIANCE_ADMIN', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."competition_status" AS ENUM('DRAFT', 'PUBLISHED', 'OPEN', 'CLOSED', 'SETTLED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."eligibility_decision" AS ENUM('ALLOW', 'DENY', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."game_session_status" AS ENUM('ACTIVE', 'COMPLETED', 'ABANDONED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('PLAY_COIN', 'SKILL_PRIZE_USD', 'CASINO_CASH_USD');--> statement-breakpoint
CREATE TYPE "public"."product_mode" AS ENUM('MONETAIRE_PLAY', 'MONETAIRE_PRIZE', 'SOCIAL_CASINO', 'REAL_MONEY_CASINO');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'COOLDOWN', 'SELF_EXCLUDED', 'CLOSED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."deal_validation_status" AS ENUM('PENDING', 'VERIFIED_SOLVABLE', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('NOT_STARTED', 'PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(96) NOT NULL,
	"title" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"role_used" "admin_role" NOT NULL,
	"action_type" varchar(96) NOT NULL,
	"target_type" varchar(96) NOT NULL,
	"target_id" varchar(128) NOT NULL,
	"reason" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_session_id" uuid,
	"subject" varchar(160) NOT NULL,
	"statement" text NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(96) NOT NULL,
	"actor_type" varchar(32) NOT NULL,
	"actor_id" varchar(128) NOT NULL,
	"subject_type" varchar(96) NOT NULL,
	"subject_id" varchar(128) NOT NULL,
	"reason" text,
	"request_id" varchar(128) NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb,
	"previous_event_hash" varchar(64),
	"event_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "casino_eligibilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "verification_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"jurisdiction_code" varchar(16),
	"aml_status" "verification_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"self_exclusion_clear" boolean DEFAULT false NOT NULL,
	"rules_version" varchar(64),
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"eligibility_decision_id" uuid,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_name" varchar(160) NOT NULL,
	"product_mode" "product_mode" DEFAULT 'MONETAIRE_PLAY' NOT NULL,
	"status" "competition_status" DEFAULT 'DRAFT' NOT NULL,
	"deal_id" uuid NOT NULL,
	"ruleset_version_id" uuid NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"validator_key" varchar(96) NOT NULL,
	"validator_version" varchar(64) NOT NULL,
	"status" "deal_validation_status" NOT NULL,
	"evidence_hash" varchar(64),
	"evidence" jsonb,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ruleset_version_id" uuid NOT NULL,
	"seed_ciphertext" text NOT NULL,
	"seed_commitment" varchar(64) NOT NULL,
	"canonical_deal_hash" varchar(64) NOT NULL,
	"revealed_seed" text,
	"revealed_at" timestamp with time zone,
	"immutable_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fingerprint_hash" varchar(128) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"risk_metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "feature_gates" (
	"key" varchar(96) PRIMARY KEY NOT NULL,
	"product_mode" "product_mode" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"changed_by" varchar(128),
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"game_session_id" uuid,
	"flag_type" varchar(96) NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fraud_flag_id" uuid NOT NULL,
	"reviewer_user_id" uuid,
	"decision" varchar(64) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"public_name" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"competition_entry_id" uuid,
	"deal_id" uuid NOT NULL,
	"ruleset_version_id" uuid NOT NULL,
	"status" "game_session_status" DEFAULT 'ACTIVE' NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_duration_ms" bigint DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_reference_hash" varchar(128),
	"status" "verification_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"age_confirmed" boolean DEFAULT false NOT NULL,
	"identity_confirmed" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdiction_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"product_mode" "product_mode" NOT NULL,
	"decision" "eligibility_decision" NOT NULL,
	"jurisdiction_code" varchar(16),
	"rule_version" varchar(64) NOT NULL,
	"location_evidence_status" "verification_status" NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdiction_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_code" varchar(16) NOT NULL,
	"product_mode" "product_mode" NOT NULL,
	"version" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"minimum_age" integer,
	"requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone,
	"approved_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"scoring_version" varchar(64) NOT NULL,
	"standings" jsonb NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"user_id" uuid,
	"account_code" varchar(96) NOT NULL,
	"currency" "ledger_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "ledger_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"reference_type" varchar(64) NOT NULL,
	"reference_id" varchar(128) NOT NULL,
	"reason" text NOT NULL,
	"actor_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_type" "ledger_type" NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledgers_ledger_type_unique" UNIQUE("ledger_type")
);
--> statement-breakpoint
CREATE TABLE "move_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"move_type" varchar(64) NOT NULL,
	"move_payload" jsonb NOT NULL,
	"state_hash_before" varchar(64) NOT NULL,
	"state_hash_after" varchar(64) NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted" boolean NOT NULL,
	"rejection_code" varchar(96),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_coin_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_key" varchar(64) NOT NULL,
	"label" varchar(96) NOT NULL,
	"play_coin_minor_units" bigint NOT NULL,
	"sandbox_price_minor_usd" bigint NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_coin_packages_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "responsible_gaming_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"limit_type" varchar(64) NOT NULL,
	"integer_value" bigint,
	"interval_minutes" integer,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruleset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_definition_id" uuid NOT NULL,
	"version" varchar(64) NOT NULL,
	"rules" jsonb NOT NULL,
	"scoring" jsonb NOT NULL,
	"immutable_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"play_coin_package_id" uuid NOT NULL,
	"provider" varchar(64) DEFAULT 'LOCAL_SANDBOX' NOT NULL,
	"provider_reference" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'SIMULATED' NOT NULL,
	"charged_real_money" boolean DEFAULT false NOT NULL,
	"ledger_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"completed" boolean NOT NULL,
	"valid_move_count" integer NOT NULL,
	"verified_active_duration_ms" bigint NOT NULL,
	"scoring_version" varchar(64) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by_score_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "self_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" varchar(64) NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"permanent" boolean DEFAULT false NOT NULL,
	"removal_policy" varchar(96) DEFAULT 'COMPLIANCE_REVIEW_ONLY' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_prize_eligibilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "verification_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"jurisdiction_code" varchar(16),
	"rules_version" varchar(64),
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_key" varchar(96) NOT NULL,
	"version" varchar(64) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"evidence" jsonb NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "user_admin_roles" (
	"user_id" uuid NOT NULL,
	"role" "admin_role" NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_admin_roles_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"locale" varchar(16) DEFAULT 'en-US' NOT NULL,
	"declared_residence" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_terms_acceptances" (
	"user_id" uuid NOT NULL,
	"terms_version_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" varchar(128) NOT NULL,
	CONSTRAINT "user_terms_acceptances_pk" PRIMARY KEY("user_id","terms_version_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casino_eligibilities" ADD CONSTRAINT "casino_eligibilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_eligibility_decision_id_jurisdiction_decisions_id_fk" FOREIGN KEY ("eligibility_decision_id") REFERENCES "public"."jurisdiction_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_ruleset_version_id_ruleset_versions_id_fk" FOREIGN KEY ("ruleset_version_id") REFERENCES "public"."ruleset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_validations" ADD CONSTRAINT "deal_validations_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_ruleset_version_id_ruleset_versions_id_fk" FOREIGN KEY ("ruleset_version_id") REFERENCES "public"."ruleset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_records" ADD CONSTRAINT "device_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_reviews" ADD CONSTRAINT "fraud_reviews_fraud_flag_id_fraud_flags_id_fk" FOREIGN KEY ("fraud_flag_id") REFERENCES "public"."fraud_flags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_reviews" ADD CONSTRAINT "fraud_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_competition_entry_id_competition_entries_id_fk" FOREIGN KEY ("competition_entry_id") REFERENCES "public"."competition_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_ruleset_version_id_ruleset_versions_id_fk" FOREIGN KEY ("ruleset_version_id") REFERENCES "public"."ruleset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_decisions" ADD CONSTRAINT "jurisdiction_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsible_gaming_limits" ADD CONSTRAINT "responsible_gaming_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleset_versions" ADD CONSTRAINT "ruleset_versions_game_definition_id_game_definitions_id_fk" FOREIGN KEY ("game_definition_id") REFERENCES "public"."game_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_purchases" ADD CONSTRAINT "sandbox_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_purchases" ADD CONSTRAINT "sandbox_purchases_play_coin_package_id_play_coin_packages_id_fk" FOREIGN KEY ("play_coin_package_id") REFERENCES "public"."play_coin_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_purchases" ADD CONSTRAINT "sandbox_purchases_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_exclusions" ADD CONSTRAINT "self_exclusions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prize_eligibilities" ADD CONSTRAINT "skill_prize_eligibilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_admin_roles" ADD CONSTRAINT "user_admin_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_admin_roles" ADD CONSTRAINT "user_admin_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_terms_acceptances" ADD CONSTRAINT "user_terms_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_terms_acceptances" ADD CONSTRAINT "user_terms_acceptances_terms_version_id_terms_versions_id_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."terms_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_actions_actor_idx" ON "admin_actions" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "appeals_user_idx" ON "appeals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_event_hash_unique" ON "audit_events" USING btree ("event_hash");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "casino_eligibility_user_idx" ON "casino_eligibilities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_entries_user_unique" ON "competition_entries" USING btree ("competition_id","user_id");--> statement-breakpoint
CREATE INDEX "competitions_status_idx" ON "competitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deal_validations_deal_idx" ON "deal_validations" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_commitment_unique" ON "deals" USING btree ("seed_commitment");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_canonical_hash_unique" ON "deals" USING btree ("canonical_deal_hash");--> statement-breakpoint
CREATE INDEX "device_records_user_idx" ON "device_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feature_gates_product_idx" ON "feature_gates" USING btree ("product_mode");--> statement-breakpoint
CREATE INDEX "fraud_flags_user_idx" ON "fraud_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_sessions_user_idx" ON "game_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_sessions_competition_entry_idx" ON "game_sessions" USING btree ("competition_entry_id");--> statement-breakpoint
CREATE INDEX "identity_verifications_user_idx" ON "identity_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdiction_decisions_request_unique" ON "jurisdiction_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "jurisdiction_decisions_user_idx" ON "jurisdiction_decisions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdiction_rule_version_unique" ON "jurisdiction_rules" USING btree ("jurisdiction_code","product_mode","version");--> statement-breakpoint
CREATE INDEX "leaderboard_snapshots_competition_idx" ON "leaderboard_snapshots" USING btree ("competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_unique" ON "ledger_accounts" USING btree ("ledger_id","account_code");--> statement-breakpoint
CREATE INDEX "ledger_accounts_user_idx" ON "ledger_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_idempotency_unique" ON "ledger_transactions" USING btree ("ledger_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "move_events_session_sequence_unique" ON "move_events" USING btree ("game_session_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "move_events_session_idempotency_unique" ON "move_events" USING btree ("game_session_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "responsible_gaming_limits_user_idx" ON "responsible_gaming_limits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ruleset_versions_game_version_unique" ON "ruleset_versions" USING btree ("game_definition_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "sandbox_purchases_idempotency_unique" ON "sandbox_purchases" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_active_session_unique" ON "scores" USING btree ("game_session_id") WHERE superseded_by_score_id IS NULL;--> statement-breakpoint
CREATE INDEX "self_exclusions_user_idx" ON "self_exclusions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_prize_eligibility_user_idx" ON "skill_prize_eligibilities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_versions_document_unique" ON "terms_versions" USING btree ("document_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");