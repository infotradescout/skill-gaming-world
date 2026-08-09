import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
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
  createCuratedSolutionIntents,
  hashKlondikeGameState,
  OFFICIAL_SCORE_VERSION,
} from "@/domain";

import { appendRuntimeAuditEvent } from "./audit";
import type { DemoUser } from "./demo-store";
import { GameServiceError, publicGameSession } from "./game-service";
import {
  ensurePersistentCompetition,
  enterPersistentCompetition,
  persistentCompetitionSnapshot,
} from "./persistent-competition";
import {
  createPersistentPracticeSession,
  listActivePersistentSessions,
  resumePersistentSession,
  submitPersistentMove,
} from "./persistent-game";
import { refreshPersistentAchievements } from "./persistent-projections";

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

const userId = "00000000-0000-0000-0000-000000009001";
const user: DemoUser = {
  id: userId,
  email: "concurrency@example.test",
  displayName: "Concurrency Player",
  passwordHash: "not-a-real-password-hash",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  acceptedPlayCoinTermsVersion: "PLAY_COIN_TERMS_V1",
  acceptedPlayCoinTermsAt: "2026-01-01T00:00:00.000Z",
  adminRoles: [],
};
const otherUser: DemoUser = {
  ...user,
  id: "00000000-0000-0000-0000-000000009002",
  email: "concurrency-other@example.test",
  displayName: "Other Concurrency Player",
};

let client: PGlite;

beforeAll(async () => {
  process.env.DEMO_MODE = "false";
  process.env.DATABASE_URL =
    "postgresql://configured:configured@127.0.0.1:5432/configured";
  process.env.SESSION_SECRET =
    "persistent-concurrency-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "persistent-concurrency-ranked-key-at-least-32-characters";
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

async function seedUser(account: DemoUser = user) {
  await client.query(
    `
      INSERT INTO "users" ("id", "email", "password_hash")
      VALUES ($1, $2, $3)
    `,
    [account.id, account.email, account.passwordHash],
  );
  await client.query(
    `
      INSERT INTO "user_profiles" ("user_id", "display_name")
      VALUES ($1, $2)
    `,
    [account.id, account.displayName],
  );
}

async function seedJurisdictionDecision(input: {
  decisionUserId?: string;
  productMode?: "MONETAIRE_PLAY" | "MONETAIRE_PRIZE";
  decision?: "ALLOW" | "DENY";
} = {}) {
  const id = randomUUID();
  await client.query(
    `
      INSERT INTO "jurisdiction_decisions" (
        "id", "user_id", "product_mode", "decision",
        "rule_version", "location_evidence_status", "request_id"
      ) VALUES (
        $1,
        $2,
        $3::"product_mode",
        $4::"eligibility_decision",
        'TEST_V1',
        'APPROVED',
        $5
      )
    `,
    [
      id,
      input.decisionUserId ?? user.id,
      input.productMode ?? "MONETAIRE_PLAY",
      input.decision ?? "ALLOW",
      `concurrency-decision-${randomUUID()}`,
    ],
  );
  return id;
}

function skewApplicationClock(appServerMs: number) {
  const realNow = Date.now.bind(Date);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(appServerMs);
  vi.spyOn(Date, "now").mockImplementation(() => {
    // PGlite obtains PostgreSQL time through this WASM import. Preserve that
    // independent database clock while skewing all application Date reads.
    const stack = new Error().stack ?? "";
    return stack.includes("_emscripten_date_now") ? realNow() : appServerMs;
  });
}

async function forceCompetitionExpiredAtDatabaseClock(competitionId: string) {
  const clock = await client.query<{ observed_at: Date }>(
    'SELECT clock_timestamp() AS "observed_at"',
  );
  const closesAt = new Date(clock.rows[0].observed_at.getTime() - 5_000);
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
          "updated_at" = clock_timestamp()
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

async function openPersistentCompetition() {
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

describe("configured multi-instance convergence", () => {
  it("labels an exact retry of a legacy partial rejection without inventing evidence", async () => {
    await seedUser();
    const session = await createPersistentPracticeSession(user);
    const priorStateHash = hashKlondikeGameState(session.state);
    const command = {
      sequence: 1,
      priorStateHash,
      intent: { type: "WASTE_TO_FOUNDATION" as const },
    };
    await client.query(
      `
        INSERT INTO "move_events" (
          "game_session_id", "sequence", "idempotency_key", "move_type",
          "move_payload", "state_hash_before", "state_hash_after",
          "server_received_at", "accepted", "rejection_code"
        ) VALUES (
          $1, 1, 'legacy-partial-rejection', 'WASTE_TO_FOUNDATION',
          $2::jsonb, $3, $3, clock_timestamp(), false, 'ILLEGAL_MOVE'
        )
      `,
      [session.id, JSON.stringify({ command }), priorStateHash],
    );

    const replay = await submitPersistentMove({
      user,
      sessionId: session.id,
      actionId: "legacy-partial-rejection",
      ...command,
    });

    expect(replay.result).toMatchObject({
      accepted: false,
      code: "ILLEGAL_MOVE",
      message:
        "Legacy persisted rejection (ILLEGAL_MOVE); the original message was not recorded.",
    });
    const count = await client.query<{ count: number }>(
      'SELECT count(*)::integer AS "count" FROM "move_events" WHERE "game_session_id" = $1',
      [session.id],
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  it("serializes concurrent audit appends into one unbroken chain", async () => {
    await Promise.all([
      appendRuntimeAuditEvent({
        eventType: "CONCURRENT_AUDIT_A",
        actorId: "system-a",
        subjectType: "TEST",
        subjectId: "audit-chain",
        reason: "First concurrent append.",
      }),
      appendRuntimeAuditEvent({
        eventType: "CONCURRENT_AUDIT_B",
        actorId: "system-b",
        subjectType: "TEST",
        subjectId: "audit-chain",
        reason: "Second concurrent append.",
      }),
    ]);

    const result = await client.query<{
      event_hash: string;
      previous_event_hash: string | null;
    }>(
      `
        SELECT "event_hash", "previous_event_hash"
        FROM "audit_events"
      `,
    );
    expect(result.rows).toHaveLength(2);
    const roots = result.rows.filter(
      (event) => event.previous_event_hash === null,
    );
    expect(roots).toHaveLength(1);
    expect(
      result.rows.find((event) => event.previous_event_hash !== null)
        ?.previous_event_hash,
    ).toBe(roots[0].event_hash);
  });

  it("converges exact move retries and rejects competing same-sequence actions", async () => {
    await seedUser();

    const exactSession = await createPersistentPracticeSession(user);
    const exactCommand = {
      user,
      sessionId: exactSession.id,
      actionId: "concurrent-exact-action",
      sequence: 1,
      priorStateHash: hashKlondikeGameState(exactSession.state),
      intent: { type: "DRAW_STOCK" } as const,
    };
    const exactResults = await Promise.all([
      submitPersistentMove(exactCommand),
      submitPersistentMove(exactCommand),
    ]);
    expect(exactResults.every(({ result }) => result.accepted)).toBe(true);
    expect(
      exactResults
        .map(({ result }) =>
          result.accepted ? result.idempotentReplay : undefined,
        )
        .toSorted(),
    ).toEqual([false, true]);

    const competingSession = await createPersistentPracticeSession(user);
    const priorStateHash = hashKlondikeGameState(competingSession.state);
    const competingResults = await Promise.all([
      submitPersistentMove({
        user,
        sessionId: competingSession.id,
        actionId: "concurrent-action-left",
        sequence: 1,
        priorStateHash,
        intent: { type: "DRAW_STOCK" },
      }),
      submitPersistentMove({
        user,
        sessionId: competingSession.id,
        actionId: "concurrent-action-right",
        sequence: 1,
        priorStateHash,
        intent: { type: "DRAW_STOCK" },
      }),
    ]);
    expect(
      competingResults.filter(({ result }) => result.accepted),
    ).toHaveLength(1);
    const rejected = competingResults.find(({ result }) => !result.accepted);
    expect(rejected?.result).toMatchObject({
      accepted: false,
      code: "REPLAYED_SEQUENCE",
    });

    const moves = await client.query<{
      game_session_id: string;
      accepted: boolean;
    }>(
      'SELECT "game_session_id", "accepted" FROM "move_events"',
    );
    expect(moves.rows).toHaveLength(3);
    expect(
      moves.rows.filter(
        (move) => move.game_session_id === competingSession.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accepted: true }),
        expect.objectContaining({ accepted: false }),
      ]),
    );
  });

  it("replays a jsonb-reordered multi-field move after later state advances", async () => {
    await seedUser();

    const session = await createPersistentPracticeSession(user);
    const firstCandidate = {
      type: "TABLEAU_TO_TABLEAU" as const,
      fromColumn: 1,
      startIndex: 1,
      toColumn: 0,
    };
    const secondCandidate = {
      type: "TABLEAU_TO_TABLEAU" as const,
      fromColumn: 2,
      startIndex: 2,
      toColumn: 1,
    };
    const firstSource = session.state.tableau[1]?.[1]?.card;
    const firstDestination = session.state.tableau[0]?.[0]?.card;
    if (!firstSource || !firstDestination) {
      throw new Error("Curated tableau fixture is incomplete");
    }
    const intent =
      firstSource.color !== firstDestination.color
        ? firstCandidate
        : secondCandidate;
    const command = {
      user,
      sessionId: session.id,
      actionId: "multi-field-jsonb-action",
      sequence: 1,
      priorStateHash: hashKlondikeGameState(session.state),
      intent,
    };

    const accepted = await submitPersistentMove(command);
    expect(accepted.result).toMatchObject({
      accepted: true,
      idempotentReplay: false,
    });
    if (!accepted.result.accepted) {
      throw new Error(`Expected accepted tableau move: ${accepted.result.code}`);
    }

    const later = await submitPersistentMove({
      user,
      sessionId: session.id,
      actionId: "multi-field-later-abandon",
      sequence: 2,
      priorStateHash: hashKlondikeGameState(accepted.session.state),
      intent: { type: "ABANDON" },
    });
    expect(later.result).toMatchObject({ accepted: true });

    const replay = await submitPersistentMove(command);
    expect(replay.result).toMatchObject({
      accepted: true,
      idempotentReplay: true,
      outcome: accepted.result.outcome,
    });
    expect(replay.session.state).toMatchObject({
      status: "ABANDONED",
      lastSequence: 2,
    });
  });

  it("replays a rejected command and accepts a corrected command at the same sequence", async () => {
    await seedUser();

    const session = await createPersistentPracticeSession(user);
    const priorStateHash = hashKlondikeGameState(session.state);
    const rejectedCommand = {
      user,
      sessionId: session.id,
      actionId: "rejected-command-action",
      sequence: 1,
      priorStateHash,
      intent: { type: "WASTE_TO_FOUNDATION" } as const,
    };
    const rejected = await submitPersistentMove(rejectedCommand);
    expect(rejected.result).toMatchObject({
      accepted: false,
      code: "ILLEGAL_MOVE",
    });

    const exactRetry = await submitPersistentMove(rejectedCommand);
    expect(exactRetry.result).toEqual(rejected.result);

    const reusedAction = await submitPersistentMove({
      ...rejectedCommand,
      intent: { type: "DRAW_STOCK" },
    });
    expect(reusedAction.result).toMatchObject({
      accepted: false,
      code: "IDEMPOTENCY_CONFLICT",
    });

    const corrected = await submitPersistentMove({
      ...rejectedCommand,
      actionId: "corrected-command-action",
      intent: { type: "DRAW_STOCK" },
    });
    expect(corrected.result).toMatchObject({
      accepted: true,
      idempotentReplay: false,
    });
    expect(corrected.session.state.lastSequence).toBe(1);

    const lateRetry = await submitPersistentMove(rejectedCommand);
    expect(lateRetry.result).toEqual(rejected.result);
    expect(lateRetry.session.state.lastSequence).toBe(1);

    const moves = await client.query<{
      accepted: boolean;
      rejection_code: string | null;
    }>(
      `
        SELECT "accepted", "rejection_code"
        FROM "move_events"
        WHERE "game_session_id" = $1
        ORDER BY "created_at", "id"
      `,
      [session.id],
    );
    expect(moves.rows).toHaveLength(3);
    expect(moves.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accepted: false,
          rejection_code: "ILLEGAL_MOVE",
        }),
        expect.objectContaining({
          accepted: false,
          rejection_code: "IDEMPOTENCY_CONFLICT",
        }),
        expect.objectContaining({ accepted: true, rejection_code: null }),
      ]),
    );
  });

  it(
    "audits changed reuse of an accepted action id and withholds Clean Sequence",
    async () => {
      await seedUser();

      const intents = createCuratedSolutionIntents();
      let session = await createPersistentPracticeSession(user);
      const reusedActionId = "accepted-then-conflicting-reuse";
      const first = await submitPersistentMove({
        user,
        sessionId: session.id,
        actionId: reusedActionId,
        sequence: 1,
        priorStateHash: hashKlondikeGameState(session.state),
        intent: intents[0],
      });
      if (!first.result.accepted) {
        throw new Error(`Initial accepted move failed: ${first.result.code}`);
      }
      session = first.session;

      const conflictingCommand = {
        user,
        sessionId: session.id,
        actionId: reusedActionId,
        sequence: 2,
        priorStateHash: hashKlondikeGameState(session.state),
        intent: intents[1],
      };
      const conflict = await submitPersistentMove(conflictingCommand);
      expect(conflict.result).toMatchObject({
        accepted: false,
        code: "IDEMPOTENCY_CONFLICT",
      });

      for (const [offset, intent] of intents.slice(1).entries()) {
        const sequence = offset + 2;
        const move = await submitPersistentMove({
          user,
          sessionId: session.id,
          actionId: `post-conflict-cleanup-${sequence}`,
          sequence,
          priorStateHash: hashKlondikeGameState(session.state),
          intent,
        });
        if (!move.result.accepted) {
          throw new Error(
            `Completion after conflict failed at sequence ${sequence}: ${move.result.code}`,
          );
        }
        session = move.session;
      }
      expect(session.state.status).toBe("WON");

      const exactConflictRetry = await submitPersistentMove(conflictingCommand);
      expect(exactConflictRetry.result).toEqual(conflict.result);
      expect(exactConflictRetry.session.state.status).toBe("WON");

      const rejected = await client.query<{
        accepted: boolean;
        rejection_code: string | null;
      }>(
        `
          SELECT "accepted", "rejection_code"
          FROM "move_events"
          WHERE "game_session_id" = $1 AND NOT "accepted"
        `,
        [session.id],
      );
      expect(rejected.rows).toEqual([
        { accepted: false, rejection_code: "IDEMPOTENCY_CONFLICT" },
      ]);

      const achievements = await refreshPersistentAchievements(user.id);
      expect(
        achievements.find((achievement) => achievement.key === "CLEAN_SEQUENCE"),
      ).toMatchObject({ awardedAt: null, evidence: null });
    },
    30_000,
  );

  it(
    "persists completed and abandoned terminals with authoritative scores",
    async () => {
      await seedUser();

      let practice = await createPersistentPracticeSession(user);
      for (const [index, intent] of createCuratedSolutionIntents().entries()) {
        const move = await submitPersistentMove({
          user,
          sessionId: practice.id,
          actionId: `terminal-practice-action-${index + 1}`,
          sequence: index + 1,
          priorStateHash: hashKlondikeGameState(practice.state),
          intent,
        });
        if (!move.result.accepted) {
          throw new Error(
            `Practice terminal setup failed at sequence ${index + 1}: ${move.result.code}`,
          );
        }
        practice = move.session;
      }
      expect(practice.state.status).toBe("WON");
      const earnedBeforeTerminalAttempt = await refreshPersistentAchievements(
        user.id,
      );
      expect(
        earnedBeforeTerminalAttempt.find(
          (achievement) => achievement.key === "CLEAN_SEQUENCE",
        ),
      ).toMatchObject({
        awardedAt: expect.any(String),
        evidence: expect.objectContaining({ gameSessionId: practice.id }),
      });

      const rejectedAfterTerminal = await submitPersistentMove({
        user,
        sessionId: practice.id,
        actionId: "terminal-practice-post-completion-rejection",
        sequence: practice.state.lastSequence + 1,
        priorStateHash: hashKlondikeGameState(practice.state),
        intent: { type: "DRAW_STOCK" },
      });
      expect(rejectedAfterTerminal.result.accepted).toBe(false);
      const earnedAfterTerminalAttempt = await refreshPersistentAchievements(
        user.id,
      );
      expect(
        earnedAfterTerminalAttempt.find(
          (achievement) => achievement.key === "CLEAN_SEQUENCE",
        ),
      ).toMatchObject({
        awardedAt: expect.any(String),
        evidence: expect.objectContaining({ gameSessionId: practice.id }),
      });

      const abandonedPracticeStart = await createPersistentPracticeSession(user);
      const abandonedPractice = await submitPersistentMove({
        user,
        sessionId: abandonedPracticeStart.id,
        actionId: "terminal-practice-abandon-action",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(abandonedPracticeStart.state),
        intent: { type: "ABANDON" },
      });
      expect(abandonedPractice.result.accepted).toBe(true);
      expect(abandonedPractice.session.state.status).toBe("ABANDONED");

      const competition = await openPersistentCompetition();
      const jurisdictionDecisionId = await seedJurisdictionDecision();
      const ranked = await enterPersistentCompetition(
        user,
        competition.competitionId,
        jurisdictionDecisionId,
      );
      const abandoned = await submitPersistentMove({
        user,
        sessionId: ranked.id,
        actionId: "terminal-ranked-abandon-action",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(ranked.state),
        intent: { type: "ABANDON" },
      });
      expect(abandoned.result.accepted).toBe(true);
      expect(abandoned.session.state.status).toBe("ABANDONED");

      const terminalRows = await client.query<{
        id: string;
        status: string;
        active_duration_ms: bigint;
        completed_at: Date | null;
        abandoned_at: Date | null;
      }>(
        `
          SELECT
            "id",
            "status",
            "active_duration_ms",
            "completed_at",
            "abandoned_at"
          FROM "game_sessions"
          WHERE "id" IN ($1, $2, $3)
        `,
        [practice.id, abandonedPracticeStart.id, ranked.id],
      );
      const completedRow = terminalRows.rows.find(
        (row) => row.id === practice.id,
      );
      const abandonedRow = terminalRows.rows.find(
        (row) => row.id === ranked.id,
      );
      const abandonedPracticeRow = terminalRows.rows.find(
        (row) => row.id === abandonedPracticeStart.id,
      );
      expect(completedRow).toMatchObject({
        status: "COMPLETED",
        abandoned_at: null,
      });
      expect(completedRow?.completed_at).not.toBeNull();
      expect(Number(completedRow?.active_duration_ms)).toBeGreaterThanOrEqual(0);
      expect(abandonedRow).toMatchObject({
        status: "ABANDONED",
        completed_at: null,
      });
      expect(abandonedRow?.abandoned_at).not.toBeNull();
      expect(Number(abandonedRow?.active_duration_ms)).toBeGreaterThanOrEqual(0);
      expect(abandonedPracticeRow).toMatchObject({
        status: "ABANDONED",
        completed_at: null,
      });
      expect(abandonedPracticeRow?.abandoned_at).not.toBeNull();

      const scoreRows = await client.query<{
        game_session_id: string;
        completed: boolean;
        valid_move_count: number;
        verified_active_duration_ms: bigint;
        scoring_version: string;
      }>(
        `
          SELECT
            "game_session_id",
            "completed",
            "valid_move_count",
            "verified_active_duration_ms",
            "scoring_version"
          FROM "scores"
          WHERE "game_session_id" IN ($1, $2, $3)
        `,
        [practice.id, abandonedPracticeStart.id, ranked.id],
      );
      expect(scoreRows.rows).toHaveLength(3);
      expect(scoreRows.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            game_session_id: practice.id,
            completed: true,
            valid_move_count: 81,
            scoring_version: OFFICIAL_SCORE_VERSION,
          }),
          expect.objectContaining({
            game_session_id: ranked.id,
            completed: false,
            valid_move_count: 0,
            scoring_version: OFFICIAL_SCORE_VERSION,
          }),
          expect.objectContaining({
            game_session_id: abandonedPracticeStart.id,
            completed: false,
            valid_move_count: 0,
            scoring_version: OFFICIAL_SCORE_VERSION,
          }),
        ]),
      );
      for (const score of scoreRows.rows) {
        const terminal = terminalRows.rows.find(
          (row) => row.id === score.game_session_id,
        );
        expect(String(score.verified_active_duration_ms)).toBe(
          String(terminal?.active_duration_ms),
        );
      }
    },
    30_000,
  );

  it("creates and terminalizes practice on the database clock when the app clock is ahead", async () => {
    await seedUser();

    const before = await client.query<{ observed_at: Date }>(
      'SELECT clock_timestamp() AS "observed_at"',
    );
    const appAheadServerMs =
      before.rows[0].observed_at.getTime() + 30 * 24 * 60 * 60 * 1_000;
    skewApplicationClock(appAheadServerMs);
    expect(Date.now()).toBe(appAheadServerMs);

    const practice = await createPersistentPracticeSession(user);
    const createdAtMs = Date.parse(practice.createdAt);
    expect(createdAtMs).toBe(practice.activityClock.lastServerEventMs);
    expect(createdAtMs).toBeLessThan(appAheadServerMs);
    const creation = await client.query<{
      deal_immutable_at: Date;
      deal_created_at: Date;
      session_started_at: Date;
      session_last_active_at: Date;
      session_created_at: Date;
      session_updated_at: Date;
      clock_last_server_event_ms: bigint;
    }>(
      `
        SELECT
          deal."immutable_at" AS "deal_immutable_at",
          deal."created_at" AS "deal_created_at",
          session."started_at" AS "session_started_at",
          session."last_active_at" AS "session_last_active_at",
          session."created_at" AS "session_created_at",
          session."updated_at" AS "session_updated_at",
          (session."activity_clock_snapshot" ->> 'lastServerEventMs')::bigint
            AS "clock_last_server_event_ms"
        FROM "game_sessions" AS session
        JOIN "deals" AS deal ON deal."id" = session."deal_id"
        WHERE session."id" = $1
      `,
      [practice.id],
    );
    expect({
      ...creation.rows[0],
      clock_last_server_event_ms: Number(
        creation.rows[0].clock_last_server_event_ms,
      ),
    }).toEqual({
      deal_immutable_at: new Date(createdAtMs),
      deal_created_at: new Date(createdAtMs),
      session_started_at: new Date(createdAtMs),
      session_last_active_at: new Date(createdAtMs),
      session_created_at: new Date(createdAtMs),
      session_updated_at: new Date(createdAtMs),
      clock_last_server_event_ms: createdAtMs,
    });

    const moved = await submitPersistentMove({
      user,
      sessionId: practice.id,
      actionId: "practice-app-ahead-draw",
      sequence: 1,
      priorStateHash: hashKlondikeGameState(practice.state),
      intent: { type: "DRAW_STOCK" },
    });
    expect(moved.result.accepted).toBe(true);
    expect(() => publicGameSession(moved.session)).not.toThrow();
    expect(publicGameSession(moved.session).verifiedActivePlayMs).toBe(
      moved.session.activityClock.accumulatedActiveMs,
    );

    const abandoned = await submitPersistentMove({
      user,
      sessionId: practice.id,
      actionId: "practice-app-ahead-abandon",
      sequence: 2,
      priorStateHash: hashKlondikeGameState(moved.session.state),
      intent: { type: "ABANDON" },
    });
    expect(abandoned.result.accepted).toBe(true);
    expect(abandoned.session.state.status).toBe("ABANDONED");
    expect(() => publicGameSession(abandoned.session)).not.toThrow();
    expect(publicGameSession(abandoned.session).verifiedActivePlayMs).toBe(
      abandoned.session.activityClock.accumulatedActiveMs,
    );
    expect(abandoned.session.activityClock.lastServerEventMs).toBeLessThan(
      appAheadServerMs,
    );
  });

  it("uses one database clock for entry, ranked cutoff, event time, and terminal activity when the app clock is ahead", async () => {
    await seedUser();
    await seedUser(otherUser);

    const competition = await openPersistentCompetition();
    const ranked = await enterPersistentCompetition(
      user,
      competition.competitionId,
      await seedJurisdictionDecision(),
    );
    const otherDecisionId = await seedJurisdictionDecision({
      decisionUserId: otherUser.id,
    });
    const before = await client.query<{ observed_at: Date }>(
      'SELECT clock_timestamp() AS "observed_at"',
    );
    const appAheadServerMs =
      competition.closesAtServerMs + 30 * 24 * 60 * 60 * 1_000;
    skewApplicationClock(appAheadServerMs);
    expect(Date.now()).toBe(appAheadServerMs);

    const otherRanked = await enterPersistentCompetition(
      otherUser,
      competition.competitionId,
      otherDecisionId,
    );
    await expect(resumePersistentSession(user, ranked.id)).resolves.toMatchObject({
      id: ranked.id,
    });
    await expect(listActivePersistentSessions(user)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ranked.id })]),
    );

    const terminal = await submitPersistentMove({
      user,
      sessionId: ranked.id,
      actionId: "ranked-app-ahead-abandon",
      sequence: 1,
      priorStateHash: hashKlondikeGameState(ranked.state),
      intent: { type: "ABANDON" },
    });
    expect(terminal.result.accepted).toBe(true);
    if (!terminal.result.accepted) {
      throw new Error(`Ranked move failed: ${terminal.result.code}`);
    }
    const after = await client.query<{ observed_at: Date }>(
      'SELECT clock_timestamp() AS "observed_at"',
    );
    const evidence = await client.query<{
      server_received_at: Date;
      move_created_at: Date;
      payload_server_at_ms: bigint;
      last_active_at: Date;
      abandoned_at: Date;
      updated_at: Date;
      clock_last_server_event_ms: bigint;
      score_computed_at: Date;
      score_created_at: Date;
    }>(
      `
        SELECT
          move."server_received_at",
          move."created_at" AS "move_created_at",
          (move."move_payload" #>> '{outcome,event,serverReceivedAtMs}')::bigint
            AS "payload_server_at_ms",
          session."last_active_at",
          session."abandoned_at",
          session."updated_at",
          (session."activity_clock_snapshot" ->> 'lastServerEventMs')::bigint
            AS "clock_last_server_event_ms",
          score."computed_at" AS "score_computed_at",
          score."created_at" AS "score_created_at"
        FROM "move_events" AS move
        JOIN "game_sessions" AS session
          ON session."id" = move."game_session_id"
        JOIN "scores" AS score
          ON score."game_session_id" = session."id"
         AND score."superseded_by_score_id" IS NULL
        WHERE move."game_session_id" = $1
      `,
      [ranked.id],
    );
    const row = evidence.rows[0];
    const authoritativeMs = terminal.result.outcome.event.serverReceivedAtMs;
    expect(row.server_received_at.getTime()).toBe(authoritativeMs);
    expect(row.move_created_at.getTime()).toBe(authoritativeMs);
    expect(Number(row.payload_server_at_ms)).toBe(authoritativeMs);
    expect(row.last_active_at.getTime()).toBe(authoritativeMs);
    expect(row.abandoned_at.getTime()).toBe(authoritativeMs);
    expect(row.updated_at.getTime()).toBe(authoritativeMs);
    expect(Number(row.clock_last_server_event_ms)).toBe(authoritativeMs);
    expect(row.score_computed_at.getTime()).toBe(authoritativeMs);
    expect(row.score_created_at.getTime()).toBe(authoritativeMs);
    expect(authoritativeMs).toBeGreaterThanOrEqual(
      before.rows[0].observed_at.getTime(),
    );
    expect(authoritativeMs).toBeLessThanOrEqual(
      after.rows[0].observed_at.getTime(),
    );
    expect(authoritativeMs).toBeLessThan(appAheadServerMs);
    expect(Date.parse(otherRanked.createdAt)).toBeLessThan(appAheadServerMs);
  });

  it("safely projects a database-stamped persistent session while the app clock lags", async () => {
    await seedUser();

    const competition = await openPersistentCompetition();
    const ranked = await enterPersistentCompetition(
      user,
      competition.competitionId,
      await seedJurisdictionDecision(),
    );
    const appBehindServerMs = Date.parse(ranked.createdAt) - 60_000;
    skewApplicationClock(appBehindServerMs);
    expect(Date.now()).toBe(appBehindServerMs);

    const moved = await submitPersistentMove({
      user,
      sessionId: ranked.id,
      actionId: "ranked-app-behind-valid-move",
      sequence: 1,
      priorStateHash: hashKlondikeGameState(ranked.state),
      intent: { type: "DRAW_STOCK" },
    });
    expect(moved.result.accepted).toBe(true);
    expect(moved.session.activityClock.lastServerEventMs).toBeGreaterThan(
      Date.now(),
    );
    expect(() => publicGameSession(moved.session)).not.toThrow();
    expect(publicGameSession(moved.session).verifiedActivePlayMs).toBe(0);
  });

  it("replays prior actions but follows the database cutoff when the app clock is behind", async () => {
    await seedUser();
    await seedUser(otherUser);

    const competition = await openPersistentCompetition();
    const jurisdictionDecisionId = await seedJurisdictionDecision();
    const ranked = await enterPersistentCompetition(
      user,
      competition.competitionId,
      jurisdictionDecisionId,
    );
    const firstCommand = {
      user,
      sessionId: ranked.id,
      actionId: "ranked-before-expiry-action",
      sequence: 1,
      priorStateHash: hashKlondikeGameState(ranked.state),
      intent: { type: "DRAW_STOCK" } as const,
    };
    const first = await submitPersistentMove(firstCommand);
    expect(first.result.accepted).toBe(true);

    const closesAtServerMs = await forceCompetitionExpiredAtDatabaseClock(
      competition.competitionId,
    );
    const otherDecisionId = await seedJurisdictionDecision({
      decisionUserId: otherUser.id,
    });
    const appBehindServerMs = closesAtServerMs - 1_000;
    skewApplicationClock(appBehindServerMs);
    expect(Date.now()).toBe(appBehindServerMs);

    const databaseClock = await client.query<{ observed_at: Date }>(
      'SELECT clock_timestamp() AS "observed_at"',
    );
    expect(databaseClock.rows[0].observed_at.getTime()).toBeGreaterThan(
      closesAtServerMs,
    );
    const retry = await submitPersistentMove(firstCommand);
    expect(retry.result).toMatchObject({
      accepted: true,
      idempotentReplay: true,
    });
    await expect(resumePersistentSession(user, ranked.id)).rejects.toMatchObject({
      code: "SESSION_NOT_ACTIVE",
    });
    await expect(listActivePersistentSessions(user)).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ranked.id })]),
    );
    await expect(
      enterPersistentCompetition(
        otherUser,
        competition.competitionId,
        otherDecisionId,
      ),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
    await expect(
      submitPersistentMove({
        user,
        sessionId: ranked.id,
        actionId: "ranked-after-expiry-action",
        sequence: 2,
        priorStateHash: hashKlondikeGameState(first.session.state),
        intent: { type: "DRAW_STOCK" },
      }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });

    const moves = await client.query<{ id: string }>(
      'SELECT "id" FROM "move_events" WHERE "game_session_id" = $1',
      [ranked.id],
    );
    expect(moves.rows).toHaveLength(1);
  });

  it("requires a same-user allowed Monetaire Play decision in the entry transaction", async () => {
    await seedUser();
    await seedUser(otherUser);
    const competition = await openPersistentCompetition();
    const invalidDecisionIds: string[] = [
      null as unknown as string,
      randomUUID(),
      await seedJurisdictionDecision({ decisionUserId: otherUser.id }),
      await seedJurisdictionDecision({ productMode: "MONETAIRE_PRIZE" }),
      await seedJurisdictionDecision({ decision: "DENY" }),
    ];

    for (const jurisdictionDecisionId of invalidDecisionIds) {
      await expect(
        enterPersistentCompetition(
          user,
          competition.competitionId,
          jurisdictionDecisionId,
        ),
      ).rejects.toMatchObject({ code: "ACCOUNT_RESTRICTED" });
    }

    const before = await client.query<{ count: number }>(
      'SELECT count(*)::integer AS "count" FROM "competition_entries"',
    );
    expect(before.rows[0]?.count).toBe(0);

    const allowedDecisionId = await seedJurisdictionDecision();
    const session = await enterPersistentCompetition(
      user,
      competition.competitionId,
      allowedDecisionId,
    );
    const persisted = await client.query<{
      eligibility_decision_id: string;
      user_id: string;
    }>(
      `
        SELECT "eligibility_decision_id", "user_id"
        FROM "competition_entries"
        WHERE "id" = $1
      `,
      [session.competitionEntryId],
    );
    expect(persisted.rows).toEqual([
      {
        eligibility_decision_id: allowedDecisionId,
        user_id: user.id,
      },
    ]);

    const secondCompetition = await client.query<{ id: string }>(
      `
        INSERT INTO "competitions" (
          "public_name", "product_mode", "status", "deal_id",
          "ruleset_version_id", "opens_at", "closes_at", "published_at"
        )
        SELECT
          'Second eligibility reuse fixture',
          "product_mode",
          "status",
          "deal_id",
          "ruleset_version_id",
          "opens_at",
          "closes_at",
          "published_at"
        FROM "competitions"
        WHERE "id" = $1
        RETURNING "id"
      `,
      [competition.competitionId],
    );
    await expect(
      enterPersistentCompetition(
        user,
        secondCompetition.rows[0].id,
        allowedDecisionId,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_COMPETITION_ENTRY" });

    const afterReuse = await client.query<{ count: number }>(
      'SELECT count(*)::integer AS "count" FROM "competition_entries"',
    );
    expect(afterReuse.rows[0]?.count).toBe(1);
  });

  it("enforces eligibility linkage and immutable decisions inside Postgres", async () => {
    await seedUser();
    await seedUser(otherUser);
    const competition = await openPersistentCompetition();
    const competitionRecord = await client.query<{ deal_id: string }>(
      'SELECT "deal_id" FROM "competitions" WHERE "id" = $1',
      [competition.competitionId],
    );
    const dealId = competitionRecord.rows[0]?.deal_id;
    expect(dealId).toBeTypeOf("string");

    const wrongOwnerDecisionId = await seedJurisdictionDecision({
      decisionUserId: otherUser.id,
    });
    const wrongProductDecisionId = await seedJurisdictionDecision({
      productMode: "MONETAIRE_PRIZE",
    });
    const deniedDecisionId = await seedJurisdictionDecision({
      decision: "DENY",
    });
    const allowedDecisionId = await seedJurisdictionDecision();
    const insertEntry = (jurisdictionDecisionId: string | null) =>
      client.query(
        `
          INSERT INTO "competition_entries" (
            "competition_id", "user_id", "deal_id", "eligibility_decision_id"
          ) VALUES ($1, $2, $3, $4)
        `,
        [competition.competitionId, user.id, dealId, jurisdictionDecisionId],
      );

    for (const invalidDecisionId of [
      null,
      wrongOwnerDecisionId,
      wrongProductDecisionId,
      deniedDecisionId,
    ]) {
      await expect(insertEntry(invalidDecisionId)).rejects.toThrow(
        /requires an allowed Monetaire Play jurisdiction decision/i,
      );
    }

    await expect(insertEntry(allowedDecisionId)).resolves.toBeDefined();
    await expect(
      client.query(
        `
          UPDATE "jurisdiction_decisions"
          SET "decision" = 'DENY'
          WHERE "id" = $1
        `,
        [allowedDecisionId],
      ),
    ).rejects.toThrow(/jurisdiction_decisions history is append-only/i);

    const entries = await client.query<{
      eligibility_decision_id: string;
    }>(
      'SELECT "eligibility_decision_id" FROM "competition_entries"',
    );
    expect(entries.rows).toEqual([
      { eligibility_decision_id: allowedDecisionId },
    ]);
  });

  it("publishes once and maps duplicate concurrent entry to a domain conflict", async () => {
    await seedUser();

    const published = await Promise.all([
      ensurePersistentCompetition(),
      ensurePersistentCompetition(),
    ]);
    expect(published[0].id).toBe(published[1].id);

    const competitionRows = await client.query<{ id: string }>(
      'SELECT "id" FROM "competitions"',
    );
    const dealRows = await client.query<{ id: string }>(
      'SELECT "id" FROM "deals"',
    );
    expect(competitionRows.rows).toHaveLength(1);
    expect(dealRows.rows).toHaveLength(1);

    const snapshot = await openPersistentCompetition();
    expect(snapshot.rulesetVersion).toBe("KLONDIKE_DRAW_THREE_V2");
    const jurisdictionDecisionId = await seedJurisdictionDecision();
    const entries = await Promise.allSettled([
      enterPersistentCompetition(
        user,
        snapshot.competitionId,
        jurisdictionDecisionId,
      ),
      enterPersistentCompetition(
        user,
        snapshot.competitionId,
        jurisdictionDecisionId,
      ),
    ]);
    expect(entries.filter((entry) => entry.status === "fulfilled")).toHaveLength(
      1,
    );
    const duplicate = entries.find((entry) => entry.status === "rejected");
    expect(duplicate?.status).toBe("rejected");
    if (duplicate?.status === "rejected") {
      expect(duplicate.reason).toBeInstanceOf(GameServiceError);
      expect(duplicate.reason).toMatchObject({
        code: "DUPLICATE_COMPETITION_ENTRY",
      });
    }

    const entryRows = await client.query<{ id: string }>(
      'SELECT "id" FROM "competition_entries"',
    );
    const sessionRows = await client.query<{ id: string }>(
      `
        SELECT "id"
        FROM "game_sessions"
        WHERE "session_mode" = 'NONCASH_COMPETITION'
      `,
    );
    expect(entryRows.rows).toHaveLength(1);
    expect(sessionRows.rows).toHaveLength(1);
  });
});
