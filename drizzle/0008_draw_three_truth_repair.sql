DO $$
DECLARE
  active_mistake_count integer;
  entered_mistake_count integer;
BEGIN
  SELECT count(*)::integer
  INTO active_mistake_count
  FROM public."competitions" AS competition
  JOIN public."ruleset_versions" AS ruleset
    ON ruleset."id" = competition."ruleset_version_id"
  JOIN public."game_definitions" AS definition
    ON definition."id" = ruleset."game_definition_id"
  WHERE definition."key" = 'MONETAIRE_SOLITAIRE'
    AND ruleset."version" = 'KLONDIKE_DRAW_THREE_V1'
    AND ruleset."rules" ->> 'draw' = '1'
    AND competition."status" IN ('PUBLISHED', 'OPEN');

  SELECT count(*)::integer
  INTO entered_mistake_count
  FROM public."competition_entries" AS entry
  JOIN public."competitions" AS competition
    ON competition."id" = entry."competition_id"
  JOIN public."ruleset_versions" AS ruleset
    ON ruleset."id" = competition."ruleset_version_id"
  JOIN public."game_definitions" AS definition
    ON definition."id" = ruleset."game_definition_id"
  WHERE definition."key" = 'MONETAIRE_SOLITAIRE'
    AND ruleset."version" = 'KLONDIKE_DRAW_THREE_V1'
    AND ruleset."rules" ->> 'draw' = '1'
    AND competition."status" IN ('PUBLISHED', 'OPEN');

  IF active_mistake_count > 1 THEN
    RAISE EXCEPTION 'Draw 3 truth repair requires exactly zero or one active mistaken competition';
  END IF;
  IF entered_mistake_count > 0 THEN
    RAISE EXCEPTION 'Draw 3 truth repair refuses to cancel a competition with player entries';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TABLE public."ruleset_supersessions" (
  "superseded_ruleset_version_id" uuid PRIMARY KEY NOT NULL,
  "successor_ruleset_version_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ruleset_supersessions_distinct_versions" CHECK (
    "superseded_ruleset_version_id" <> "successor_ruleset_version_id"
  )
);
--> statement-breakpoint
ALTER TABLE public."ruleset_supersessions"
  ADD CONSTRAINT "ruleset_supersessions_old_ruleset_fk"
  FOREIGN KEY ("superseded_ruleset_version_id")
  REFERENCES public."ruleset_versions"("id")
  ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE public."ruleset_supersessions"
  ADD CONSTRAINT "ruleset_supersessions_successor_ruleset_fk"
  FOREIGN KEY ("successor_ruleset_version_id")
  REFERENCES public."ruleset_versions"("id")
  ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "ruleset_supersessions_successor_idx"
  ON public."ruleset_supersessions" ("successor_ruleset_version_id");
--> statement-breakpoint
CREATE TRIGGER "ruleset_supersessions_append_only"
BEFORE UPDATE OR DELETE ON public."ruleset_supersessions"
FOR EACH ROW EXECUTE FUNCTION public."reject_immutable_history_mutation"();
--> statement-breakpoint
INSERT INTO public."game_definitions" ("key", "public_name", "status")
VALUES ('MONETAIRE_SOLITAIRE', 'Monetaire', 'ACTIVE')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO public."ruleset_versions" (
  "game_definition_id",
  "version",
  "rules",
  "scoring",
  "immutable_at"
)
SELECT
  definition."id",
  'KLONDIKE_DRAW_THREE_V2',
  '{"draw":3,"redeals":"unlimited","valuablePrize":false}'::jsonb,
  '{"version":"MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1"}'::jsonb,
  pg_catalog.clock_timestamp()
FROM public."game_definitions" AS definition
WHERE definition."key" = 'MONETAIRE_SOLITAIRE'
ON CONFLICT ("game_definition_id", "version") DO NOTHING;
--> statement-breakpoint
INSERT INTO public."ruleset_supersessions" (
  "superseded_ruleset_version_id",
  "successor_ruleset_version_id",
  "reason"
)
SELECT
  old_ruleset."id",
  successor_ruleset."id",
  'Published Draw 3 metadata recorded draw: 1; preserve V1 and move all new play to V2.'
FROM public."ruleset_versions" AS old_ruleset
JOIN public."ruleset_versions" AS successor_ruleset
  ON successor_ruleset."game_definition_id" = old_ruleset."game_definition_id"
JOIN public."game_definitions" AS definition
  ON definition."id" = old_ruleset."game_definition_id"
WHERE definition."key" = 'MONETAIRE_SOLITAIRE'
  AND old_ruleset."version" = 'KLONDIKE_DRAW_THREE_V1'
  AND old_ruleset."rules" ->> 'draw' = '1'
  AND successor_ruleset."version" = 'KLONDIKE_DRAW_THREE_V2'
ON CONFLICT ("superseded_ruleset_version_id") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public."reject_superseded_ruleset_publication"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."ruleset_supersessions" AS supersession
    WHERE supersession."superseded_ruleset_version_id" = NEW."ruleset_version_id"
  ) AND (
    (TG_OP = 'INSERT' AND NEW."status" <> 'DRAFT')
    OR (
      TG_OP = 'UPDATE'
      AND OLD."status" = 'DRAFT'
      AND NEW."status" <> 'DRAFT'
    )
  ) THEN
    RAISE EXCEPTION 'superseded ruleset cannot publish a new competition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "competitions_superseded_ruleset_guard"
BEFORE INSERT OR UPDATE ON public."competitions"
FOR EACH ROW EXECUTE FUNCTION public."reject_superseded_ruleset_publication"();
--> statement-breakpoint
UPDATE public."competitions" AS competition
SET
  "status" = 'CANCELLED',
  "closed_at" = pg_catalog.clock_timestamp(),
  "updated_at" = pg_catalog.clock_timestamp()
FROM public."ruleset_versions" AS ruleset
JOIN public."game_definitions" AS definition
  ON definition."id" = ruleset."game_definition_id"
WHERE competition."ruleset_version_id" = ruleset."id"
  AND definition."key" = 'MONETAIRE_SOLITAIRE'
  AND ruleset."version" = 'KLONDIKE_DRAW_THREE_V1'
  AND ruleset."rules" ->> 'draw' = '1'
  AND competition."status" IN ('PUBLISHED', 'OPEN')
  AND NOT EXISTS (
    SELECT 1
    FROM public."competition_entries" AS entry
    WHERE entry."competition_id" = competition."id"
  );
