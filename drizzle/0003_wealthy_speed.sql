ALTER TABLE "self_exclusions" DROP CONSTRAINT "self_exclusions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sandbox_purchases" ALTER COLUMN "ledger_transaction_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "self_exclusions" ADD CONSTRAINT "self_exclusions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_window_valid" CHECK ("competitions"."closes_at" > "competitions"."opens_at");--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_initial_release_mode" CHECK ("competitions"."product_mode" = 'MONETAIRE_PLAY');--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_publication_before_open" CHECK ("competitions"."published_at" IS NULL OR "competitions"."published_at" < "competitions"."opens_at");--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_status_timestamps" CHECK ((
        "competitions"."status" = 'DRAFT'
        AND "competitions"."published_at" IS NULL
        AND "competitions"."closed_at" IS NULL
      ) OR (
        "competitions"."status" IN ('PUBLISHED', 'OPEN')
        AND "competitions"."published_at" IS NOT NULL
        AND "competitions"."closed_at" IS NULL
      ) OR (
        "competitions"."status" IN ('CLOSED', 'SETTLED', 'CANCELLED')
        AND "competitions"."published_at" IS NOT NULL
        AND "competitions"."closed_at" IS NOT NULL
        AND "competitions"."closed_at" >= "competitions"."published_at"
      ));--> statement-breakpoint
ALTER TABLE "deal_validations" ADD CONSTRAINT "deal_validations_terminal_timestamp" CHECK ("deal_validations"."status" = 'PENDING' OR "deal_validations"."validated_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "deal_validations" ADD CONSTRAINT "deal_validations_verified_evidence" CHECK ("deal_validations"."status" <> 'VERIFIED_SOLVABLE' OR (
        "deal_validations"."evidence_hash" ~ '^[0-9a-f]{64}$'
        AND "deal_validations"."evidence" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_commitment_sha256" CHECK ("deals"."seed_commitment" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_canonical_hash_sha256" CHECK ("deals"."canonical_deal_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_reveal_pair_consistent" CHECK (("deals"."revealed_seed" IS NULL) = ("deals"."revealed_at" IS NULL));--> statement-breakpoint
ALTER TABLE "feature_gates" ADD CONSTRAINT "initial_release_feature_gate_hold" CHECK (NOT "feature_gates"."enabled" OR (
        "feature_gates"."product_mode" = 'MONETAIRE_PLAY'
        AND "feature_gates"."key" IN (
          'mode.monetaire_play',
          'play_coin.earn',
          'play_coin.package.sandbox'
        )
      ));--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" ADD CONSTRAINT "initial_release_jurisdiction_mode_hold" CHECK (NOT "jurisdiction_rules"."enabled" OR "jurisdiction_rules"."product_mode" = 'MONETAIRE_PLAY');--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_sequence_positive" CHECK ("move_events"."sequence" > 0);--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_state_hashes_sha256" CHECK ("move_events"."state_hash_before" ~ '^[0-9a-f]{64}$'
        AND "move_events"."state_hash_after" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_rejection_consistent" CHECK ((
        "move_events"."accepted"
        AND "move_events"."rejection_code" IS NULL
      ) OR (
        NOT "move_events"."accepted"
        AND "move_events"."rejection_code" IS NOT NULL
        AND "move_events"."state_hash_after" = "move_events"."state_hash_before"
      ));--> statement-breakpoint
ALTER TABLE "play_coin_packages" ADD CONSTRAINT "play_coin_packages_units_positive" CHECK ("play_coin_packages"."play_coin_minor_units" > 0);--> statement-breakpoint
ALTER TABLE "play_coin_packages" ADD CONSTRAINT "play_coin_packages_sandbox_price_nonnegative" CHECK ("play_coin_packages"."sandbox_price_minor_usd" >= 0);--> statement-breakpoint
ALTER TABLE "sandbox_purchases" ADD CONSTRAINT "sandbox_purchases_provider_local_only" CHECK ("sandbox_purchases"."provider" = 'LOCAL_SANDBOX');--> statement-breakpoint
ALTER TABLE "sandbox_purchases" ADD CONSTRAINT "sandbox_purchases_status_simulated_only" CHECK ("sandbox_purchases"."status" = 'SIMULATED');--> statement-breakpoint
ALTER TABLE "sandbox_purchases" ADD CONSTRAINT "sandbox_purchases_never_charge_real_money" CHECK ("sandbox_purchases"."charged_real_money" = false);--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_values_nonnegative" CHECK ("scores"."valid_move_count" >= 0 AND "scores"."verified_active_duration_ms" >= 0);--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_not_self_superseded" CHECK ("scores"."superseded_by_score_id" IS NULL OR "scores"."superseded_by_score_id" <> "scores"."id");--> statement-breakpoint
ALTER TABLE "self_exclusions" ADD CONSTRAINT "self_exclusions_scope_allowed" CHECK ("self_exclusions"."scope" IN ('ALL_PRODUCTS', 'SKILL_GAMING_WORLD', 'CASINO'));--> statement-breakpoint
ALTER TABLE "self_exclusions" ADD CONSTRAINT "self_exclusions_window_valid" CHECK ((
        "self_exclusions"."permanent"
        AND "self_exclusions"."ends_at" IS NULL
      ) OR (
        NOT "self_exclusions"."permanent"
        AND "self_exclusions"."ends_at" IS NOT NULL
        AND "self_exclusions"."ends_at" > "self_exclusions"."starts_at"
      ));--> statement-breakpoint
ALTER TABLE "self_exclusions" ADD CONSTRAINT "self_exclusions_removal_policy_locked" CHECK ("self_exclusions"."removal_policy" = 'COMPLIANCE_REVIEW_ONLY');