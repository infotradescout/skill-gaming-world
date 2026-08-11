import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  canonicalJson,
  createCuratedSolvableKlondikeDeal,
  CURATED_SOLUTION_PROOF_VERSION,
  OFFICIAL_SCORE_VERSION,
  replayCuratedSolvableDeal,
  sha256Hex,
} from "@/domain";

import type { DemoGameSession, DemoUser } from "./demo-store";
import {
  advancePersistentCompetitionLifecycle,
  enterPersistentCompetition,
  persistentCompetitionSnapshot,
  persistentCompetitionSnapshotById,
  persistentLeaderboard,
} from "./persistent-competition";
import { persistentPlayerProjection } from "./persistent-projections";

const databaseState = vi.hoisted(() => ({
  database: undefined as unknown,
}));

vi.mock("@/db/client", () => ({
  getDatabase: () => databaseState.database,
}));

const migrationFiles = [
  "0000_eager_garia.sql",
  "0001_chemical_screwball.sql",
  "0002_volatile_hammerhead.sql",
  "0003_wealthy_speed.sql",
  "0004_lowly_nightcrawler.sql",
  "0005_strange_night_thrasher.sql",
  "0006_dusty_charles_xavier.sql",
  "0007_fortune_dice_rounds.sql",
  "0008_draw_three_truth_repair.sql",
  "0009_monetaire_two_account_reality.sql",
] as const;

let client: PGlite;

function lifecycleUser(index: number): DemoUser {
  return {
    id: `00000000-0000-0000-0000-${String(91_000 + index).padStart(12, "0")}`,
    email: `lifecycle-${index}@example.test`,
    displayName: `Lifecycle Player ${index}`,
    passwordHash: "not-a-real-password-hash",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    acceptedPlayCoinTermsVersion: "PLAY_COIN_TERMS_V1",
    acceptedPlayCoinTermsAt: "2026-01-01T00:00:00.000Z",
    adminRoles: [],
  };
}

async function seedUsers(users: DemoUser[]) {
  for (const user of users) {
    await client.query(
      `
        INSERT INTO "users" ("id", "email", "password_hash")
        VALUES ($1, $2, $3)
      `,
      [user.id, user.email, user.passwordHash],
    );
    await client.query(
      `
        INSERT INTO "user_profiles" ("user_id", "display_name")
        VALUES ($1, $2)
      `,
      [user.id, user.displayName],
    );
  }
}

async function seedAllowedDecision(user: DemoUser, suffix: number) {
  const jurisdictionDecisionId = `00000000-0000-0000-0000-${String(
    93_000 + suffix,
  ).padStart(12, "0")}`;
  await client.query(
    `
      INSERT INTO "jurisdiction_decisions" (
        "id", "user_id", "product_mode", "decision",
        "rule_version", "location_evidence_status", "request_id"
      ) VALUES ($1, $2, 'MONETAIRE_PLAY', 'ALLOW', 'TEST_V1', 'APPROVED', $3)
    `,
    [jurisdictionDecisionId, user.id, `lifecycle-decision-${suffix}`],
  );
  return jurisdictionDecisionId;
}

async function forcePublishedCompetitionExpired(competitionId: string) {
  const clock = await client.query<{ observed_at: Date }>(
    'SELECT clock_timestamp() AS "observed_at"',
  );
  const closesAt = clock.rows[0].observed_at;
  const opensAt = new Date(closesAt.getTime() - 7 * 24 * 60 * 60 * 1_000);
  const publishedAt = new Date(opensAt.getTime() - 1);
  await client.exec(
    'ALTER TABLE "competitions" DISABLE TRIGGER "competitions_publication_freeze"',
  );
  try {
    await client.query(
      `
        UPDATE "competitions"
        SET
          "opens_at" = $2,
          "closes_at" = $3,
          "published_at" = $4,
          "updated_at" = $3
        WHERE "id" = $1
      `,
      [competitionId, opensAt, closesAt, publishedAt],
    );
  } finally {
    await client.exec(
      'ALTER TABLE "competitions" ENABLE TRIGGER "competitions_publication_freeze"',
    );
  }
  return closesAt.getTime();
}

async function openPublishedCompetition() {
  let competition = await persistentCompetitionSnapshot();
  if (competition.status === "ACTIVE") return competition;
  expect(competition.status).toBe("PUBLISHED");
  await client.exec(
    'ALTER TABLE "competitions" DISABLE TRIGGER "competitions_publication_freeze"',
  );
  try {
    await client.query(
      `
        UPDATE "competitions"
        SET "opens_at" = clock_timestamp() - INTERVAL '1 millisecond',
            "updated_at" = clock_timestamp()
        WHERE "id" = $1
      `,
      [competition.competitionId],
    );
  } finally {
    await client.exec(
      'ALTER TABLE "competitions" ENABLE TRIGGER "competitions_publication_freeze"',
    );
  }
  competition = await persistentCompetitionSnapshot();
  expect(competition.status).toBe("ACTIVE");
  return competition;
}

function skewApplicationClockAhead(appAheadServerMs: number) {
  const realNow = Date.now.bind(Date);
  return vi.spyOn(Date, "now").mockImplementation(() => {
    // PGlite implements PostgreSQL's independent server clock through this
    // WASM import. Keep that path real while skewing application Date.now().
    const stack = new Error().stack ?? "";
    return stack.includes("_emscripten_date_now")
      ? realNow()
      : appAheadServerMs;
  });
}

beforeAll(async () => {
  process.env.DEMO_MODE = "false";
  process.env.DATABASE_URL =
    "postgresql://configured:configured@127.0.0.1:5432/configured";
  process.env.SESSION_SECRET =
    "persistent-lifecycle-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "persistent-lifecycle-ranked-key-at-least-32-characters";
  process.env.PREVIEW_OWNER_EMAIL = "owner@example.test";

  client = new PGlite();
  await client.waitReady;
  for (const migration of migrationFiles) {
    const migrationSql = readFileSync(
      resolve(process.cwd(), "drizzle", migration),
      "utf8",
    );
    for (const statement of migrationSql
      .split("--> statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean)) {
      await client.exec(statement);
    }
  }
  databaseState.database = drizzle(client, { schema });
});

beforeEach(async () => {
  vi.useRealTimers();
  await client.exec(
    'TRUNCATE TABLE "audit_events", "users", "game_definitions" CASCADE',
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await client.close();
});

describe("configured competition lifecycle", () => {
  it("does not advance the global lifecycle for an unknown competition id", async () => {
    const competition = await openPublishedCompetition();
    await forcePublishedCompetitionExpired(competition.competitionId);

    await expect(
      persistentCompetitionSnapshotById(
        "00000000-0000-4000-8000-000000099999",
      ),
    ).resolves.toBeNull();

    const persisted = await client.query<{
      status: string;
      closed_at: Date | null;
    }>(
      `
        SELECT "status", "closed_at"
        FROM "competitions"
        WHERE "id" = $1
      `,
      [competition.competitionId],
    );
    expect(persisted.rows).toEqual([{ status: "OPEN", closed_at: null }]);
  });

  it("publishes only after persisting a mechanically replayable deal proof", async () => {
    const competition = await persistentCompetitionSnapshot();
    expect(competition.status).toBe("PUBLISHED");
    const persisted = await client.query<{
      deal_id: string;
      evidence: Record<string, unknown>;
      evidence_hash: string;
      validated_at: Date;
      published_at: Date;
      opens_at: Date;
    }>(
      `
        SELECT
          validation."deal_id",
          validation."evidence",
          validation."evidence_hash",
          validation."validated_at",
          competition."published_at",
          competition."opens_at"
        FROM "competitions" AS competition
        JOIN "deal_validations" AS validation
          ON validation."deal_id" = competition."deal_id"
        WHERE competition."id" = $1
      `,
      [competition.competitionId],
    );
    const proofRecord = persisted.rows[0];
    expect(proofRecord).toBeDefined();
    expect(proofRecord.validated_at.getTime()).toBeLessThanOrEqual(
      proofRecord.published_at.getTime(),
    );
    expect(
      proofRecord.opens_at.getTime() - proofRecord.published_at.getTime(),
    ).toBeGreaterThanOrEqual(5_000);
    expect(proofRecord.evidence).toMatchObject({
      protocol: CURATED_SOLUTION_PROOF_VERSION,
      rulesetVersion: "KLONDIKE_DRAW_THREE_V2",
      dealGeneratorVersion: "CURATED_SOLVABLE_V1",
      acceptedMoveCount: 81,
      finalStatus: "WON",
      finalEventHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      transcriptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      evidenceReference: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      logicalTranscriptStartedAtMs: 0,
      logicalEventStepMs: 1,
    });
    expect(proofRecord.evidence_hash).toBe(
      sha256Hex(canonicalJson(proofRecord.evidence)),
    );

    await forcePublishedCompetitionExpired(competition.competitionId);
    await advancePersistentCompetitionLifecycle();
    const closed = await persistentCompetitionSnapshotById(
      competition.competitionId,
    );
    expect(closed?.seedReveal).toEqual(expect.any(String));
    const replay = replayCuratedSolvableDeal({
      dealId: proofRecord.deal_id,
      deal: createCuratedSolvableKlondikeDeal(closed!.seedReveal!),
      validationStartedAtServerMs: Number(
        proofRecord.evidence.logicalTranscriptStartedAtMs,
      ),
    });
    expect(replay).toMatchObject({
      proofVersion: proofRecord.evidence.protocol,
      acceptedMoveCount: proofRecord.evidence.acceptedMoveCount,
      finalStatus: proofRecord.evidence.finalStatus,
      finalEventHash: proofRecord.evidence.finalEventHash,
      transcriptHash: proofRecord.evidence.transcriptHash,
    });
  });

  it("caps recent history at 20 while counting lifetime completed sessions", async () => {
    const account = lifecycleUser(40);
    await seedUsers([account]);
    const competition = await openPublishedCompetition();

    await client.query(
      `
        INSERT INTO "game_sessions" (
          "user_id", "deal_id", "ruleset_version_id", "status",
          "session_mode", "state_snapshot", "activity_clock_snapshot",
          "seed_ciphertext", "started_at", "last_active_at", "completed_at"
        )
        SELECT
          $1,
          competition."deal_id",
          competition."ruleset_version_id",
          'COMPLETED',
          'PRACTICE',
          '{}'::jsonb,
          '{}'::jsonb,
          'test-only-seed-ciphertext',
          TIMESTAMPTZ '2026-01-01T00:00:00Z' + generated.ordinal * INTERVAL '1 minute',
          TIMESTAMPTZ '2026-01-01T00:00:00Z' + generated.ordinal * INTERVAL '1 minute',
          TIMESTAMPTZ '2026-01-01T00:00:00Z' + generated.ordinal * INTERVAL '1 minute'
        FROM "competitions" AS competition
        CROSS JOIN generate_series(1, 25) AS generated(ordinal)
        WHERE competition."id" = $2
      `,
      [account.id, competition.competitionId],
    );

    const projection = await persistentPlayerProjection(account.id);

    expect(projection.recentSessions).toHaveLength(20);
    expect(projection.completedGames).toBe(25);
    expect(
      projection.recentSessions.every(
        (session) => session.status === "COMPLETED",
      ),
    ).toBe(true);
  });

  it("uses authoritative evidence time for achievement award upserts", async () => {
    const account = lifecycleUser(41);
    await seedUsers([account]);
    const competition = await persistentCompetitionSnapshot();
    const sessionId = "00000000-0000-0000-0000-000000094100";
    const scoreId = "00000000-0000-0000-0000-000000094101";
    const sessionTerminalAt = new Date("2026-02-03T04:04:00.000Z");
    const scoreComputedAt = new Date("2026-02-03T04:05:06.000Z");

    await client.query(
      `
        INSERT INTO "game_sessions" (
          "id", "user_id", "deal_id", "ruleset_version_id", "status",
          "session_mode", "state_snapshot", "activity_clock_snapshot",
          "seed_ciphertext", "started_at", "last_active_at", "completed_at"
        )
        SELECT
          $1,
          $2,
          competition."deal_id",
          competition."ruleset_version_id",
          'COMPLETED',
          'PRACTICE',
          '{}'::jsonb,
          '{}'::jsonb,
          'test-only-seed-ciphertext',
          TIMESTAMPTZ '2026-02-03T04:00:00Z',
          TIMESTAMPTZ '2026-02-03T04:04:00Z',
          TIMESTAMPTZ '2026-02-03T04:04:00Z'
        FROM "competitions" AS competition
        WHERE competition."id" = $3
      `,
      [sessionId, account.id, competition.competitionId],
    );
    await client.query(
      `
        INSERT INTO "scores" (
          "id", "game_session_id", "completed", "valid_move_count",
          "verified_active_duration_ms", "scoring_version", "computed_at"
        ) VALUES ($1, $2, true, 81, 240000, $3, $4)
      `,
      [scoreId, sessionId, OFFICIAL_SCORE_VERSION, scoreComputedAt],
    );
    await client.query(
      `
        WITH inserted_achievement AS (
          INSERT INTO "achievements" (
            "key", "title", "description", "criteria"
          ) VALUES (
            'FIRST_FOUNDATION',
            'First Foundation',
            'Complete a practice game.',
            '{"completedPracticeGames":1}'::jsonb
          )
          ON CONFLICT ("key") DO UPDATE
          SET "title" = EXCLUDED."title"
          RETURNING "id"
        )
        INSERT INTO "user_achievements" (
          "user_id", "achievement_id", "evidence", "awarded_at"
        )
        SELECT
          $1,
          "id",
          '{"source":"STALE_TEST_EVIDENCE"}'::jsonb,
          TIMESTAMPTZ '2030-01-01T00:00:00Z'
        FROM inserted_achievement
      `,
      [account.id],
    );

    const projection = await persistentPlayerProjection(account.id);
    const displayedAward = projection.achievements.find(
      (achievement) => achievement.key === "FIRST_FOUNDATION",
    );
    expect(displayedAward).toMatchObject({
      awardedAt: sessionTerminalAt.toISOString(),
      evidence: {
        gameSessionId: sessionId,
        scoreId,
      },
    });

    const persistedAward = await client.query<{
      awarded_at: Date;
      evidence: Record<string, unknown>;
    }>(
      `
        SELECT award."awarded_at", award."evidence"
        FROM "user_achievements" AS award
        JOIN "achievements" AS achievement
          ON achievement."id" = award."achievement_id"
        WHERE award."user_id" = $1
          AND achievement."key" = 'FIRST_FOUNDATION'
      `,
      [account.id],
    );
    expect(persistedAward.rows).toEqual([
      {
        awarded_at: sessionTerminalAt,
        evidence: expect.objectContaining({
          gameSessionId: sessionId,
          scoreId,
        }),
      },
    ]);
  });

  it("ties live scoreless entrants and gives each an immediate current rank", async () => {
    const users = [lifecycleUser(30), lifecycleUser(31)];
    await seedUsers(users);
    const competition = await openPublishedCompetition();
    const sessions: DemoGameSession[] = [];
    for (const [index, account] of users.entries()) {
      sessions.push(
        await enterPersistentCompetition(
          account,
          competition.competitionId,
          await seedAllowedDecision(account, 30 + index),
        ),
      );
    }

    const liveStandings = await persistentLeaderboard(
      competition.competitionId,
    );
    expect(liveStandings).toHaveLength(2);
    expect(liveStandings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rank: 1,
          tied: true,
          completed: false,
          scoreId: null,
          validMoveCount: 0,
        }),
        expect.objectContaining({
          rank: 1,
          tied: true,
          completed: false,
          scoreId: null,
          validMoveCount: 0,
        }),
      ]),
    );
    for (const [index, account] of users.entries()) {
      expect(await persistentPlayerProjection(account.id)).toMatchObject({
        currentRank: {
          competitionId: competition.competitionId,
          entryId: sessions[index].competitionEntryId,
          rank: 1,
          tied: true,
        },
      });
    }
    const liveEvidence = await persistentCompetitionSnapshotById(
      competition.competitionId,
    );
    expect(liveEvidence?.finalLeaderboardSnapshot).toBeNull();

    await forcePublishedCompetitionExpired(competition.competitionId);
    await advancePersistentCompetitionLifecycle();
    const closedEvidence = await persistentCompetitionSnapshotById(
      competition.competitionId,
    );
    expect(closedEvidence).toMatchObject({
      status: "CLOSED",
      standings: [
        { rank: 1, tied: true, completed: false },
        { rank: 1, tied: true, completed: false },
      ],
      finalLeaderboardSnapshot: {
        scoringVersion: OFFICIAL_SCORE_VERSION,
        standings: [
          { rank: 1, tied: true },
          { rank: 1, tied: true },
        ],
      },
    });
    expect(
      closedEvidence?.standings.every((standing) => Boolean(standing.scoreId)),
    ).toBe(true);
  });

  it("advances an unobserved expiry before dashboard/history projection reads", async () => {
    const account = lifecycleUser(20);
    await seedUsers([account]);

    const competition = await openPublishedCompetition();
    const jurisdictionDecisionId = await seedAllowedDecision(account, 20);
    const session = await enterPersistentCompetition(
      account,
      competition.competitionId,
      jurisdictionDecisionId,
    );
    const closesAtServerMs = await forcePublishedCompetitionExpired(
      competition.competitionId,
    );

    const before = await client.query<{
      competition_status: string;
      session_status: string;
    }>(
      `
        SELECT
          competition."status" AS "competition_status",
          session."status" AS "session_status"
        FROM "game_sessions" AS session
        JOIN "competition_entries" AS entry
          ON entry."id" = session."competition_entry_id"
        JOIN "competitions" AS competition
          ON competition."id" = entry."competition_id"
        WHERE session."id" = $1
      `,
      [session.id],
    );
    expect(before.rows[0]).toEqual({
      competition_status: "OPEN",
      session_status: "ACTIVE",
    });

    const appAheadServerMs =
      closesAtServerMs + 30 * 24 * 60 * 60 * 1_000;
    const appClock = skewApplicationClockAhead(appAheadServerMs);
    expect(Date.now()).toBe(appAheadServerMs);
    const projection = await persistentPlayerProjection(account.id);
    appClock.mockRestore();

    expect(projection.currentRank).toBeNull();
    expect(projection.recentSessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: session.id,
          status: "ABANDONED",
          scoreCompleted: false,
        }),
      ]),
    );
    const after = await client.query<{
      competition_status: string;
      session_status: string;
      completed: boolean;
      revealed_at: Date;
    }>(
      `
        SELECT
          competition."status" AS "competition_status",
          session."status" AS "session_status",
          score."completed",
          deal."revealed_at"
        FROM "game_sessions" AS session
        JOIN "competition_entries" AS entry
          ON entry."id" = session."competition_entry_id"
        JOIN "competitions" AS competition
          ON competition."id" = entry."competition_id"
        JOIN "deals" AS deal
          ON deal."id" = competition."deal_id"
        JOIN "scores" AS score
          ON score."game_session_id" = session."id"
         AND score."superseded_by_score_id" IS NULL
        WHERE session."id" = $1
      `,
      [session.id],
    );
    expect(after.rows[0]).toEqual({
      competition_status: "CLOSED",
      session_status: "ABANDONED",
      completed: false,
      revealed_at: expect.any(Date),
    });
    expect(after.rows[0].revealed_at.getTime()).toBeGreaterThanOrEqual(
      closesAtServerMs,
    );
    expect(after.rows[0].revealed_at.getTime()).toBeLessThan(appAheadServerMs);
  });

  it("closes once, terminalizes at the cutoff, snapshots canonical ranks, reveals, and rolls one successor", async () => {
    const users = Array.from({ length: 6 }, (_, index) =>
      lifecycleUser(index + 1),
    );
    await seedUsers(users);

    const initial = await openPublishedCompetition();
    const sessions: DemoGameSession[] = [];
    for (const [index, user] of users.entries()) {
      const jurisdictionDecisionId = await seedAllowedDecision(user, index);
      sessions.push(
        await enterPersistentCompetition(
          user,
          initial.competitionId,
          jurisdictionDecisionId,
        ),
      );
    }
    const closesAtServerMs = await forcePublishedCompetitionExpired(
      initial.competitionId,
    );
    const evidenceBaseServerMs = closesAtServerMs - 10_000;

    const completedScores = [
      { sessionId: sessions[0].id, moves: 80, duration: 5_000 },
      { sessionId: sessions[1].id, moves: 81, duration: 4_000 },
      { sessionId: sessions[2].id, moves: 81, duration: 4_000 },
      { sessionId: sessions[3].id, moves: 81, duration: 4_500 },
    ];
    for (const score of completedScores) {
      await client.query(
        `
          UPDATE "game_sessions"
          SET
            "status" = 'COMPLETED',
            "state_snapshot" = jsonb_set(
              jsonb_set("state_snapshot", '{status}', '"WON"'::jsonb),
              '{validMoveCount}',
              to_jsonb($2::integer)
            ),
            "activity_clock_snapshot" = jsonb_build_object(
              'status', 'FINALIZED',
              'accumulatedActiveMs', $3::integer,
              'runningSinceServerMs', null,
              'lastServerEventMs', $4::bigint
            ),
            "active_duration_ms" = $3,
            "last_active_at" = $5,
            "completed_at" = $5,
            "updated_at" = $5
          WHERE "id" = $1
        `,
        [
          score.sessionId,
          score.moves,
          score.duration,
          evidenceBaseServerMs + score.duration,
          new Date(evidenceBaseServerMs + score.duration),
        ],
      );
      await client.query(
        `
          INSERT INTO "scores" (
            "game_session_id",
            "completed",
            "valid_move_count",
            "verified_active_duration_ms",
            "scoring_version",
            "computed_at"
          ) VALUES ($1, true, $2, $3, $4, $5)
        `,
        [
          score.sessionId,
          score.moves,
          score.duration,
          OFFICIAL_SCORE_VERSION,
          new Date(evidenceBaseServerMs + score.duration),
        ],
      );
    }

    const incompleteScores = [
      { sessionId: sessions[4].id, moves: 7, duration: 1_000 },
      { sessionId: sessions[5].id, moves: 23, duration: 9_000 },
    ];
    for (const score of incompleteScores) {
      await client.query(
        `
          UPDATE "game_sessions"
          SET
            "state_snapshot" = jsonb_set(
              "state_snapshot",
              '{validMoveCount}',
              to_jsonb($2::integer)
            ),
            "activity_clock_snapshot" = jsonb_build_object(
              'status', 'PAUSED',
              'accumulatedActiveMs', $3::integer,
              'runningSinceServerMs', null,
              'lastServerEventMs', $4::bigint
            ),
            "active_duration_ms" = $3,
            "updated_at" = $5
          WHERE "id" = $1
        `,
        [
          score.sessionId,
          score.moves,
          score.duration,
          evidenceBaseServerMs + 100,
          new Date(evidenceBaseServerMs + 100),
        ],
      );
    }

    const database = databaseState.database as ReturnType<
      typeof drizzle<typeof schema>
    >;
    let releaseSessionLock = () => {};
    let reportSessionLock = () => {};
    const releaseBarrier = new Promise<void>((resolve) => {
      releaseSessionLock = resolve;
    });
    const lockBarrier = new Promise<void>((resolve) => {
      reportSessionLock = resolve;
    });
    const inFlightMoveCommit = database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(
          hashtext('MONETAIRE_GAME_SESSION_V1'),
          hashtext(${sessions[4].id})
        )`,
      );
      reportSessionLock();
      await releaseBarrier;
      const [record] = await transaction
        .select({ stateSnapshot: schema.gameSessions.stateSnapshot })
        .from(schema.gameSessions)
        .where(eq(schema.gameSessions.id, sessions[4].id))
        .limit(1);
      if (!record) throw new Error("TEST_SESSION_MISSING");
      await transaction
        .update(schema.gameSessions)
        .set({
          stateSnapshot: {
            ...record.stateSnapshot,
            validMoveCount: 33,
          },
        })
        .where(eq(schema.gameSessions.id, sessions[4].id));
    });
    await lockBarrier;

    const appAheadServerMs =
      closesAtServerMs + 30 * 24 * 60 * 60 * 1_000;
    const appClock = skewApplicationClockAhead(appAheadServerMs);
    expect(Date.now()).toBe(appAheadServerMs);
    let lifecycleSettled = false;
    const blockedLifecycle = advancePersistentCompetitionLifecycle().finally(
      () => {
        lifecycleSettled = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lifecycleSettled).toBe(false);
    releaseSessionLock();
    const [firstLifecycle] = await Promise.all([
      blockedLifecycle,
      inFlightMoveCommit,
    ]);
    appClock.mockRestore();

    const lifecycleResults = await Promise.all([
      Promise.resolve(firstLifecycle),
      advancePersistentCompetitionLifecycle(),
      advancePersistentCompetitionLifecycle(),
      persistentCompetitionSnapshot(),
    ]);
    const successorIds = lifecycleResults.map((result) =>
      "current" in result ? result.current.id : result.competitionId,
    );
    expect(new Set(successorIds).size).toBe(1);
    expect(successorIds[0]).not.toBe(initial.competitionId);

    const closed = await persistentCompetitionSnapshotById(
      initial.competitionId,
    );
    expect(closed).toMatchObject({
      competitionId: initial.competitionId,
      status: "CLOSED",
      rulesetVersion: "KLONDIKE_DRAW_THREE_V2",
      scoringVersion: OFFICIAL_SCORE_VERSION,
      dealGeneratorVersion: "CURATED_SOLVABLE_V1",
      seedVerified: true,
      entryCount: 6,
      standings: [
        {
          rank: 1,
          completed: true,
          validMoveCount: 80,
          verifiedActiveDurationMs: 5_000,
          tied: false,
        },
        {
          rank: 2,
          completed: true,
          validMoveCount: 81,
          verifiedActiveDurationMs: 4_000,
          tied: true,
        },
        {
          rank: 2,
          completed: true,
          validMoveCount: 81,
          verifiedActiveDurationMs: 4_000,
          tied: true,
        },
        {
          rank: 4,
          completed: true,
          validMoveCount: 81,
          verifiedActiveDurationMs: 4_500,
          tied: false,
        },
        {
          rank: 5,
          completed: false,
          tied: true,
        },
        {
          rank: 5,
          completed: false,
          tied: true,
        },
      ],
    });
    expect(closed?.seedReveal).toEqual(expect.any(String));
    expect(closed?.revealedAtServerMs).toBeGreaterThanOrEqual(
      closesAtServerMs,
    );
    expect(closed?.revealedAtServerMs).toBeLessThan(appAheadServerMs);
    expect(closed?.canonicalDealHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      closed?.standings
        .filter((standing) => !standing.completed)
        .map((standing) => standing.validMoveCount),
    ).toContain(33);

    const finalSnapshot = closed?.finalLeaderboardSnapshot;
    expect(finalSnapshot).not.toBeNull();
    const expectedSnapshotHash = sha256Hex(
      canonicalJson({
        competitionId: initial.competitionId,
        scoringVersion: OFFICIAL_SCORE_VERSION,
        standings: finalSnapshot?.standings,
      }),
    );
    expect(finalSnapshot?.snapshotHash).toBe(expectedSnapshotHash);

    const persistence = await client.query<{
      active_competitions: number;
      old_snapshots: number;
      old_scores: number;
      old_active_sessions: number;
      linked_eligibility_decisions: number;
    }>(
      `
        SELECT
          (
            SELECT count(*)::int
            FROM "competitions"
            WHERE "status" IN ('PUBLISHED', 'OPEN')
              AND "id" <> $1
          ) AS "active_competitions",
          (
            SELECT count(*)::int
            FROM "leaderboard_snapshots"
            WHERE "competition_id" = $1
          ) AS "old_snapshots",
          (
            SELECT count(*)::int
            FROM "scores" AS score
            JOIN "game_sessions" AS session
              ON session."id" = score."game_session_id"
            JOIN "competition_entries" AS entry
              ON entry."id" = session."competition_entry_id"
            WHERE entry."competition_id" = $1
              AND score."superseded_by_score_id" IS NULL
          ) AS "old_scores",
          (
            SELECT count(*)::int
            FROM "game_sessions" AS session
            JOIN "competition_entries" AS entry
              ON entry."id" = session."competition_entry_id"
            WHERE entry."competition_id" = $1
              AND session."status" = 'ACTIVE'
          ) AS "old_active_sessions",
          (
            SELECT count(*)::int
            FROM "competition_entries"
            WHERE "competition_id" = $1
              AND "eligibility_decision_id" IS NOT NULL
          ) AS "linked_eligibility_decisions"
      `,
      [initial.competitionId],
    );
    expect(persistence.rows[0]).toEqual({
      active_competitions: 1,
      old_snapshots: 1,
      old_scores: 6,
      old_active_sessions: 0,
      linked_eligibility_decisions: 6,
    });

    const terminalized = await client.query<{
      id: string;
      status: string;
      state_status: string;
      clock_status: string;
      clock_finalized_at: number;
      abandoned_at: Date | null;
      last_active_at: Date;
    }>(
      `
        SELECT
          "id",
          "status",
          "state_snapshot" ->> 'status' AS "state_status",
          "activity_clock_snapshot" ->> 'status' AS "clock_status",
          ("activity_clock_snapshot" ->> 'lastServerEventMs')::bigint
            AS "clock_finalized_at",
          "abandoned_at",
          "last_active_at"
        FROM "game_sessions"
        WHERE "id" IN ($1, $2)
        ORDER BY "id"
      `,
      [sessions[4].id, sessions[5].id],
    );
    for (const session of terminalized.rows) {
      expect(session).toMatchObject({
        status: "ABANDONED",
        state_status: "ABANDONED",
        clock_status: "FINALIZED",
      });
      expect(Number(session.clock_finalized_at)).toBe(
        closesAtServerMs,
      );
      expect(session.abandoned_at?.getTime()).toBe(closesAtServerMs);
      expect(session.last_active_at.getTime()).toBe(closesAtServerMs);
    }

    const successor = await openPublishedCompetition();
    expect(successor).toMatchObject({
      competitionId: successorIds[0],
      status: "ACTIVE",
      seedReveal: null,
      revealedAtServerMs: null,
      canonicalDealHash: null,
      seedVerified: null,
      entryCount: 0,
      finalLeaderboardSnapshot: null,
    });
  });

  it("projects persisted historical contract metadata without inventing current V2 values", async () => {
    const ids = {
      definition: "00000000-0000-0000-0000-000000092001",
      ruleset: "00000000-0000-0000-0000-000000092002",
      deal: "00000000-0000-0000-0000-000000092003",
      competition: "00000000-0000-0000-0000-000000092004",
    };
    const historicalEvidence = {
      protocol: "HISTORICAL_PROOF_V0",
      dealGeneratorVersion: "SHA256_FISHER_YATES_V1",
    };
    await client.query(
      `
        INSERT INTO "game_definitions" ("id", "key", "public_name")
        VALUES ($1, 'HISTORICAL_MONETAIRE', 'Historical Monetaire')
      `,
      [ids.definition],
    );
    await client.query(
      `
        INSERT INTO "ruleset_versions" (
          "id", "game_definition_id", "version", "rules", "scoring", "immutable_at"
        ) VALUES (
          $1,
          $2,
          'KLONDIKE_DRAW_THREE_V1',
          '{"draw":1,"redeals":"unlimited","valuablePrize":false}',
          '{"version":"HISTORICAL_SCORE_V0"}',
          '2025-01-01T00:00:00Z'
        )
      `,
      [ids.ruleset, ids.definition],
    );
    await client.query(
      `
        INSERT INTO "deals" (
          "id", "ruleset_version_id", "seed_ciphertext", "seed_commitment",
          "canonical_deal_hash", "immutable_at"
        ) VALUES (
          $1, $2, 'HISTORICAL_SEED_HELD', repeat('a', 64), repeat('b', 64),
          '2025-01-01T00:00:00Z'
        )
      `,
      [ids.deal, ids.ruleset],
    );
    await client.query(
      `
        INSERT INTO "deal_validations" (
          "deal_id", "validator_key", "validator_version", "status"
        ) VALUES ($1, 'HISTORICAL_PENDING_SOLVER', 'V0', 'PENDING')
      `,
      [ids.deal],
    );
    await client.query(
      `
        INSERT INTO "deal_validations" (
          "deal_id", "validator_key", "validator_version", "status",
          "evidence_hash", "evidence", "validated_at"
        ) VALUES (
          $1,
          'HISTORICAL_SOLVER',
          'V0',
          'VERIFIED_SOLVABLE',
          $2,
          $3::jsonb,
          '2025-01-01T00:00:00Z'
        )
      `,
      [
        ids.deal,
        sha256Hex(canonicalJson(historicalEvidence)),
        JSON.stringify(historicalEvidence),
      ],
    );
    await client.query(
      `
        INSERT INTO "competitions" (
          "id", "public_name", "status", "deal_id", "ruleset_version_id",
          "opens_at", "closes_at", "published_at", "closed_at"
        ) VALUES (
          $1,
          'Historical cancelled competition',
          'CANCELLED',
          $2,
          $3,
          '2025-01-02T00:00:00Z',
          '2025-01-09T00:00:00Z',
          '2025-01-01T00:00:00Z',
          '2025-01-02T00:00:00Z'
        )
      `,
      [ids.competition, ids.deal, ids.ruleset],
    );

    const historical = await persistentCompetitionSnapshotById(
      ids.competition,
    );
    expect(historical).toMatchObject({
      competitionId: ids.competition,
      status: "CANCELLED",
      rulesetVersion: "KLONDIKE_DRAW_THREE_V1",
      scoringVersion: "HISTORICAL_SCORE_V0",
      dealGeneratorVersion: "SHA256_FISHER_YATES_V1",
      validation: {
        status: "VERIFIED_SOLVABLE",
        protocol: "HISTORICAL_PROOF_V0",
        validatorKey: "HISTORICAL_SOLVER",
        validatorVersion: "V0",
      },
      seedReveal: null,
      revealedAtServerMs: null,
      canonicalDealHash: null,
      seedVerified: null,
      entryCount: 0,
      finalLeaderboardSnapshot: null,
    });
  });
});
