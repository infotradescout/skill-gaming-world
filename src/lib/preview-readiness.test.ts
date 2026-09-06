import { PGlite } from "@electric-sql/pglite";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/db/client";
import { GET as health } from "@/app/api/health/route";
import journal from "../../drizzle/meta/_journal.json";
import { configuredDatabaseFingerprint, getRuntimeEnv } from "./env";

vi.mock("@/db/client", () => ({ getDatabase: vi.fn() }));

const managedEnvironmentKeys = [
  "DEMO_MODE", "DATABASE_URL", "SESSION_SECRET", "COMPETITION_SEED_ENCRYPTION_KEY",
  "PREVIEW_OWNER_EMAIL", "CONFIGURED_E2E_TARGET_ID", "FEATURE_MONETAIRE_PRIZE",
  "FEATURE_SOCIAL_CASINO", "FEATURE_REAL_MONEY_CASINO", "FEATURE_PRODUCTION_PAYMENTS",
  "MONETAIRE_PLAY_JURISDICTIONS", "MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION",
] as const;
const originalEnvironment = Object.fromEntries(
  managedEnvironmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof managedEnvironmentKeys)[number], string | undefined>;

function configurePreview() {
  process.env.DEMO_MODE = "false";
  process.env.DATABASE_URL = "postgresql://configured:configured@127.0.0.1:5432/configured";
  process.env.SESSION_SECRET = "configured-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY = "configured-ranked-seed-key-at-least-32-characters";
  process.env.PREVIEW_OWNER_EMAIL = " Owner@Example.COM ";
  process.env.CONFIGURED_E2E_TARGET_ID = "configured-preview-test-target";
  process.env.FEATURE_MONETAIRE_PRIZE = "false";
  process.env.FEATURE_SOCIAL_CASINO = "false";
  process.env.FEATURE_REAL_MONEY_CASINO = "false";
  process.env.FEATURE_PRODUCTION_PAYMENTS = "false";
  process.env.MONETAIRE_PLAY_JURISDICTIONS = "US";
  process.env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION = "US";
}

const migrationReceipts = journal.entries.map((entry) => ({
  createdAt: String(entry.when), hash: "a".repeat(64),
}));
const readyTruth = {
  correctRulesetCount: 1, untrackedMistakeCount: 0,
  activeSupersededCompetitionCount: 0, activeProoflessV2CompetitionCount: 0,
  terminalSessionMissingScoreCount: 0, stageTwoInvariantCount: 13, auditChainInvalidCount: 0,
};
function mockReadyDatabase(
  truthOverrides: Record<string, number> = {},
  options: { migrations?: typeof migrationReceipts; robotSchemaReady?: boolean } = {},
) {
  const execute = vi.fn()
    .mockResolvedValueOnce([{ coreTableCount: 10, journalTableCount: 1, robotSchemaReady: options.robotSchemaReady ?? true }])
    .mockResolvedValueOnce(options.migrations ?? migrationReceipts)
    .mockResolvedValueOnce([{ ...readyTruth, ...truthOverrides }]);
  vi.mocked(getDatabase).mockReturnValue({ execute } as never);
}

type AuditLink = { id: string; eventHash: string; previousEventHash: string | null };

async function healthWithAuditGraph(events: AuditLink[]) {
  const client = new PGlite();
  await client.waitReady;
  const topologyDatabase = drizzle(client);
  try {
    await client.exec(`
      create table public."game_definitions" ("id" text, "key" text);
      create table public."ruleset_versions" (
        "id" text, "game_definition_id" text, "version" text, "rules" jsonb,
        "scoring" jsonb, "immutable_at" timestamptz
      );
      create table public."ruleset_supersessions" ("superseded_ruleset_version_id" text);
      create table public."competitions" ("ruleset_version_id" text, "status" text, "deal_id" text);
      create table public."deal_validations" ("deal_id" text, "status" text, "evidence" jsonb);
      create table public."game_sessions" ("id" text, "status" text);
      create table public."scores" ("game_session_id" text, "superseded_by_score_id" text);
      create table public."audit_events" (
        "id" text primary key, "event_hash" text not null, "previous_event_hash" text
      );
    `);
    for (const event of events) {
      await topologyDatabase.execute(sql`
        insert into public."audit_events" ("id", "event_hash", "previous_event_hash")
        values (${event.id}, ${event.eventHash}, ${event.previousEventHash})
      `);
    }
    let executionCount = 0;
    let queryFailure: unknown;
    let observedAuditChainInvalidCount: number | undefined;
    const execute = vi.fn(async (query: unknown) => {
      executionCount += 1;
      if (executionCount === 1) return [{ coreTableCount: 10, journalTableCount: 1, robotSchemaReady: true }];
      if (executionCount === 2) return migrationReceipts;
      const topologyQuery = new PgDialect().sqlToQuery(query as SQL).sql;
      expect(topologyQuery).toContain('array[event."event_hash"::text]::text[]');
      expect(topologyQuery).toMatch(/array_append\(\s*parent\.visited_event_hashes,\s*child\."event_hash"::text\s*\)::text\[\]/);
      let queryResult;
      try {
        queryResult = await topologyDatabase.execute(query as never);
      } catch (error) {
        queryFailure = error;
        throw error;
      }
      const rows = Array.isArray(queryResult) ? queryResult : queryResult.rows;
      const status = rows[0] as { auditChainInvalidCount?: number | string } | undefined;
      observedAuditChainInvalidCount = Number(status?.auditChainInvalidCount);
      return [{ ...readyTruth, auditChainInvalidCount: status?.auditChainInvalidCount ?? 1 }];
    });
    vi.mocked(getDatabase).mockReturnValue({ execute } as never);
    const response = await health();
    if (queryFailure) throw queryFailure;
    expect(executionCount).toBe(3);
    expect(observedAuditChainInvalidCount).not.toBeUndefined();
    return { response, auditChainInvalidCount: observedAuditChainInvalidCount };
  } finally {
    await client.close();
  }
}

beforeEach(() => { configurePreview(); vi.mocked(getDatabase).mockReset(); });
afterEach(() => {
  for (const key of managedEnvironmentKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("configured private preview boundaries", () => {
  it("normalizes the configured preview verification owner email", () => {
    expect(getRuntimeEnv().PREVIEW_OWNER_EMAIL).toBe("owner@example.com");
  });
  it("keeps the verification owner optional at environment-parse time", () => {
    delete process.env.PREVIEW_OWNER_EMAIL;
    expect(getRuntimeEnv().PREVIEW_OWNER_EMAIL).toBeUndefined();
  });
  it("requires the complete Monetaire migration history", async () => {
    mockReadyDatabase({}, { migrations: migrationReceipts.slice(0, 9) });
    const response = await health();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not-ready", dependencies: { database: "ready", schema: "unavailable" },
      operations: { monetairePlay: false, robotCombatFree: false },
    });
  });
  it("does not report Robot Combat ready on the ten-migration baseline", async () => {
    mockReadyDatabase({}, { migrations: migrationReceipts.slice(0, 10) });
    const response = await health();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      dependencies: { schema: "ready", robotCombatSchema: "unavailable" },
      operations: { monetairePlay: true, robotCombatFree: false },
    });
  });
  it("does not treat an unrelated extra journal row as the Robot Combat migration", async () => {
    mockReadyDatabase({}, { migrations: [...migrationReceipts.slice(0, 10), { createdAt: "9999999999999", hash: "b".repeat(64) }] });
    const response = await health();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ operations: { robotCombatFree: false } });
  });
  it("requires Robot Combat structures even when every migration is journaled", async () => {
    mockReadyDatabase({}, { robotSchemaReady: false });
    const response = await health();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      dependencies: { schema: "ready", robotCombatSchema: "unavailable" },
      operations: { monetairePlay: true, robotCombatFree: false },
    });
  });
  it("reports ready only after both games' required foundations pass", async () => {
    mockReadyDatabase();
    const response = await health();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      verificationTarget: {
        id: "configured-preview-test-target",
        databaseFingerprint: configuredDatabaseFingerprint(process.env.DATABASE_URL),
      },
      dependencies: {
        configuration: "ready", database: "ready", schema: "ready", robotCombatSchema: "ready",
        jurisdiction: "ready", previewOwner: "ready",
      },
      operations: {
        monetairePlay: true, robotCombatFree: true, monetairePrize: false,
        socialCasino: false, realMoneyCasino: false, productionPayments: false,
      },
    });
  });
  it.each([
    ["Stage 2 database guards are missing", { stageTwoInvariantCount: 12 }],
    ["a superseded ruleset is still active", { activeSupersededCompetitionCount: 1 }],
    ["an active V2 competition lacks replay proof", { activeProoflessV2CompetitionCount: 1 }],
    ["a terminal session lacks an active score", { terminalSessionMissingScoreCount: 1 }],
    ["audit history has multiple heads or a dangling link", { auditChainInvalidCount: 1 }],
  ] satisfies Array<[string, Record<string, number>]>) ("fails health when %s", async (_name, overrides) => {
    mockReadyDatabase(overrides);
    const response = await health();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not-ready", dependencies: { schema: "unavailable" },
      operations: { monetairePlay: false, robotCombatFree: false },
    });
  });
  it("reports owner verification unavailable without a configured identity", async () => {
    delete process.env.PREVIEW_OWNER_EMAIL;
    mockReadyDatabase();
    const response = await health();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      dependencies: { schema: "ready", previewOwner: "unavailable" },
      operations: { monetairePlay: false, robotCombatFree: false },
    });
  });
  it.each([
    ["an empty history", [], 200],
    ["one complete linear chain", [
      { id: "root", eventHash: "root-hash", previousEventHash: null },
      { id: "middle", eventHash: "middle-hash", previousEventHash: "root-hash" },
      { id: "head", eventHash: "head-hash", previousEventHash: "middle-hash" },
    ], 200],
    ["multiple roots", [
      { id: "root-a", eventHash: "root-a-hash", previousEventHash: null },
      { id: "root-b", eventHash: "root-b-hash", previousEventHash: null },
    ], 503],
    ["a dangling parent link", [
      { id: "orphan", eventHash: "orphan-hash", previousEventHash: "missing-hash" },
    ], 503],
    ["a forked parent", [
      { id: "root", eventHash: "root-hash", previousEventHash: null },
      { id: "left", eventHash: "left-hash", previousEventHash: "root-hash" },
      { id: "right", eventHash: "right-hash", previousEventHash: "root-hash" },
    ], 503],
    ["a disconnected cycle hidden beside a valid root-to-head chain", [
      { id: "root", eventHash: "root-hash", previousEventHash: null },
      { id: "head", eventHash: "head-hash", previousEventHash: "root-hash" },
      { id: "cycle-a", eventHash: "cycle-a-hash", previousEventHash: "cycle-b-hash" },
      { id: "cycle-b", eventHash: "cycle-b-hash", previousEventHash: "cycle-a-hash" },
    ], 503],
  ] satisfies Array<[string, AuditLink[], number]>) ("accepts only a complete audit topology: %s", async (_name, events, expectedStatus) => {
    const { response, auditChainInvalidCount } = await healthWithAuditGraph(events);
    expect(auditChainInvalidCount).toBe(expectedStatus === 200 ? 0 : 1);
    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject({
      status: expectedStatus === 200 ? "ok" : "not-ready",
      dependencies: { schema: expectedStatus === 200 ? "ready" : "unavailable" },
      operations: { monetairePlay: expectedStatus === 200, robotCombatFree: expectedStatus === 200 },
    });
  });
});
