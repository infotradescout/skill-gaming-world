import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { hashKlondikeGameState } from "@/domain";

import { appendRuntimeAuditEvent } from "./audit";
import type { DemoUser } from "./demo-store";
import { GameServiceError } from "./game-service";
import {
  ensurePersistentCompetition,
  enterPersistentCompetition,
  persistentCompetitionSnapshot,
} from "./persistent-competition";
import {
  createPersistentPracticeSession,
  submitPersistentMove,
} from "./persistent-game";

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
  await client.exec(
    'TRUNCATE TABLE "audit_events", "users", "game_definitions" CASCADE',
  );
});

afterAll(async () => {
  await client.close();
});

async function seedUser() {
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

describe("configured multi-instance convergence", () => {
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

    const moves = await client.query<{ game_session_id: string }>(
      'SELECT "game_session_id" FROM "move_events"',
    );
    expect(moves.rows).toHaveLength(2);
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

    const snapshot = await persistentCompetitionSnapshot();
    const entries = await Promise.allSettled([
      enterPersistentCompetition(user, snapshot.competitionId),
      enterPersistentCompetition(user, snapshot.competitionId),
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
