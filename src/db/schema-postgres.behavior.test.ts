import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationFilesBeforeTruthRepair = [
  "0000_eager_garia.sql",
  "0001_chemical_screwball.sql",
  "0002_volatile_hammerhead.sql",
  "0003_wealthy_speed.sql",
  "0004_lowly_nightcrawler.sql",
  "0005_strange_night_thrasher.sql",
  "0006_dusty_charles_xavier.sql",
  "0007_fortune_dice_rounds.sql",
] as const;
const truthRepairMigration = "0008_draw_three_truth_repair.sql" as const;
const stageTwoMigration = "0009_monetaire_two_account_reality.sql" as const;
const migrationFiles = [
  ...migrationFilesBeforeTruthRepair,
  truthRepairMigration,
  stageTwoMigration,
] as const;

const playLedger = "00000000-0000-0000-0000-000000000001";
const cashLedger = "00000000-0000-0000-0000-000000000002";
const debitAccount = "00000000-0000-0000-0000-000000000011";
const creditAccount = "00000000-0000-0000-0000-000000000012";

describe("PostgreSQL database invariants", () => {
  it("seeds the exact sealed V2 contract on a brand-new database", async () => {
    await withDatabase(async (database) => {
      const result = await database.query<{
        version: string;
        draw: string;
        scoringVersion: string;
        sealed: boolean;
      }>(`
        SELECT
          ruleset."version",
          ruleset."rules" ->> 'draw' AS "draw",
          ruleset."scoring" ->> 'version' AS "scoringVersion",
          ruleset."immutable_at" IS NOT NULL AS "sealed"
        FROM public."ruleset_versions" AS ruleset
        JOIN public."game_definitions" AS definition
          ON definition."id" = ruleset."game_definition_id"
        WHERE definition."key" = 'MONETAIRE_SOLITAIRE'
      `);

      expect(result.rows).toEqual([
        {
          version: "KLONDIKE_DRAW_THREE_V2",
          draw: "3",
          scoringVersion: "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1",
          sealed: true,
        },
      ]);
    });
  });

  it("installs the Stage 2 score, terminal, validation, and snapshot guards", async () => {
    await withDatabase(async (database) => {
      const guards = await database.query<{
        terminalIndex: boolean;
        terminalTrigger: boolean;
        closedAtFrozen: boolean;
        verifiedValidationUnique: boolean;
        snapshotUnique: boolean;
        snapshotHashCheck: boolean;
        snapshotAppendOnly: boolean;
      }>(`
        SELECT
          EXISTS (
            SELECT 1 FROM pg_catalog.pg_indexes
            WHERE schemaname = 'public'
              AND indexname = 'game_sessions_terminal_status_idx'
          ) AS "terminalIndex",
          EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE event_object_schema = 'public'
              AND event_object_table = 'game_sessions'
              AND trigger_name = 'game_sessions_terminal_freeze'
          ) AS "terminalTrigger",
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc AS procedure
            JOIN pg_catalog.pg_namespace AS procedure_schema
              ON procedure_schema.oid = procedure.pronamespace
            WHERE procedure_schema.nspname = 'public'
              AND procedure.proname = 'protect_published_competition'
              AND pg_catalog.pg_get_functiondef(procedure.oid) ILIKE
                '%OLD."status" IN (''CLOSED'', ''SETTLED'', ''CANCELLED'')%'
          ) AS "closedAtFrozen",
          EXISTS (
            SELECT 1 FROM pg_catalog.pg_indexes
            WHERE schemaname = 'public'
              AND indexname = 'deal_validations_verified_deal_unique'
              AND indexdef ILIKE '%unique index%'
          ) AS "verifiedValidationUnique",
          EXISTS (
            SELECT 1 FROM pg_catalog.pg_indexes
            WHERE schemaname = 'public'
              AND indexname = 'leaderboard_snapshots_competition_unique'
              AND indexdef ILIKE '%unique index%'
          ) AS "snapshotUnique",
          EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conname = 'leaderboard_snapshots_hash_sha256'
          ) AS "snapshotHashCheck",
          EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE event_object_schema = 'public'
              AND event_object_table = 'leaderboard_snapshots'
              AND trigger_name = 'leaderboard_snapshots_append_only'
          ) AS "snapshotAppendOnly"
      `);

      expect(guards.rows).toEqual([
        {
          terminalIndex: true,
          terminalTrigger: true,
          closedAtFrozen: true,
          verifiedValidationUnique: true,
          snapshotUnique: true,
          snapshotHashCheck: true,
          snapshotAppendOnly: true,
        },
      ]);
    });
  });

  it("preserves the bad Draw 3 record, cancels only its empty competition, and creates the correct successor", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, migrationFilesBeforeTruthRepair);
      const game = "00000000-0000-0000-0000-000000000501";
      const oldRuleset = "00000000-0000-0000-0000-000000000502";
      const emptyDeal = "00000000-0000-0000-0000-000000000503";
      const emptyCompetition = "00000000-0000-0000-0000-000000000505";

      await database.exec(`
        INSERT INTO public."game_definitions" ("id", "key", "public_name")
        VALUES ('${game}', 'MONETAIRE_SOLITAIRE', 'Monetaire');
        INSERT INTO public."ruleset_versions"
          ("id", "game_definition_id", "version", "rules", "scoring", "immutable_at")
        VALUES
          ('${oldRuleset}', '${game}', 'KLONDIKE_DRAW_THREE_V1', '{"draw":1,"redeals":"unlimited","valuablePrize":false}', '{"version":"MONETAIRE_SCORE_V1"}', '2026-01-01T00:00:00Z');
        INSERT INTO public."deals"
          ("id", "ruleset_version_id", "seed_ciphertext", "seed_commitment", "canonical_deal_hash", "immutable_at")
        VALUES
          ('${emptyDeal}', '${oldRuleset}', 'empty-ciphertext', '${"a".repeat(64)}', '${"b".repeat(64)}', '2026-01-01T00:00:00Z');
        INSERT INTO public."deal_validations"
          ("deal_id", "validator_key", "validator_version", "status", "evidence_hash", "evidence", "validated_at")
        VALUES
          ('${emptyDeal}', 'test', 'v1', 'VERIFIED_SOLVABLE', '${"e".repeat(64)}', '{}', '2026-01-01T00:00:00Z');
        INSERT INTO public."competitions"
          ("id", "public_name", "status", "deal_id", "ruleset_version_id", "opens_at", "closes_at", "published_at")
        VALUES
          ('${emptyCompetition}', 'Empty mistaken record', 'PUBLISHED', '${emptyDeal}', '${oldRuleset}', '2026-01-02T00:00:00Z', '2036-01-02T00:00:00Z', '2026-01-01T00:00:00Z')
      `);

      await applyMigration(database, truthRepairMigration);

      const rulesets = await database.query<{
        version: string;
        rules: { draw: number };
        scoring: { version: string };
      }>(`
        SELECT "version", "rules", "scoring"
        FROM public."ruleset_versions"
        WHERE "game_definition_id" = '${game}'
        ORDER BY "version"
      `);
      expect(rulesets.rows).toEqual([
        {
          version: "KLONDIKE_DRAW_THREE_V1",
          rules: { draw: 1, redeals: "unlimited", valuablePrize: false },
          scoring: { version: "MONETAIRE_SCORE_V1" },
        },
        {
          version: "KLONDIKE_DRAW_THREE_V2",
          rules: { draw: 3, redeals: "unlimited", valuablePrize: false },
          scoring: {
            version: "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1",
          },
        },
      ]);

      const competitions = await database.query<{
        id: string;
        status: string;
        closedAt: Date | null;
      }>(`
        SELECT "id", "status", "closed_at" AS "closedAt"
        FROM public."competitions"
        ORDER BY "id"
      `);
      expect(competitions.rows).toEqual([
        expect.objectContaining({
          id: emptyCompetition,
          status: "CANCELLED",
          closedAt: expect.any(Date),
        }),
      ]);

      const supersessions = await database.query<{
        superseded: string;
        successor: string;
      }>(`
        SELECT
          "superseded_ruleset_version_id" AS "superseded",
          "successor_ruleset_version_id" AS "successor"
        FROM public."ruleset_supersessions"
      `);
      expect(supersessions.rows).toHaveLength(1);
      expect(supersessions.rows[0]?.superseded).toBe(oldRuleset);

      await expectPgReject(
        database,
        `
          INSERT INTO public."competitions"
            ("public_name", "status", "deal_id", "ruleset_version_id", "opens_at", "closes_at", "published_at")
          VALUES
            ('Old runtime race', 'PUBLISHED', '${emptyDeal}', '${oldRuleset}', '2027-01-02T00:00:00Z', '2036-01-02T00:00:00Z', '2027-01-01T00:00:00Z')
        `,
        "superseded ruleset cannot publish a new competition",
      );
    } finally {
      await database.close();
    }
  });

  it("aborts before repair when the mistaken active competition has an entry", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, migrationFilesBeforeTruthRepair);
      const game = "00000000-0000-0000-0000-000000000601";
      const ruleset = "00000000-0000-0000-0000-000000000602";
      const deal = "00000000-0000-0000-0000-000000000603";
      const competition = "00000000-0000-0000-0000-000000000604";
      const user = "00000000-0000-0000-0000-000000000605";

      await database.exec(`
        INSERT INTO public."game_definitions" ("id", "key", "public_name")
        VALUES ('${game}', 'MONETAIRE_SOLITAIRE', 'Monetaire');
        INSERT INTO public."ruleset_versions"
          ("id", "game_definition_id", "version", "rules", "scoring", "immutable_at")
        VALUES
          ('${ruleset}', '${game}', 'KLONDIKE_DRAW_THREE_V1', '{"draw":1,"redeals":"unlimited","valuablePrize":false}', '{"version":"MONETAIRE_SCORE_V1"}', '2026-01-01T00:00:00Z');
        INSERT INTO public."deals"
          ("id", "ruleset_version_id", "seed_ciphertext", "seed_commitment", "canonical_deal_hash", "immutable_at")
        VALUES
          ('${deal}', '${ruleset}', 'entered-ciphertext', '${"1".repeat(64)}', '${"2".repeat(64)}', '2026-01-01T00:00:00Z');
        INSERT INTO public."deal_validations"
          ("deal_id", "validator_key", "validator_version", "status", "evidence_hash", "evidence", "validated_at")
        VALUES
          ('${deal}', 'test', 'v1', 'VERIFIED_SOLVABLE', '${"3".repeat(64)}', '{}', '2026-01-01T00:00:00Z');
        INSERT INTO public."competitions"
          ("id", "public_name", "status", "deal_id", "ruleset_version_id", "opens_at", "closes_at", "published_at")
        VALUES
          ('${competition}', 'Entered mistaken record', 'OPEN', '${deal}', '${ruleset}', '2026-01-02T00:00:00Z', '2036-01-02T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO public."users" ("id", "email", "password_hash")
        VALUES ('${user}', 'entered-repair@example.test', 'not-a-real-password-hash');
        INSERT INTO public."competition_entries"
          ("competition_id", "user_id", "deal_id", "entered_at")
        VALUES
          ('${competition}', '${user}', '${deal}', '2026-08-09T00:00:00Z')
      `);

      await expect(
        applyMigration(database, truthRepairMigration),
      ).rejects.toThrow(
        "Draw 3 truth repair refuses to cancel a competition with player entries",
      );
      const successor = await database.query<{ count: number }>(`
        SELECT count(*)::integer AS "count"
        FROM public."ruleset_versions"
        WHERE "version" = 'KLONDIKE_DRAW_THREE_V2'
      `);
      expect(successor.rows[0]?.count).toBe(0);
    } finally {
      await database.close();
    }
  });

  it("aborts the Stage 2 upgrade before changing invariants when ranked play reaches the cutoff", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, [
        ...migrationFilesBeforeTruthRepair,
        truthRepairMigration,
      ]);
      const fixture = await seedStageTwoCompetitionFoundation(database);
      const entry = "00000000-0000-0000-0000-000000000714";
      const session = "00000000-0000-0000-0000-000000000715";

      await database.exec(`
        INSERT INTO public."competition_entries"
          ("id", "competition_id", "user_id", "deal_id", "entered_at")
        VALUES
          ('${entry}', '${fixture.competition}', '${fixture.user}', '${fixture.deal}', '2026-01-15T00:00:00Z');
        INSERT INTO public."game_sessions" (
          "id", "user_id", "competition_entry_id", "deal_id",
          "ruleset_version_id", "session_mode", "state_snapshot",
          "activity_clock_snapshot", "seed_ciphertext", "started_at",
          "last_active_at"
        ) VALUES (
          '${session}', '${fixture.user}', '${entry}', '${fixture.deal}',
          '${fixture.ruleset}', 'NONCASH_COMPETITION',
          '{"status":"ACTIVE","validMoveCount":0}'::jsonb,
          '{"status":"RUNNING","accumulatedActiveMs":0,"lastServerEventMs":1769903999000}'::jsonb,
          'ranked-session-ciphertext',
          '2026-01-15T00:00:00Z', '2026-01-31T23:59:59Z'
        );
        INSERT INTO public."move_events" (
          "game_session_id", "sequence", "idempotency_key", "move_type",
          "move_payload", "state_hash_before", "state_hash_after",
          "server_received_at", "accepted"
        ) VALUES (
          '${session}', 1, 'cutoff-move', 'DRAW_STOCK', '{}'::jsonb,
          '${"a".repeat(64)}', '${"b".repeat(64)}',
          '2026-02-01T00:00:00Z', true
        )
      `);

      await expect(applyMigration(database, stageTwoMigration)).rejects.toThrow(
        "Stage 2 upgrade refuses ranked evidence at or after the competition cutoff",
      );

      const index = await database.query<{ predicate: string | null }>(`
        SELECT pg_get_expr(indexes.indpred, indexes.indrelid) AS "predicate"
        FROM pg_index AS indexes
        JOIN pg_class AS index_class
          ON index_class.oid = indexes.indexrelid
        WHERE index_class.relname = 'move_events_session_sequence_unique'
      `);
      expect(index.rows[0]?.predicate).toBeNull();
    } finally {
      await database.close();
    }
  });

  it("refuses reused eligibility evidence before changing Stage 2 invariants", async () => {
    await expectStageTwoPreflightReject(
      async (database, fixture) => {
        await database.exec(`
          INSERT INTO public."jurisdiction_decisions" (
            "id", "user_id", "product_mode", "decision", "rule_version",
            "location_evidence_status", "request_id"
          ) VALUES (
            '00000000-0000-0000-0000-000000000740', '${fixture.user}',
            'MONETAIRE_PLAY', 'ALLOW', 'TEST_V1', 'APPROVED',
            'stage-two-reused-decision'
          );
          INSERT INTO public."competitions" (
            "id", "public_name", "status", "deal_id", "ruleset_version_id",
            "opens_at", "closes_at", "published_at"
          ) VALUES (
            '00000000-0000-0000-0000-000000000741',
            'Second Stage Two Upgrade Competition', 'OPEN', '${fixture.deal}',
            '${fixture.ruleset}', '2026-01-01T00:00:00Z',
            '2026-02-01T00:00:00Z', '2025-12-15T00:00:00Z'
          );
          INSERT INTO public."competition_entries" (
            "id", "competition_id", "user_id", "deal_id",
            "eligibility_decision_id", "entered_at"
          ) VALUES
            (
              '00000000-0000-0000-0000-000000000742',
              '${fixture.competition}', '${fixture.user}', '${fixture.deal}',
              '00000000-0000-0000-0000-000000000740',
              '2026-01-15T00:00:00Z'
            ),
            (
              '00000000-0000-0000-0000-000000000743',
              '00000000-0000-0000-0000-000000000741', '${fixture.user}',
              '${fixture.deal}',
              '00000000-0000-0000-0000-000000000740',
              '2026-01-15T00:00:00Z'
            )
        `);
      },
      "Stage 2 upgrade found a reused competition eligibility decision",
    );
  });

  it("refuses multiple sessions for one competition entry before changing invariants", async () => {
    await expectStageTwoPreflightReject(
      async (database, fixture) => {
        await database.exec(`
          INSERT INTO public."competition_entries" (
            "id", "competition_id", "user_id", "deal_id", "entered_at"
          ) VALUES (
            '00000000-0000-0000-0000-000000000744',
            '${fixture.competition}', '${fixture.user}', '${fixture.deal}',
            '2026-01-15T00:00:00Z'
          );
          INSERT INTO public."game_sessions" (
            "id", "user_id", "competition_entry_id", "deal_id",
            "ruleset_version_id", "status", "session_mode",
            "state_snapshot", "activity_clock_snapshot", "seed_ciphertext",
            "started_at", "last_active_at"
          ) VALUES
            (
              '00000000-0000-0000-0000-000000000745', '${fixture.user}',
              '00000000-0000-0000-0000-000000000744', '${fixture.deal}',
              '${fixture.ruleset}', 'ACTIVE', 'NONCASH_COMPETITION',
              '{"status":"ACTIVE","validMoveCount":0}'::jsonb,
              '{"status":"RUNNING","accumulatedActiveMs":0,"lastServerEventMs":1768435200000}'::jsonb,
              'duplicate-entry-session-one', '2026-01-15T00:00:00Z',
              '2026-01-15T00:00:00Z'
            ),
            (
              '00000000-0000-0000-0000-000000000746', '${fixture.user}',
              '00000000-0000-0000-0000-000000000744', '${fixture.deal}',
              '${fixture.ruleset}', 'ACTIVE', 'NONCASH_COMPETITION',
              '{"status":"ACTIVE","validMoveCount":0}'::jsonb,
              '{"status":"RUNNING","accumulatedActiveMs":0,"lastServerEventMs":1768435200000}'::jsonb,
              'duplicate-entry-session-two', '2026-01-15T00:00:00Z',
              '2026-01-15T00:00:00Z'
            )
        `);
      },
      "Stage 2 upgrade found multiple sessions for one competition entry",
    );
  });

  it("refuses inconsistent session mode evidence before changing invariants", async () => {
    await expectStageTwoPreflightReject(
      async (database, fixture) => {
        await database.exec(`
          INSERT INTO public."game_sessions" (
            "id", "user_id", "deal_id", "ruleset_version_id", "status",
            "session_mode", "state_snapshot", "activity_clock_snapshot",
            "seed_ciphertext", "started_at", "last_active_at"
          ) VALUES (
            '00000000-0000-0000-0000-000000000747', '${fixture.user}',
            '${fixture.deal}', '${fixture.ruleset}', 'ACTIVE',
            'NONCASH_COMPETITION',
            '{"status":"ACTIVE","validMoveCount":0}'::jsonb,
            '{"status":"RUNNING","accumulatedActiveMs":0,"lastServerEventMs":1768435200000}'::jsonb,
            'inconsistent-session-mode', '2026-01-15T00:00:00Z',
            '2026-01-15T00:00:00Z'
          )
        `);
      },
      "Stage 2 upgrade found inconsistent session mode and competition entry evidence",
    );
  });

  it("refuses invalid linked eligibility evidence before changing invariants", async () => {
    await expectStageTwoPreflightReject(
      async (database, fixture) => {
        await database.exec(`
          INSERT INTO public."jurisdiction_decisions" (
            "id", "user_id", "product_mode", "decision", "rule_version",
            "location_evidence_status", "request_id"
          ) VALUES (
            '00000000-0000-0000-0000-000000000748', '${fixture.user}',
            'MONETAIRE_PLAY', 'DENY', 'TEST_V1', 'APPROVED',
            'stage-two-denied-decision'
          );
          INSERT INTO public."competition_entries" (
            "id", "competition_id", "user_id", "deal_id",
            "eligibility_decision_id", "entered_at"
          ) VALUES (
            '00000000-0000-0000-0000-000000000749',
            '${fixture.competition}', '${fixture.user}', '${fixture.deal}',
            '00000000-0000-0000-0000-000000000748',
            '2026-01-15T00:00:00Z'
          )
        `);
      },
      "Stage 2 upgrade found invalid linked competition eligibility evidence",
    );
  });

  it("refuses a completed session without a score before changing invariants", async () => {
    await expectStageTwoPreflightReject(
      async (database, fixture) => {
        await database.exec(`
          INSERT INTO public."game_sessions" (
            "id", "user_id", "deal_id", "ruleset_version_id", "status",
            "session_mode", "state_snapshot", "activity_clock_snapshot",
            "seed_ciphertext", "started_at", "last_active_at", "completed_at"
          ) VALUES (
            '00000000-0000-0000-0000-000000000750', '${fixture.user}',
            '${fixture.deal}', '${fixture.ruleset}', 'COMPLETED', 'PRACTICE',
            '{"status":"WON","validMoveCount":81}'::jsonb,
            '{"status":"FINALIZED","accumulatedActiveMs":5000,"lastServerEventMs":1768435205000}'::jsonb,
            'scoreless-completed-session', '2026-01-15T00:00:00Z',
            '2026-01-15T00:00:05Z', '2026-01-15T00:00:05Z'
          )
        `);
      },
      "Stage 2 upgrade found a completed session without an active score",
    );
  });

  it("cancels one empty active V2 head that lacks replay proof", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, [
        ...migrationFilesBeforeTruthRepair,
        truthRepairMigration,
      ]);
      const proofless = await seedActiveProoflessV2Competition(database, {
        deal: "00000000-0000-0000-0000-000000000724",
        competition: "00000000-0000-0000-0000-000000000725",
      });

      await applyMigration(database, stageTwoMigration);

      const repaired = await database.query<{
        status: string;
        closedAt: Date | null;
      }>(`
        SELECT "status", "closed_at" AS "closedAt"
        FROM public."competitions"
        WHERE "id" = '${proofless.competition}'
      `);
      expect(repaired.rows).toEqual([
        { status: "CANCELLED", closedAt: expect.any(Date) },
      ]);

      const activeProofless = await database.query<{ count: number }>(`
        SELECT count(*)::integer AS "count"
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
      `);
      expect(activeProofless.rows).toEqual([{ count: 0 }]);
    } finally {
      await database.close();
    }
  });

  it("refuses to cancel an entered active V2 head that lacks replay proof", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, [
        ...migrationFilesBeforeTruthRepair,
        truthRepairMigration,
      ]);
      const proofless = await seedActiveProoflessV2Competition(database, {
        deal: "00000000-0000-0000-0000-000000000726",
        competition: "00000000-0000-0000-0000-000000000727",
        user: "00000000-0000-0000-0000-000000000728",
        entry: "00000000-0000-0000-0000-000000000729",
      });

      await expect(applyMigration(database, stageTwoMigration)).rejects.toThrow(
        "Stage 2 upgrade refuses to cancel an entered proofless V2 competition",
      );

      const unchanged = await database.query<{ status: string }>(`
        SELECT "status"
        FROM public."competitions"
        WHERE "id" = '${proofless.competition}'
      `);
      expect(unchanged.rows).toEqual([{ status: "OPEN" }]);
    } finally {
      await database.close();
    }
  });

  it("refuses an ambiguous set of active proofless V2 heads", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, [
        ...migrationFilesBeforeTruthRepair,
        truthRepairMigration,
      ]);
      await seedActiveProoflessV2Competition(database, {
        deal: "00000000-0000-0000-0000-000000000730",
        competition: "00000000-0000-0000-0000-000000000731",
      });
      await seedActiveProoflessV2Competition(database, {
        deal: "00000000-0000-0000-0000-000000000732",
        competition: "00000000-0000-0000-0000-000000000733",
      });

      await expect(applyMigration(database, stageTwoMigration)).rejects.toThrow(
        "Stage 2 upgrade found ambiguous active proofless V2 competitions",
      );

      const unchanged = await database.query<{ count: number }>(`
        SELECT count(*)::integer AS "count"
        FROM public."competitions"
        WHERE "id" IN (
          '00000000-0000-0000-0000-000000000731',
          '00000000-0000-0000-0000-000000000733'
        ) AND "status" = 'OPEN'
      `);
      expect(unchanged.rows).toEqual([{ count: 2 }]);
    } finally {
      await database.close();
    }
  });

  it("refuses malformed abandoned evidence instead of leaving it scoreless", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, [
        ...migrationFilesBeforeTruthRepair,
        truthRepairMigration,
      ]);
      const fixture = await seedStageTwoCompetitionFoundation(database);
      await database.exec(`
        INSERT INTO public."game_sessions" (
          "user_id", "deal_id", "ruleset_version_id", "status",
          "session_mode", "state_snapshot", "activity_clock_snapshot",
          "seed_ciphertext"
        ) VALUES (
          '${fixture.user}', '${fixture.deal}', '${fixture.ruleset}',
          'ABANDONED', 'PRACTICE',
          '{"status":"ACTIVE","validMoveCount":1}'::jsonb,
          '{"status":"RUNNING","accumulatedActiveMs":100,"lastServerEventMs":1768867200000}'::jsonb,
          'malformed-abandoned-ciphertext'
        )
      `);

      await expect(applyMigration(database, stageTwoMigration)).rejects.toThrow(
        "Stage 2 upgrade found malformed abandoned session scoring evidence",
      );
    } finally {
      await database.close();
    }
  });

  it("backfills every authoritative abandoned score from its stored ruleset", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, [
        ...migrationFilesBeforeTruthRepair,
        truthRepairMigration,
      ]);
      const fixture = await seedStageTwoCompetitionFoundation(database);
      const session = "00000000-0000-0000-0000-000000000716";
      const legacyDefinition = "00000000-0000-0000-0000-000000000718";
      const legacyRuleset = "00000000-0000-0000-0000-000000000719";
      const legacyDeal = "00000000-0000-0000-0000-000000000720";
      const legacySession = "00000000-0000-0000-0000-000000000721";
      const rankedEntry = "00000000-0000-0000-0000-000000000722";
      const rankedSession = "00000000-0000-0000-0000-000000000723";

      await database.exec(`
        INSERT INTO public."game_definitions" ("id", "key", "public_name")
        VALUES ('${legacyDefinition}', 'LEGACY_PRACTICE_BACKFILL', 'Legacy practice backfill');
        INSERT INTO public."ruleset_versions" (
          "id", "game_definition_id", "version", "rules", "scoring", "immutable_at"
        ) VALUES (
          '${legacyRuleset}', '${legacyDefinition}', 'KLONDIKE_DRAW_THREE_V1',
          '{"draw":1,"redeals":"unlimited","valuablePrize":false}'::jsonb,
          '{"version":"MONETAIRE_SCORE_V1"}'::jsonb,
          '2026-01-01T00:00:00Z'
        );
        INSERT INTO public."deals" (
          "id", "ruleset_version_id", "seed_ciphertext", "seed_commitment",
          "canonical_deal_hash", "immutable_at"
        ) VALUES (
          '${legacyDeal}', '${legacyRuleset}', 'legacy-practice-ciphertext',
          '${"d".repeat(64)}', '${"e".repeat(64)}', '2026-01-01T00:00:00Z'
        );
        INSERT INTO public."game_sessions" (
          "id", "user_id", "deal_id", "ruleset_version_id", "status",
          "session_mode", "state_snapshot", "activity_clock_snapshot",
          "seed_ciphertext", "active_duration_ms", "started_at",
          "last_active_at", "abandoned_at"
        ) VALUES (
          '${session}', '${fixture.user}', '${fixture.deal}', '${fixture.ruleset}',
          'ABANDONED', 'PRACTICE',
          '{"status":"ABANDONED","validMoveCount":7}'::jsonb,
          '{"status":"FINALIZED","accumulatedActiveMs":4321,"runningSinceServerMs":null,"lastServerEventMs":1768867200123}'::jsonb,
          'practice-session-ciphertext', 4321,
          '2026-01-19T23:59:00Z', '2026-01-20T00:00:00.123Z',
          '2026-01-20T00:00:00.123Z'
        );
        INSERT INTO public."game_sessions" (
          "id", "user_id", "deal_id", "ruleset_version_id", "status",
          "session_mode", "state_snapshot", "activity_clock_snapshot",
          "seed_ciphertext", "active_duration_ms", "started_at",
          "last_active_at", "abandoned_at"
        ) VALUES (
          '${legacySession}', '${fixture.user}', '${legacyDeal}', '${legacyRuleset}',
          'ABANDONED', 'PRACTICE',
          '{"status":"ABANDONED","validMoveCount":4}'::jsonb,
          '{"status":"FINALIZED","accumulatedActiveMs":1234,"runningSinceServerMs":null,"lastServerEventMs":1768867100123}'::jsonb,
          'legacy-practice-session-ciphertext', 1234,
          '2026-01-19T23:57:00Z', '2026-01-19T23:58:20.123Z',
          '2026-01-19T23:58:20.123Z'
        );
        INSERT INTO public."competition_entries" (
          "id", "competition_id", "user_id", "deal_id", "entered_at"
        ) VALUES (
          '${rankedEntry}', '${fixture.competition}', '${fixture.otherUser}',
          '${fixture.deal}', '2026-01-15T00:00:00Z'
        );
        INSERT INTO public."game_sessions" (
          "id", "user_id", "competition_entry_id", "deal_id",
          "ruleset_version_id", "status", "session_mode", "state_snapshot",
          "activity_clock_snapshot", "seed_ciphertext", "active_duration_ms",
          "started_at", "last_active_at", "abandoned_at"
        ) VALUES (
          '${rankedSession}', '${fixture.otherUser}', '${rankedEntry}',
          '${fixture.deal}', '${fixture.ruleset}', 'ABANDONED',
          'NONCASH_COMPETITION',
          '{"status":"ABANDONED","validMoveCount":6}'::jsonb,
          '{"status":"FINALIZED","accumulatedActiveMs":2222,"runningSinceServerMs":null,"lastServerEventMs":1768867150123}'::jsonb,
          'ranked-session-ciphertext', 2222,
          '2026-01-19T23:58:00Z', '2026-01-19T23:59:10.123Z',
          '2026-01-19T23:59:10.123Z'
        )
      `);

      await applyMigration(database, stageTwoMigration);

      const scores = await database.query<{
        completed: boolean;
        validMoveCount: number;
        verifiedActiveDurationMs: number;
        scoringVersion: string;
        computedAt: Date;
      }>(`
        SELECT
          "completed",
          "valid_move_count" AS "validMoveCount",
          "verified_active_duration_ms" AS "verifiedActiveDurationMs",
          "scoring_version" AS "scoringVersion",
          "computed_at" AS "computedAt"
        FROM public."scores"
        WHERE "game_session_id" IN (
          '${session}', '${legacySession}', '${rankedSession}'
        )
          AND "superseded_by_score_id" IS NULL
        ORDER BY "valid_move_count"
      `);
      expect(scores.rows).toEqual([
        {
          completed: false,
          validMoveCount: 4,
          verifiedActiveDurationMs: 1234,
          scoringVersion: "MONETAIRE_SCORE_V1",
          computedAt: new Date("2026-01-19T23:58:20.123Z"),
        },
        {
          completed: false,
          validMoveCount: 6,
          verifiedActiveDurationMs: 2222,
          scoringVersion: "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1",
          computedAt: new Date("2026-01-19T23:59:10.123Z"),
        },
        {
          completed: false,
          validMoveCount: 7,
          verifiedActiveDurationMs: 4321,
          scoringVersion: "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1",
          computedAt: new Date("2026-01-20T00:00:00.123Z"),
        },
      ]);
    } finally {
      await database.close();
    }
  });

  it("preserves historical null eligibility while requiring decisions for new entries", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, [
        ...migrationFilesBeforeTruthRepair,
        truthRepairMigration,
      ]);
      const fixture = await seedStageTwoCompetitionFoundation(database);
      const historicalEntry = "00000000-0000-0000-0000-000000000717";

      await database.exec(`
        INSERT INTO public."competition_entries" (
          "id", "competition_id", "user_id", "deal_id",
          "eligibility_decision_id", "entered_at"
        ) VALUES (
          '${historicalEntry}', '${fixture.competition}', '${fixture.user}',
          '${fixture.deal}', NULL, '2026-01-15T00:00:00Z'
        )
      `);

      await applyMigration(database, stageTwoMigration);

      const historical = await database.query<{
        eligibilityDecisionId: string | null;
      }>(`
        SELECT "eligibility_decision_id" AS "eligibilityDecisionId"
        FROM public."competition_entries"
        WHERE "id" = '${historicalEntry}'
      `);
      expect(historical.rows).toEqual([{ eligibilityDecisionId: null }]);

      await expectPgReject(
        database,
        `
          INSERT INTO public."competition_entries" (
            "competition_id", "user_id", "deal_id",
            "eligibility_decision_id", "entered_at"
          ) VALUES (
            '${fixture.competition}', '${fixture.otherUser}', '${fixture.deal}',
            NULL, '2026-01-16T00:00:00Z'
          )
        `,
        "competition entry requires an allowed Monetaire Play jurisdiction decision for the same user",
      );
    } finally {
      await database.close();
    }
  });

  it("applies every migration and enforces active PLAY_COIN ledger accounting", async () => {
    await withDatabase(async (db) => {
      await seedLedgerFoundation(db);

      await expectPgReject(
        db,
        `
          INSERT INTO public."ledger_accounts"
            ("id", "ledger_id", "account_code", "currency")
          VALUES
            ('00000000-0000-0000-0000-000000000019', '${cashLedger}', 'CASH', 'CASINO_CASH_USD')
        `,
        "is not an active PLAY_COIN ledger",
      );

      await expectCommitReject(
        db,
        `
          INSERT INTO public."ledger_transactions"
            ("id", "ledger_id", "ledger_type", "idempotency_key", "reference_type", "reference_id", "reason", "actor_id")
          VALUES
            ('00000000-0000-0000-0000-000000000100', '${playLedger}', 'PLAY_COIN', 'empty', 'TEST', 'empty', 'test', 'test')
        `,
        "must contain balanced entries",
      );

      const transactionId = "00000000-0000-0000-0000-000000000101";
      await insertBalancedTransaction(db, {
        id: transactionId,
        idempotencyKey: "balanced",
        referenceType: "TEST",
        referenceId: "balanced",
        amount: 10,
      });

      await expectPgReject(
        db,
        `
          INSERT INTO public."ledger_entries"
            ("transaction_id", "account_id", "ledger_id", "direction", "amount_minor", "currency")
          VALUES
            ('${transactionId}', '${debitAccount}', '${cashLedger}', 'DEBIT', 1, 'CASINO_CASH_USD')
        `,
        "is not an active PLAY_COIN ledger",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."ledgers"
          SET "status" = 'CLOSED'
          WHERE "id" = '${playLedger}'
        `,
        "operational ledger must remain ACTIVE PLAY_COIN",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."ledger_accounts"
          SET "account_code" = 'CHANGED'
          WHERE "id" = '${debitAccount}'
        `,
        "history is append-only",
      );
    });
  });

  it("binds sandbox receipts to balanced ledger transactions and retains exclusions", async () => {
    await withDatabase(async (db) => {
      await seedLedgerFoundation(db);

      const user = "00000000-0000-0000-0000-000000000201";
      const packageId = "00000000-0000-0000-0000-000000000210";
      const purchaseId = "00000000-0000-0000-0000-000000000220";
      const purchaseTransaction = "00000000-0000-0000-0000-000000000221";

      await db.exec(`
        INSERT INTO public."users" ("id", "email", "password_hash")
        VALUES ('${user}', 'sandbox@example.test', 'not-a-real-password-hash');
        INSERT INTO public."play_coin_packages"
          ("id", "public_key", "label", "play_coin_minor_units", "sandbox_price_minor_usd")
        VALUES ('${packageId}', 'TEST', 'Test', 100, 0)
      `);
      await insertBalancedTransaction(db, {
        id: purchaseTransaction,
        idempotencyKey: "purchase",
        referenceType: "SANDBOX_PURCHASE",
        referenceId: purchaseId,
        amount: 100,
      });
      await db.exec(`
        INSERT INTO public."sandbox_purchases"
          ("id", "user_id", "play_coin_package_id", "provider_reference", "idempotency_key", "ledger_transaction_id")
        VALUES
          ('${purchaseId}', '${user}', '${packageId}', 'local-test', 'purchase', '${purchaseTransaction}')
      `);

      await expectPgReject(
        db,
        `
          UPDATE public."sandbox_purchases"
          SET "provider_reference" = 'changed'
          WHERE "id" = '${purchaseId}'
        `,
        "history is append-only",
      );

      const excludedUser = "00000000-0000-0000-0000-000000000202";
      const exclusion = "00000000-0000-0000-0000-000000000203";
      await db.exec(`
        INSERT INTO public."users" ("id", "email", "password_hash")
        VALUES ('${excludedUser}', 'excluded@example.test', 'not-a-real-password-hash');
        INSERT INTO public."self_exclusions"
          ("id", "user_id", "scope", "permanent")
        VALUES
          ('${exclusion}', '${excludedUser}', 'ALL_PRODUCTS', true)
      `);
      await expectPgReject(
        db,
        `
          UPDATE public."self_exclusions"
          SET "reason" = 'changed'
          WHERE "id" = '${exclusion}'
        `,
        "history is append-only",
      );
      await expectPgReject(
        db,
        `DELETE FROM public."users" WHERE "id" = '${excludedUser}'`,
        "self_exclusions_user_id_users_id_fk",
      );
    });
  });

  it("freezes sealed publication contracts and delays deal reveal", async () => {
    await withDatabase(async (db) => {
      const game = "00000000-0000-0000-0000-000000000301";
      const ruleset = "00000000-0000-0000-0000-000000000302";
      const deal = "00000000-0000-0000-0000-000000000303";
      const validation = "00000000-0000-0000-0000-000000000304";
      const competition = "00000000-0000-0000-0000-000000000305";
      const hashA = "a".repeat(64);
      const hashB = "b".repeat(64);

      await db.exec(`
        INSERT INTO public."game_definitions" ("id", "key", "public_name")
        VALUES ('${game}', 'TEST_GAME', 'Test Game');
        INSERT INTO public."ruleset_versions"
          ("id", "game_definition_id", "version", "rules", "scoring", "immutable_at")
        VALUES
          ('${ruleset}', '${game}', 'v1', '{}', '{}', '2026-01-01T00:00:00Z');
        INSERT INTO public."deals"
          ("id", "ruleset_version_id", "seed_ciphertext", "seed_commitment", "canonical_deal_hash", "immutable_at")
        VALUES
          ('${deal}', '${ruleset}', 'ciphertext', '${hashA}', '${hashB}', '2026-01-01T00:00:00Z');
        INSERT INTO public."deal_validations"
          ("id", "deal_id", "validator_key", "validator_version", "status", "evidence_hash", "evidence", "validated_at")
        VALUES
          ('${validation}', '${deal}', 'test', 'v1', 'VERIFIED_SOLVABLE', '${hashA}', '{}', '2026-01-01T00:00:00Z');
        INSERT INTO public."competitions"
          ("id", "public_name", "status", "deal_id", "ruleset_version_id", "opens_at", "closes_at", "published_at")
        VALUES
          ('${competition}', 'Published', 'PUBLISHED', '${deal}', '${ruleset}', '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z', '2026-01-15T00:00:00Z')
      `);

      await expectPgReject(
        db,
        `
          UPDATE public."competitions"
          SET "public_name" = 'Changed'
          WHERE "id" = '${competition}'
        `,
        "published competition contract fields are immutable",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."ruleset_versions"
          SET "rules" = '{"changed":true}'
          WHERE "id" = '${ruleset}'
        `,
        "sealed or published ruleset is immutable",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."deals"
          SET "seed_ciphertext" = 'changed'
          WHERE "id" = '${deal}'
        `,
        "validated, sealed, or published deal is immutable",
      );
      await expectPgReject(
        db,
        `
          UPDATE public."deals"
          SET "revealed_seed" = 'seed', "revealed_at" = '2026-03-01T00:00:00Z'
          WHERE "id" = '${deal}'
        `,
        "deal cannot be revealed before every competition closes",
      );
      await expectPgReject(
        db,
        `DELETE FROM public."deal_validations" WHERE "id" = '${validation}'`,
        "history is append-only",
      );
      await db.exec(`
        UPDATE public."competitions"
        SET "status" = 'OPEN'
        WHERE "id" = '${competition}';
        UPDATE public."competitions"
        SET "status" = 'CLOSED', "closed_at" = '2026-03-01T00:00:00Z'
        WHERE "id" = '${competition}'
      `);
      await expectPgReject(
        db,
        `
          UPDATE public."competitions"
          SET "closed_at" = '2026-03-02T00:00:00Z'
          WHERE "id" = '${competition}'
        `,
        "terminal competition record is immutable",
      );
    });
  });

  it("rejects mutations to gameplay and administrative evidence", async () => {
    await withDatabase(async (db) => {
      const user = "00000000-0000-0000-0000-000000000401";
      const game = "00000000-0000-0000-0000-000000000402";
      const ruleset = "00000000-0000-0000-0000-000000000403";
      const deal = "00000000-0000-0000-0000-000000000404";
      const session = "00000000-0000-0000-0000-000000000405";
      const blockedSession = "00000000-0000-0000-0000-000000000411";
      const move = "00000000-0000-0000-0000-000000000406";
      const score = "00000000-0000-0000-0000-000000000407";
      const adminAction = "00000000-0000-0000-0000-000000000408";
      const auditEvent = "00000000-0000-0000-0000-000000000409";
      const hashA = "a".repeat(64);
      const hashB = "b".repeat(64);
      const hashC = "c".repeat(64);

      await db.exec(`
        INSERT INTO public."users" ("id", "email", "password_hash")
        VALUES ('${user}', 'evidence@example.test', 'not-a-real-password-hash');
        INSERT INTO public."game_definitions" ("id", "key", "public_name")
        VALUES ('${game}', 'EVIDENCE_GAME', 'Evidence Game');
        INSERT INTO public."ruleset_versions"
          ("id", "game_definition_id", "version", "rules", "scoring")
        VALUES ('${ruleset}', '${game}', 'v1', '{}', '{}');
        INSERT INTO public."deals"
          ("id", "ruleset_version_id", "seed_ciphertext", "seed_commitment", "canonical_deal_hash")
        VALUES ('${deal}', '${ruleset}', 'ciphertext', '${hashA}', '${hashB}');
        INSERT INTO public."game_sessions"
          ("id", "user_id", "deal_id", "ruleset_version_id", "state_snapshot", "activity_clock_snapshot", "seed_ciphertext")
        VALUES
          ('${session}', '${user}', '${deal}', '${ruleset}', '{}', '{}', 'test-ciphertext'),
          ('${blockedSession}', '${user}', '${deal}', '${ruleset}', '{}', '{}', 'blocked-test-ciphertext');
        INSERT INTO public."move_events"
          ("id", "game_session_id", "sequence", "idempotency_key", "move_type", "move_payload", "state_hash_before", "state_hash_after", "accepted")
        VALUES ('${move}', '${session}', 1, 'move-1', 'DRAW', '{}', '${hashA}', '${hashB}', true);
        INSERT INTO public."scores"
          ("id", "game_session_id", "completed", "valid_move_count", "verified_active_duration_ms", "scoring_version")
        VALUES ('${score}', '${session}', false, 1, 100, 'v1');
        INSERT INTO public."admin_actions"
          ("id", "actor_user_id", "role_used", "action_type", "target_type", "target_id", "reason")
        VALUES ('${adminAction}', '${user}', 'SUPPORT', 'REVIEW', 'SESSION', '${session}', 'test');
        INSERT INTO public."audit_events"
          ("id", "event_type", "actor_type", "actor_id", "subject_type", "subject_id", "request_id", "event_hash")
        VALUES ('${auditEvent}', 'TEST', 'SYSTEM', 'test', 'SESSION', '${session}', 'request-1', '${hashC}')
      `);

      await expectPgReject(
        db,
        `UPDATE public."game_sessions" SET "status" = 'BLOCKED' WHERE "id" = '${blockedSession}'`,
        "invalid or backwards game session state transition",
      );
      await db.exec(`
        UPDATE public."game_sessions"
        SET "status" = 'ABANDONED'
        WHERE "id" = '${session}'
      `);
      await expectPgReject(
        db,
        `UPDATE public."game_sessions" SET "updated_at" = clock_timestamp() WHERE "id" = '${session}'`,
        "terminal game session history is immutable",
      );
      await expectPgReject(
        db,
        `DELETE FROM public."game_sessions" WHERE "id" = '${session}'`,
        "terminal game session history is immutable",
      );

      for (const [table, id] of [
        ["move_events", move],
        ["scores", score],
        ["admin_actions", adminAction],
        ["audit_events", auditEvent],
      ] as const) {
        await expectPgReject(
          db,
          `UPDATE public."${table}" SET "created_at" = clock_timestamp() WHERE "id" = '${id}'`,
          "history is append-only",
        );
      }
    });
  });
});

async function withDatabase(
  assertion: (database: PGlite) => Promise<void>,
): Promise<void> {
  const database = new PGlite();
  await database.waitReady;

  try {
    await applyMigrations(database, migrationFiles);
    await assertion(database);
  } finally {
    await database.close();
  }
}

async function applyMigrations(
  database: PGlite,
  migrations: readonly string[],
): Promise<void> {
  for (const migration of migrations) {
    await applyMigration(database, migration);
  }
}

async function applyMigration(
  database: PGlite,
  migration: string,
): Promise<void> {
  const migrationSql = readFileSync(
    resolve(process.cwd(), "drizzle", migration),
    "utf8",
  );
  for (const statement of migrationSql
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await database.exec(statement);
  }
}

async function seedActiveProoflessV2Competition(
  db: PGlite,
  input: Readonly<{
    deal: string;
    competition: string;
    user?: string;
    entry?: string;
  }>,
): Promise<{ competition: string }> {
  const rulesetResult = await db.query<{ id: string }>(`
    SELECT ruleset."id"
    FROM public."ruleset_versions" AS ruleset
    JOIN public."game_definitions" AS definition
      ON definition."id" = ruleset."game_definition_id"
    WHERE definition."key" = 'MONETAIRE_SOLITAIRE'
      AND ruleset."version" = 'KLONDIKE_DRAW_THREE_V2'
  `);
  const ruleset = rulesetResult.rows[0]?.id;
  if (!ruleset) throw new Error("Stage Two V2 fixture ruleset is missing");
  const commitment = createHash("sha256")
    .update(`proofless-deal:${input.deal}`)
    .digest("hex");
  const canonicalDealHash = createHash("sha256")
    .update(`proofless-competition:${input.competition}`)
    .digest("hex");

  await db.exec(`
    INSERT INTO public."deals" (
      "id", "ruleset_version_id", "seed_ciphertext", "seed_commitment",
      "canonical_deal_hash", "immutable_at"
    ) VALUES (
      '${input.deal}', '${ruleset}', 'stage-one-metadata-only-ciphertext',
      '${commitment}', '${canonicalDealHash}', '2025-12-01T00:00:00Z'
    );
    INSERT INTO public."deal_validations" (
      "deal_id", "validator_key", "validator_version", "status",
      "evidence_hash", "evidence", "validated_at"
    ) VALUES (
      '${input.deal}', 'CURATED_SOLVABLE', 'V1', 'VERIFIED_SOLVABLE',
      '${"6".repeat(64)}',
      '{"protocol":"MONETAIRE_CURATED_SOLVABLE_V1"}'::jsonb,
      '2025-12-01T00:00:00Z'
    );
    INSERT INTO public."competitions" (
      "id", "public_name", "status", "deal_id", "ruleset_version_id",
      "opens_at", "closes_at", "published_at"
    ) VALUES (
      '${input.competition}', 'Stage One Metadata-only V2', 'OPEN',
      '${input.deal}', '${ruleset}', '2026-01-01T00:00:00Z',
      '2036-01-01T00:00:00Z', '2025-12-15T00:00:00Z'
    )
  `);

  if (input.user && input.entry) {
    await db.exec(`
      INSERT INTO public."users" ("id", "email", "password_hash")
      VALUES (
        '${input.user}', '${input.user}@example.test',
        'not-a-real-password-hash'
      );
      INSERT INTO public."competition_entries" (
        "id", "competition_id", "user_id", "deal_id", "entered_at"
      ) VALUES (
        '${input.entry}', '${input.competition}', '${input.user}',
        '${input.deal}', '2026-01-15T00:00:00Z'
      )
    `);
  }

  return { competition: input.competition };
}

async function seedStageTwoCompetitionFoundation(db: PGlite): Promise<{
  user: string;
  otherUser: string;
  ruleset: string;
  deal: string;
  competition: string;
}> {
  const user = "00000000-0000-0000-0000-000000000705";
  const otherUser = "00000000-0000-0000-0000-000000000706";
  const game = "00000000-0000-0000-0000-000000000707";
  const ruleset = "00000000-0000-0000-0000-000000000708";
  const deal = "00000000-0000-0000-0000-000000000709";
  const competition = "00000000-0000-0000-0000-000000000710";

  await db.exec(`
    INSERT INTO public."users" ("id", "email", "password_hash")
    VALUES
      ('${user}', 'stage-two-upgrade@example.test', 'not-a-real-password-hash'),
      ('${otherUser}', 'stage-two-upgrade-other@example.test', 'not-a-real-password-hash');
    INSERT INTO public."game_definitions" ("id", "key", "public_name")
    VALUES ('${game}', 'STAGE_TWO_UPGRADE_TEST', 'Stage Two Upgrade Test');
    INSERT INTO public."ruleset_versions" (
      "id", "game_definition_id", "version", "rules", "scoring", "immutable_at"
    ) VALUES (
      '${ruleset}', '${game}', 'v1', '{"draw":3}'::jsonb,
      '{"version":"MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1"}'::jsonb,
      '2025-12-01T00:00:00Z'
    );
    INSERT INTO public."deals" (
      "id", "ruleset_version_id", "seed_ciphertext", "seed_commitment",
      "canonical_deal_hash", "immutable_at"
    ) VALUES (
      '${deal}', '${ruleset}', 'stage-two-upgrade-ciphertext',
      '${"c".repeat(64)}', '${"d".repeat(64)}', '2025-12-01T00:00:00Z'
    );
    INSERT INTO public."deal_validations" (
      "deal_id", "validator_key", "validator_version", "status",
      "evidence_hash", "evidence", "validated_at"
    ) VALUES (
      '${deal}', 'stage-two-upgrade', 'v1', 'VERIFIED_SOLVABLE',
      '${"e".repeat(64)}', '{}'::jsonb, '2025-12-01T00:00:00Z'
    );
    INSERT INTO public."competitions" (
      "id", "public_name", "status", "deal_id", "ruleset_version_id",
      "opens_at", "closes_at", "published_at"
    ) VALUES (
      '${competition}', 'Stage Two Upgrade Competition', 'OPEN', '${deal}',
      '${ruleset}', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z',
      '2025-12-15T00:00:00Z'
    )
  `);

  return { user, otherUser, ruleset, deal, competition };
}

async function expectStageTwoPreflightReject(
  seed: (
    database: PGlite,
    fixture: Awaited<ReturnType<typeof seedStageTwoCompetitionFoundation>>,
  ) => Promise<void>,
  expectedMessage: string,
): Promise<void> {
  const database = new PGlite();
  await database.waitReady;
  try {
    await applyMigrations(database, [
      ...migrationFilesBeforeTruthRepair,
      truthRepairMigration,
    ]);
    const fixture = await seedStageTwoCompetitionFoundation(database);
    await seed(database, fixture);

    await expect(applyMigration(database, stageTwoMigration)).rejects.toThrow(
      expectedMessage,
    );
    const originalMoveIndex = await database.query<{
      predicate: string | null;
    }>(`
      SELECT pg_get_expr(indexes.indpred, indexes.indrelid) AS "predicate"
      FROM pg_index AS indexes
      JOIN pg_class AS index_class
        ON index_class.oid = indexes.indexrelid
      WHERE index_class.relname = 'move_events_session_sequence_unique'
    `);
    expect(originalMoveIndex.rows[0]?.predicate).toBeNull();
  } finally {
    await database.close();
  }
}

async function seedLedgerFoundation(db: PGlite): Promise<void> {
  await db.exec(`
    INSERT INTO public."ledgers" ("id", "ledger_type", "status")
    VALUES
      ('${playLedger}', 'PLAY_COIN', 'ACTIVE'),
      ('${cashLedger}', 'CASINO_CASH_USD', 'RESERVED_DISABLED');
    INSERT INTO public."ledger_accounts"
      ("id", "ledger_id", "account_code", "currency")
    VALUES
      ('${debitAccount}', '${playLedger}', 'SYSTEM', 'PLAY_COIN'),
      ('${creditAccount}', '${playLedger}', 'PLAYER', 'PLAY_COIN')
  `);
}

async function insertBalancedTransaction(
  db: PGlite,
  transaction: Readonly<{
    id: string;
    idempotencyKey: string;
    referenceType: string;
    referenceId: string;
    amount: number;
  }>,
): Promise<void> {
  await db.exec("BEGIN");
  try {
    await db.exec(`
      INSERT INTO public."ledger_transactions"
        ("id", "ledger_id", "ledger_type", "idempotency_key", "reference_type", "reference_id", "reason", "actor_id")
      VALUES
        ('${transaction.id}', '${playLedger}', 'PLAY_COIN', '${transaction.idempotencyKey}', '${transaction.referenceType}', '${transaction.referenceId}', 'test', 'test')
    `);
    await db.exec(`
      INSERT INTO public."ledger_entries"
        ("transaction_id", "account_id", "ledger_id", "direction", "amount_minor", "currency")
      VALUES
        ('${transaction.id}', '${debitAccount}', '${playLedger}', 'DEBIT', ${transaction.amount}, 'PLAY_COIN'),
        ('${transaction.id}', '${creditAccount}', '${playLedger}', 'CREDIT', ${transaction.amount}, 'PLAY_COIN')
    `);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function expectPgReject(
  db: PGlite,
  sql: string,
  expectedMessage: string,
): Promise<void> {
  await expect(db.exec(sql)).rejects.toThrow(expectedMessage);
}

async function expectCommitReject(
  db: PGlite,
  sql: string,
  expectedMessage: string,
): Promise<void> {
  await db.exec("BEGIN");
  try {
    await db.exec(sql);
    await expect(db.exec("COMMIT")).rejects.toThrow(expectedMessage);
  } finally {
    await db.exec("ROLLBACK").catch(() => undefined);
  }
}
