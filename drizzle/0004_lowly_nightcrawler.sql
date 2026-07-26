ALTER TABLE "deal_validations" DROP CONSTRAINT "deal_validations_deal_id_deals_id_fk";
--> statement-breakpoint
ALTER TABLE "deal_validations" ADD CONSTRAINT "deal_validations_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."ledger_accounts" AS account
    JOIN public."ledgers" AS ledger ON ledger."id" = account."ledger_id"
    WHERE ledger."ledger_type" <> 'PLAY_COIN'
       OR ledger."status" <> 'ACTIVE'
    UNION ALL
    SELECT 1
    FROM public."ledger_transactions" AS txn
    JOIN public."ledgers" AS ledger ON ledger."id" = txn."ledger_id"
    WHERE ledger."ledger_type" <> 'PLAY_COIN'
       OR ledger."status" <> 'ACTIVE'
    UNION ALL
    SELECT 1
    FROM public."ledger_entries" AS entry
    JOIN public."ledgers" AS ledger ON ledger."id" = entry."ledger_id"
    WHERE ledger."ledger_type" <> 'PLAY_COIN'
       OR ledger."status" <> 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'disabled or cash ledger already contains operational records'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."ledger_transactions" AS txn
    LEFT JOIN public."ledger_entries" AS entry
      ON entry."transaction_id" = txn."id"
    GROUP BY txn."id"
    HAVING count(entry."id") = 0
       OR COALESCE(SUM(
         CASE
           WHEN entry."direction" = 'DEBIT' THEN entry."amount_minor"
           ELSE -entry."amount_minor"
         END
       ), 0) <> 0
  ) THEN
    RAISE EXCEPTION 'empty or unbalanced ledger transaction already exists'
      USING ERRCODE = '23514';
  END IF;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."enforce_active_play_coin_ledger"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_type public."ledger_type";
  target_status public."ledger_status";
BEGIN
  SELECT ledger."ledger_type", ledger."status"
  INTO target_type, target_status
  FROM public."ledgers" AS ledger
  WHERE ledger."id" = NEW."ledger_id"
  FOR SHARE OF ledger;

  IF NOT FOUND
     OR target_type IS DISTINCT FROM 'PLAY_COIN'
     OR target_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'ledger % is not an active PLAY_COIN ledger', NEW."ledger_id"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ledger_accounts_active_play_coin_only"
BEFORE INSERT ON public."ledger_accounts"
FOR EACH ROW EXECUTE FUNCTION public."enforce_active_play_coin_ledger"();--> statement-breakpoint
CREATE TRIGGER "ledger_transactions_active_play_coin_only"
BEFORE INSERT ON public."ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION public."enforce_active_play_coin_ledger"();--> statement-breakpoint
CREATE TRIGGER "ledger_entries_active_play_coin_only"
BEFORE INSERT ON public."ledger_entries"
FOR EACH ROW EXECUTE FUNCTION public."enforce_active_play_coin_ledger"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."protect_operational_ledger_state"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (
    NEW."ledger_type" IS DISTINCT FROM 'PLAY_COIN'
    OR NEW."status" IS DISTINCT FROM 'ACTIVE'
  ) AND (
    EXISTS (
      SELECT 1
      FROM public."ledger_accounts" AS account
      WHERE account."ledger_id" = OLD."id"
    )
    OR EXISTS (
      SELECT 1
      FROM public."ledger_transactions" AS txn
      WHERE txn."ledger_id" = OLD."id"
    )
    OR EXISTS (
      SELECT 1
      FROM public."ledger_entries" AS entry
      WHERE entry."ledger_id" = OLD."id"
    )
  ) THEN
    RAISE EXCEPTION 'operational ledger must remain ACTIVE PLAY_COIN'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "operational_ledgers_stay_active_play_coin"
BEFORE UPDATE OF "ledger_type", "status" ON public."ledgers"
FOR EACH ROW EXECUTE FUNCTION public."protect_operational_ledger_state"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."enforce_nonempty_balanced_ledger_transaction"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  entry_count bigint;
  net_amount numeric;
BEGIN
  SELECT
    count(*),
    COALESCE(SUM(
      CASE
        WHEN entry."direction" = 'DEBIT' THEN entry."amount_minor"
        ELSE -entry."amount_minor"
      END
    ), 0)
  INTO entry_count, net_amount
  FROM public."ledger_entries" AS entry
  WHERE entry."transaction_id" = NEW."id";

  IF entry_count = 0 OR net_amount <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % must contain balanced entries', NEW."id"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ledger_transaction_must_be_nonempty_and_balanced"
AFTER INSERT ON public."ledger_transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public."enforce_nonempty_balanced_ledger_transaction"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."validate_sandbox_purchase_ledger"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  linked_type public."ledger_type";
  linked_reference_type varchar(64);
  linked_reference_id varchar(128);
BEGIN
  SELECT
    txn."ledger_type",
    txn."reference_type",
    txn."reference_id"
  INTO linked_type, linked_reference_type, linked_reference_id
  FROM public."ledger_transactions" AS txn
  WHERE txn."id" = NEW."ledger_transaction_id";

  IF NOT FOUND
     OR linked_type IS DISTINCT FROM 'PLAY_COIN'
     OR linked_reference_type IS DISTINCT FROM 'SANDBOX_PURCHASE'
     OR linked_reference_id IS DISTINCT FROM NEW."id"::text THEN
    RAISE EXCEPTION 'sandbox purchase must reference its own PLAY_COIN SANDBOX_PURCHASE transaction'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sandbox_purchase_ledger_contract"
BEFORE INSERT ON public."sandbox_purchases"
FOR EACH ROW EXECUTE FUNCTION public."validate_sandbox_purchase_ledger"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."validate_competition_contract"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  deal_ruleset_id uuid;
  deal_immutable_at timestamptz;
  ruleset_immutable_at timestamptz;
BEGIN
  SELECT
    deal."ruleset_version_id",
    deal."immutable_at",
    ruleset."immutable_at"
  INTO deal_ruleset_id, deal_immutable_at, ruleset_immutable_at
  FROM public."deals" AS deal
  JOIN public."ruleset_versions" AS ruleset
    ON ruleset."id" = deal."ruleset_version_id"
  WHERE deal."id" = NEW."deal_id";

  IF NOT FOUND OR deal_ruleset_id IS DISTINCT FROM NEW."ruleset_version_id" THEN
    RAISE EXCEPTION 'competition deal and ruleset contract do not match'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" <> 'DRAFT' THEN
    IF deal_immutable_at IS NULL OR ruleset_immutable_at IS NULL THEN
      RAISE EXCEPTION 'published competition requires sealed deal and ruleset'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public."deal_validations" AS validation
      WHERE validation."deal_id" = NEW."deal_id"
        AND validation."status" = 'VERIFIED_SOLVABLE'
        AND validation."validated_at" IS NOT NULL
        AND validation."evidence_hash" ~ '^[0-9a-f]{64}$'
        AND validation."evidence" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'published competition requires verified-solvable evidence'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "competitions_contract_consistency"
BEFORE INSERT OR UPDATE ON public."competitions"
FOR EACH ROW EXECUTE FUNCTION public."validate_competition_contract"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."validate_competition_entry_contract"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  competition_deal_id uuid;
  competition_status public."competition_status";
  competition_opens_at timestamptz;
  competition_closes_at timestamptz;
BEGIN
  SELECT
    competition."deal_id",
    competition."status",
    competition."opens_at",
    competition."closes_at"
  INTO
    competition_deal_id,
    competition_status,
    competition_opens_at,
    competition_closes_at
  FROM public."competitions" AS competition
  WHERE competition."id" = NEW."competition_id";

  IF NOT FOUND OR competition_deal_id IS DISTINCT FROM NEW."deal_id" THEN
    RAISE EXCEPTION 'competition entry deal does not match the competition'
      USING ERRCODE = '23514';
  END IF;

  IF competition_status IS DISTINCT FROM 'OPEN'
     OR NEW."entered_at" < competition_opens_at
     OR NEW."entered_at" >= competition_closes_at THEN
    RAISE EXCEPTION 'competition entry is outside the open competition window'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "competition_entries_contract_consistency"
BEFORE INSERT ON public."competition_entries"
FOR EACH ROW EXECUTE FUNCTION public."validate_competition_entry_contract"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."validate_game_session_contract"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  deal_ruleset_id uuid;
  entry_user_id uuid;
  entry_deal_id uuid;
  competition_ruleset_id uuid;
BEGIN
  SELECT deal."ruleset_version_id"
  INTO deal_ruleset_id
  FROM public."deals" AS deal
  WHERE deal."id" = NEW."deal_id";

  IF NOT FOUND OR deal_ruleset_id IS DISTINCT FROM NEW."ruleset_version_id" THEN
    RAISE EXCEPTION 'game session deal and ruleset do not match'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."competition_entry_id" IS NOT NULL THEN
    SELECT
      entry."user_id",
      entry."deal_id",
      competition."ruleset_version_id"
    INTO entry_user_id, entry_deal_id, competition_ruleset_id
    FROM public."competition_entries" AS entry
    JOIN public."competitions" AS competition
      ON competition."id" = entry."competition_id"
    WHERE entry."id" = NEW."competition_entry_id";

    IF NOT FOUND
       OR entry_user_id IS DISTINCT FROM NEW."user_id"
       OR entry_deal_id IS DISTINCT FROM NEW."deal_id"
       OR competition_ruleset_id IS DISTINCT FROM NEW."ruleset_version_id" THEN
      RAISE EXCEPTION 'ranked game session does not match its entry contract'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "game_sessions_contract_consistency"
BEFORE INSERT OR UPDATE ON public."game_sessions"
FOR EACH ROW EXECUTE FUNCTION public."validate_game_session_contract"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."protect_published_competition"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'published competition history is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" <> 'DRAFT' AND (
    NEW."public_name" IS DISTINCT FROM OLD."public_name"
    OR NEW."product_mode" IS DISTINCT FROM OLD."product_mode"
    OR NEW."deal_id" IS DISTINCT FROM OLD."deal_id"
    OR NEW."ruleset_version_id" IS DISTINCT FROM OLD."ruleset_version_id"
    OR NEW."opens_at" IS DISTINCT FROM OLD."opens_at"
    OR NEW."closes_at" IS DISTINCT FROM OLD."closes_at"
    OR NEW."published_at" IS DISTINCT FROM OLD."published_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'published competition contract fields are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF (OLD."status" = 'DRAFT' AND NEW."status" NOT IN ('DRAFT', 'PUBLISHED'))
     OR (OLD."status" = 'PUBLISHED' AND NEW."status" NOT IN ('PUBLISHED', 'OPEN', 'CANCELLED'))
     OR (OLD."status" = 'OPEN' AND NEW."status" NOT IN ('OPEN', 'CLOSED', 'CANCELLED'))
     OR (OLD."status" = 'CLOSED' AND NEW."status" NOT IN ('CLOSED', 'SETTLED'))
     OR (OLD."status" IN ('SETTLED', 'CANCELLED') AND NEW."status" <> OLD."status") THEN
    RAISE EXCEPTION 'invalid or backwards competition state transition'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" IN ('SETTLED', 'CANCELLED')
     AND NEW."closed_at" IS DISTINCT FROM OLD."closed_at" THEN
    RAISE EXCEPTION 'terminal competition record is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "competitions_publication_freeze"
BEFORE UPDATE OR DELETE ON public."competitions"
FOR EACH ROW EXECUTE FUNCTION public."protect_published_competition"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."protect_ruleset_version"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  frozen boolean;
BEGIN
  frozen :=
    OLD."immutable_at" IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public."competitions" AS competition
      WHERE competition."ruleset_version_id" = OLD."id"
        AND competition."status" <> 'DRAFT'
    )
    OR EXISTS (
      SELECT 1
      FROM public."deals" AS deal
      WHERE deal."ruleset_version_id" = OLD."id"
        AND (
          deal."immutable_at" IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM public."deal_validations" AS validation
            WHERE validation."deal_id" = deal."id"
          )
        )
    );

  IF TG_OP = 'DELETE' THEN
    IF frozen THEN
      RAISE EXCEPTION 'sealed or published ruleset is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF frozen AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."game_definition_id" IS DISTINCT FROM OLD."game_definition_id"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."rules" IS DISTINCT FROM OLD."rules"
    OR NEW."scoring" IS DISTINCT FROM OLD."scoring"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR (
      OLD."immutable_at" IS NOT NULL
      AND NEW."immutable_at" IS DISTINCT FROM OLD."immutable_at"
    )
  ) THEN
    RAISE EXCEPTION 'sealed or published ruleset is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ruleset_versions_freeze"
BEFORE UPDATE OR DELETE ON public."ruleset_versions"
FOR EACH ROW EXECUTE FUNCTION public."protect_ruleset_version"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."protect_deal"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  frozen boolean;
  latest_close timestamptz;
BEGIN
  frozen :=
    OLD."immutable_at" IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public."deal_validations" AS validation
      WHERE validation."deal_id" = OLD."id"
    )
    OR EXISTS (
      SELECT 1
      FROM public."competitions" AS competition
      WHERE competition."deal_id" = OLD."id"
        AND competition."status" <> 'DRAFT'
    );

  IF TG_OP = 'DELETE' THEN
    IF frozen THEN
      RAISE EXCEPTION 'validated, sealed, or published deal is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."revealed_seed" IS NOT NULL AND (
    NEW."revealed_seed" IS DISTINCT FROM OLD."revealed_seed"
    OR NEW."revealed_at" IS DISTINCT FROM OLD."revealed_at"
  ) THEN
    RAISE EXCEPTION 'deal reveal is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."revealed_seed" IS NULL
     AND (
       NEW."revealed_seed" IS NOT NULL
       OR NEW."revealed_at" IS NOT NULL
     ) THEN
    IF NEW."revealed_seed" IS NULL OR NEW."revealed_at" IS NULL THEN
      RAISE EXCEPTION 'deal reveal seed and timestamp must be recorded together'
        USING ERRCODE = '23514';
    END IF;

    SELECT max(competition."closes_at")
    INTO latest_close
    FROM public."competitions" AS competition
    WHERE competition."deal_id" = OLD."id";

    IF latest_close IS NULL
       OR NEW."revealed_at" < latest_close
       OR NEW."revealed_at" > pg_catalog.clock_timestamp()
       OR EXISTS (
         SELECT 1
         FROM public."competitions" AS competition
         WHERE competition."deal_id" = OLD."id"
           AND competition."status" NOT IN ('CLOSED', 'SETTLED', 'CANCELLED')
       ) THEN
      RAISE EXCEPTION 'deal cannot be revealed before every competition closes'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF frozen AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."ruleset_version_id" IS DISTINCT FROM OLD."ruleset_version_id"
    OR NEW."seed_ciphertext" IS DISTINCT FROM OLD."seed_ciphertext"
    OR NEW."seed_commitment" IS DISTINCT FROM OLD."seed_commitment"
    OR NEW."canonical_deal_hash" IS DISTINCT FROM OLD."canonical_deal_hash"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR (
      OLD."immutable_at" IS NOT NULL
      AND NEW."immutable_at" IS DISTINCT FROM OLD."immutable_at"
    )
  ) THEN
    RAISE EXCEPTION 'validated, sealed, or published deal is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "deals_freeze"
BEFORE UPDATE OR DELETE ON public."deals"
FOR EACH ROW EXECUTE FUNCTION public."protect_deal"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."reject_immutable_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION '% history is append-only', TG_TABLE_NAME
    USING ERRCODE = '23514';
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "deal_validations_append_only"
BEFORE UPDATE OR DELETE ON public."deal_validations"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "move_events_append_only"
BEFORE UPDATE OR DELETE ON public."move_events"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "scores_append_only"
BEFORE UPDATE OR DELETE ON public."scores"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON public."audit_events"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "admin_actions_append_only"
BEFORE UPDATE OR DELETE ON public."admin_actions"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "self_exclusions_append_only"
BEFORE UPDATE OR DELETE ON public."self_exclusions"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "competition_entries_append_only"
BEFORE UPDATE OR DELETE ON public."competition_entries"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "sandbox_purchases_append_only"
BEFORE UPDATE OR DELETE ON public."sandbox_purchases"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "ledger_accounts_identity_immutable"
BEFORE UPDATE OR DELETE ON public."ledger_accounts"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();
