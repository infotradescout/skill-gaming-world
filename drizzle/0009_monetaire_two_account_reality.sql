DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."game_sessions" AS session
    JOIN public."competition_entries" AS entry
      ON entry."id" = session."competition_entry_id"
    JOIN public."competitions" AS competition
      ON competition."id" = entry."competition_id"
    WHERE EXISTS (
      SELECT 1
      FROM public."move_events" AS move
      WHERE move."game_session_id" = session."id"
        AND move."accepted" = true
        AND move."server_received_at" >= competition."closes_at"
    ) OR (
      session."status" IN ('COMPLETED', 'ABANDONED')
      AND (
        session."last_active_at" >= competition."closes_at"
        OR session."completed_at" >= competition."closes_at"
        OR session."abandoned_at" >= competition."closes_at"
        OR (
          session."activity_clock_snapshot" ->> 'status' = 'FINALIZED'
          AND session."activity_clock_snapshot" ->> 'lastServerEventMs' ~ '^[0-9]+$'
          AND pg_catalog.to_timestamp(
            (session."activity_clock_snapshot" ->> 'lastServerEventMs')::numeric / 1000
          ) >= competition."closes_at"
        )
      )
    ) OR EXISTS (
      SELECT 1
      FROM public."scores" AS score
      WHERE score."game_session_id" = session."id"
        AND score."computed_at" >= competition."closes_at"
    )
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade refuses ranked evidence at or after the competition cutoff'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('MONETAIRE_CONFIGURED_COMPETITION_V1')
);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."leaderboard_snapshots") THEN
    RAISE EXCEPTION 'Stage 2 upgrade refuses preexisting unverifiable leaderboard snapshots'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT validation."deal_id"
    FROM public."deal_validations" AS validation
    WHERE validation."status" = 'VERIFIED_SOLVABLE'
    GROUP BY validation."deal_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade permits at most one verified validation per deal'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT entry."eligibility_decision_id"
    FROM public."competition_entries" AS entry
    WHERE entry."eligibility_decision_id" IS NOT NULL
    GROUP BY entry."eligibility_decision_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade found a reused competition eligibility decision'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT session."competition_entry_id"
    FROM public."game_sessions" AS session
    WHERE session."competition_entry_id" IS NOT NULL
    GROUP BY session."competition_entry_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade found multiple sessions for one competition entry'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."game_sessions" AS session
    WHERE NOT (
      (
        session."session_mode" = 'PRACTICE'
        AND session."competition_entry_id" IS NULL
      ) OR (
        session."session_mode" = 'NONCASH_COMPETITION'
        AND session."competition_entry_id" IS NOT NULL
      )
    )
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade found inconsistent session mode and competition entry evidence'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."competition_entries" AS entry
    WHERE entry."eligibility_decision_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public."jurisdiction_decisions" AS decision
        WHERE decision."id" = entry."eligibility_decision_id"
          AND decision."user_id" = entry."user_id"
          AND decision."product_mode" = 'MONETAIRE_PLAY'
          AND decision."decision" = 'ALLOW'
      )
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade found invalid linked competition eligibility evidence'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."game_sessions" AS session
    WHERE session."status" = 'COMPLETED'
      AND NOT EXISTS (
        SELECT 1
        FROM public."scores" AS score
        WHERE score."game_session_id" = session."id"
          AND score."superseded_by_score_id" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade found a completed session without an active score'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."game_sessions" AS session
    JOIN public."ruleset_versions" AS ruleset
      ON ruleset."id" = session."ruleset_version_id"
    WHERE session."status" = 'ABANDONED'
      AND NOT EXISTS (
        SELECT 1
        FROM public."scores" AS score
        WHERE score."game_session_id" = session."id"
          AND score."superseded_by_score_id" IS NULL
      )
      AND (
        session."state_snapshot" ->> 'status' = 'ABANDONED'
        AND session."activity_clock_snapshot" ->> 'status' = 'FINALIZED'
        AND session."state_snapshot" ->> 'validMoveCount' ~ '^[0-9]+$'
        AND (session."state_snapshot" ->> 'validMoveCount')::numeric <= 2147483647
        AND session."activity_clock_snapshot" ->> 'accumulatedActiveMs' ~ '^[0-9]+$'
        AND (session."activity_clock_snapshot" ->> 'accumulatedActiveMs')::numeric <= 9223372036854775807
        AND session."activity_clock_snapshot" ->> 'lastServerEventMs' ~ '^[0-9]+$'
        AND pg_catalog.jsonb_typeof(ruleset."scoring" -> 'version') = 'string'
        AND pg_catalog.length(ruleset."scoring" ->> 'version') BETWEEN 1 AND 64
      ) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade found malformed abandoned session scoring evidence'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  proofless_record record;
  proofless_ids uuid[] := ARRAY[]::uuid[];
  repair_clock timestamptz := pg_catalog.clock_timestamp();
BEGIN
  FOR proofless_record IN
    SELECT competition."id"
    FROM public."competitions" AS competition
    JOIN public."ruleset_versions" AS ruleset
      ON ruleset."id" = competition."ruleset_version_id"
    JOIN public."game_definitions" AS definition
      ON definition."id" = ruleset."game_definition_id"
    WHERE definition."key" = 'MONETAIRE_SOLITAIRE'
      AND ruleset."version" = 'KLONDIKE_DRAW_THREE_V2'
      AND competition."status" IN ('PUBLISHED', 'OPEN')
      AND NOT EXISTS (
        SELECT 1
        FROM public."deal_validations" AS validation
        WHERE validation."deal_id" = competition."deal_id"
          AND validation."status" = 'VERIFIED_SOLVABLE'
          AND validation."evidence" ->> 'protocol' =
            'CURATED_SOLVABLE_REPLAY_V1'
      )
    ORDER BY competition."id"
    FOR UPDATE OF competition
  LOOP
    proofless_ids := pg_catalog.array_append(
      proofless_ids,
      proofless_record."id"
    );
  END LOOP;

  IF coalesce(pg_catalog.array_length(proofless_ids, 1), 0) > 1 THEN
    RAISE EXCEPTION 'Stage 2 upgrade found ambiguous active proofless V2 competitions'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."competition_entries" AS entry
    WHERE entry."competition_id" = ANY(proofless_ids)
  ) THEN
    RAISE EXCEPTION 'Stage 2 upgrade refuses to cancel an entered proofless V2 competition'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public."competitions" AS competition
  SET
    "status" = 'CANCELLED',
    "closed_at" = repair_clock,
    "updated_at" = repair_clock
  WHERE competition."id" = ANY(proofless_ids);
END;
$$;
--> statement-breakpoint
INSERT INTO public."scores" (
  "game_session_id",
  "completed",
  "valid_move_count",
  "verified_active_duration_ms",
  "scoring_version",
  "computed_at",
  "created_at"
)
SELECT
  session."id",
  false,
  (session."state_snapshot" ->> 'validMoveCount')::integer,
  (session."activity_clock_snapshot" ->> 'accumulatedActiveMs')::bigint,
  ruleset."scoring" ->> 'version',
  pg_catalog.to_timestamp(
    (session."activity_clock_snapshot" ->> 'lastServerEventMs')::numeric / 1000
  ),
  pg_catalog.to_timestamp(
    (session."activity_clock_snapshot" ->> 'lastServerEventMs')::numeric / 1000
  )
FROM public."game_sessions" AS session
JOIN public."ruleset_versions" AS ruleset
  ON ruleset."id" = session."ruleset_version_id"
WHERE session."status" = 'ABANDONED'
  AND NOT EXISTS (
    SELECT 1
    FROM public."scores" AS score
    WHERE score."game_session_id" = session."id"
      AND score."superseded_by_score_id" IS NULL
  )
ON CONFLICT ("game_session_id")
  WHERE "superseded_by_score_id" IS NULL
DO NOTHING;
--> statement-breakpoint
DROP INDEX IF EXISTS public."move_events_session_sequence_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "move_events_session_sequence_unique"
  ON public."move_events" ("game_session_id", "sequence")
  WHERE "accepted" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "deal_validations_verified_deal_unique"
  ON public."deal_validations" ("deal_id")
  WHERE "status" = 'VERIFIED_SOLVABLE';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."validate_monetaire_competition_entry_eligibility"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."eligibility_decision_id" IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public."jurisdiction_decisions" AS decision
    WHERE decision."id" = NEW."eligibility_decision_id"
      AND decision."user_id" = NEW."user_id"
      AND decision."product_mode" = 'MONETAIRE_PLAY'
      AND decision."decision" = 'ALLOW'
  ) THEN
    RAISE EXCEPTION 'competition entry requires an allowed Monetaire Play jurisdiction decision for the same user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "competition_entries_eligibility_allow"
BEFORE INSERT ON public."competition_entries"
FOR EACH ROW EXECUTE FUNCTION public."validate_monetaire_competition_entry_eligibility"();
--> statement-breakpoint
CREATE TRIGGER "jurisdiction_decisions_append_only"
BEFORE UPDATE OR DELETE ON public."jurisdiction_decisions"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();
--> statement-breakpoint
CREATE UNIQUE INDEX "competition_entries_eligibility_decision_unique"
  ON public."competition_entries" ("eligibility_decision_id")
  WHERE "eligibility_decision_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "game_sessions_competition_entry_unique"
  ON public."game_sessions" ("competition_entry_id")
  WHERE "competition_entry_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "game_sessions_terminal_status_idx"
  ON public."game_sessions" ("status")
  WHERE "status" IN ('COMPLETED', 'ABANDONED');
--> statement-breakpoint
ALTER TABLE public."game_sessions"
  ADD CONSTRAINT "game_sessions_mode_entry_consistent"
  CHECK (
    (
      "session_mode" = 'PRACTICE'
      AND "competition_entry_id" IS NULL
    ) OR (
      "session_mode" = 'NONCASH_COMPETITION'
      AND "competition_entry_id" IS NOT NULL
    )
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."protect_terminal_game_session"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('COMPLETED', 'ABANDONED') THEN
      RAISE EXCEPTION 'terminal game session history is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('COMPLETED', 'ABANDONED') THEN
    RAISE EXCEPTION 'terminal game session history is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
     AND NOT (
       OLD."status" = 'ACTIVE'
       AND NEW."status" IN ('COMPLETED', 'ABANDONED')
     ) THEN
    RAISE EXCEPTION 'invalid or backwards game session state transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "game_sessions_terminal_freeze"
BEFORE UPDATE OR DELETE ON public."game_sessions"
FOR EACH ROW EXECUTE FUNCTION public."protect_terminal_game_session"();
--> statement-breakpoint
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

  IF OLD."status" IN ('CLOSED', 'SETTLED', 'CANCELLED')
     AND NEW."closed_at" IS DISTINCT FROM OLD."closed_at" THEN
    RAISE EXCEPTION 'terminal competition record is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_snapshots_competition_unique"
  ON public."leaderboard_snapshots" ("competition_id");
--> statement-breakpoint
ALTER TABLE public."leaderboard_snapshots"
  ADD CONSTRAINT "leaderboard_snapshots_hash_sha256"
  CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
CREATE TRIGGER "leaderboard_snapshots_append_only"
BEFORE UPDATE OR DELETE ON public."leaderboard_snapshots"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();
