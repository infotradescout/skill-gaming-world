import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
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
import { hashKlondikeGameState } from "@/domain";

import {
  AUDIT_CANONICAL_JSON_V2,
  appendRuntimeAuditEvent,
  canonicalLegacyPersistentAuditEvent,
  canonicalPersistentAuditEvent,
} from "./audit";
import type { DemoUser } from "./demo-store";
import { enforceRateLimit } from "./http";
import {
  closePersistentUser,
  createPersistentRegistration,
  persistCooldown,
  persistentUserFromToken,
  persistSelfExclusion,
} from "./persistent-auth";
import {
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
  "0007_fortune_dice_rounds.sql",
  "0008_draw_three_truth_repair.sql",
  "0009_monetaire_two_account_reality.sql",
] as const;

let client: PGlite;

beforeAll(async () => {
  process.env.DEMO_MODE = "false";
  process.env.DATABASE_URL =
    "postgresql://configured:configured@127.0.0.1:5432/configured";
  process.env.SESSION_SECRET =
    "configured-clock-security-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "configured-clock-security-ranked-key-at-least-32-characters";
  process.env.PREVIEW_OWNER_EMAIL = "owner@example.test";
  process.env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION = "US";
  process.env.MONETAIRE_PLAY_JURISDICTIONS = "US";

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
    'TRUNCATE TABLE "audit_events", "rate_limit_buckets", "users", "game_definitions" CASCADE',
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await client.close();
});

function skewApplicationClock(appServerMs: number) {
  const realNow = Date.now.bind(Date);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(appServerMs);
  vi.spyOn(Date, "now").mockImplementation(() => {
    const stack = new Error().stack ?? "";
    return stack.includes("_emscripten_date_now") ? realNow() : appServerMs;
  });
}

async function databaseClock() {
  const result = await client.query<{ observed_at: Date }>(
    'select clock_timestamp() as "observed_at"',
  );
  return result.rows[0].observed_at;
}

async function seedUser(id = randomUUID()): Promise<DemoUser> {
  const user: DemoUser = {
    id,
    email: `${id}@example.test`,
    displayName: "Clock Security",
    passwordHash: "not-a-real-hash",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    acceptedPlayCoinTermsVersion: "PLAY_COIN_TERMS_V1",
    acceptedPlayCoinTermsAt: "2026-01-01T00:00:00.000Z",
    adminRoles: [],
  };
  await client.query(
    `
      insert into "users" ("id", "email", "password_hash")
      values ($1, $2, $3)
    `,
    [user.id, user.email, user.passwordHash],
  );
  await client.query(
    `
      insert into "user_profiles" ("user_id", "display_name")
      values ($1, $2)
    `,
    [user.id, user.displayName],
  );
  return user;
}

function requestWithCookie(cookie: string) {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { cookie: `sgw_session=${cookie}` },
  });
}

describe("configured database-clock and security invariants", () => {
  it("links a released V1 head to a DB-stamped, reload-verifiable V2 chain", async () => {
    const legacyId = randomUUID();
    const legacyCreatedAt = new Date("2099-01-01T00:00:00.000Z");
    const legacyCanonical = canonicalLegacyPersistentAuditEvent({
      id: legacyId,
      eventType: "LEGACY_RELEASED_EVENT",
      actorId: "legacy-actor",
      subjectType: "TEST",
      subjectId: "legacy-chain",
      reason: "Released V1 canonical shape.",
      createdAt: legacyCreatedAt,
    });
    const legacyHash = createHash("sha256")
      .update(legacyCanonical)
      .digest("hex");
    await client.query(
      `
        insert into "audit_events" (
          "id", "event_type", "actor_type", "actor_id", "subject_type",
          "subject_id", "reason", "request_id", "event_hash", "created_at"
        ) values ($1, $2, 'USER', $3, 'TEST', $4, $5, $8, $6, $7)
      `,
      [
        legacyId,
        "LEGACY_RELEASED_EVENT",
        "legacy-actor",
        "legacy-chain",
        "Released V1 canonical shape.",
        legacyHash,
        legacyCreatedAt,
        legacyId,
      ],
    );

    skewApplicationClock(Date.UTC(2100, 0, 1));
    await Promise.all(
      ["A", "B", "C"].map((suffix) =>
        appendRuntimeAuditEvent({
          eventType: `CONCURRENT_${suffix}`,
          actorId: `actor-${suffix}`,
          subjectType: "TEST",
          subjectId: "legacy-chain",
          reason: `Concurrent append ${suffix}.`,
          afterState:
            suffix === "A"
              ? { zeta: { second: 2, first: 1 }, alpha: "stable" }
              : undefined,
        }),
      ),
    );

    const result = await client.query<{
      id: string;
      event_type: string;
      actor_type: "ANONYMOUS" | "USER";
      actor_id: string;
      subject_type: string;
      subject_id: string;
      reason: string;
      before_state: Record<string, unknown> | null;
      after_state: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
      request_id: string;
      previous_event_hash: string | null;
      event_hash: string;
      created_at: Date;
    }>('select * from "audit_events"');
    expect(result.rows).toHaveLength(4);

    const roots = result.rows.filter(
      (event) => event.previous_event_hash === null,
    );
    expect(roots).toHaveLength(1);
    expect(roots[0].event_hash).toBe(legacyHash);
    const children = new Map(
      result.rows
        .filter((event) => event.previous_event_hash !== null)
        .map((event) => [event.previous_event_hash, event]),
    );
    let cursor = roots[0];
    for (let index = 0; index < result.rows.length; index += 1) {
      const canonical =
        cursor.metadata?.hashCanonicalVersion === AUDIT_CANONICAL_JSON_V2
          ? canonicalPersistentAuditEvent({
              id: cursor.id,
              eventType: cursor.event_type,
              actorType: cursor.actor_type,
              actorId: cursor.actor_id,
              subjectType: cursor.subject_type,
              subjectId: cursor.subject_id,
              reason: cursor.reason,
              requestId: cursor.request_id,
              beforeState: cursor.before_state,
              afterState: cursor.after_state,
              metadata: cursor.metadata,
              previousEventHash: cursor.previous_event_hash,
              createdAt: cursor.created_at,
            })
          : canonicalLegacyPersistentAuditEvent({
              id: cursor.id,
              eventType: cursor.event_type,
              actorId: cursor.actor_id,
              subjectType: cursor.subject_type,
              subjectId: cursor.subject_id,
              reason: cursor.reason,
              beforeState: cursor.before_state ?? undefined,
              afterState: cursor.after_state ?? undefined,
              previousEventHash: cursor.previous_event_hash ?? undefined,
              createdAt: cursor.created_at,
            });
      expect(createHash("sha256").update(canonical).digest("hex")).toBe(
        cursor.event_hash,
      );
      const child = children.get(cursor.event_hash);
      if (!child) {
        expect(index).toBe(result.rows.length - 1);
        break;
      }
      cursor = child;
    }
    for (const event of result.rows.filter(({ event_type }) =>
      event_type.startsWith("CONCURRENT_"),
    )) {
      expect(event.metadata).toEqual({
        hashCanonicalVersion: AUDIT_CANONICAL_JSON_V2,
      });
      expect(event.created_at.getTime()).toBeLessThan(Date.UTC(2090, 0, 1));
    }
  });

  it("uses only DB-derived evidence, session, cooldown, and exclusion times under host skew", async () => {
    const before = await databaseClock();
    skewApplicationClock(Date.UTC(2100, 0, 1));
    const registration = await createPersistentRegistration({
      email: "clock-auth@example.test",
      displayName: "Clock Auth",
      passwordHash: "not-a-real-password-hash",
      requestId: "clock-registration",
    });
    const after = await databaseClock();

    const registrationEvidence = await client.query<{
      created_at: Date;
      accepted_at: Date;
      session_created_at: Date;
      expires_at: Date;
    }>(
      `
        select
          account."created_at",
          acceptance."accepted_at",
          session."created_at" as "session_created_at",
          session."expires_at"
        from "users" as account
        join "user_terms_acceptances" as acceptance
          on acceptance."user_id" = account."id"
        join "sessions" as session on session."user_id" = account."id"
        where account."id" = $1
      `,
      [registration.user.id],
    );
    const evidence = registrationEvidence.rows[0];
    for (const timestamp of [
      evidence.created_at,
      evidence.accepted_at,
      evidence.session_created_at,
    ]) {
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    }
    expect(
      evidence.expires_at.getTime() - evidence.session_created_at.getTime(),
    ).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1_000 - 10);
    await expect(
      persistentUserFromToken(registration.session.token),
    ).resolves.toMatchObject({ id: registration.user.id });

    await persistCooldown(registration.user, 24, "clock-cooldown");
    const cooldownClock = await databaseClock();
    const cooldown = await client.query<{ effective_at: Date }>(
      `
        select "effective_at"
        from "responsible_gaming_limits"
        where "user_id" = $1
      `,
      [registration.user.id],
    );
    expect(
      cooldown.rows[0].effective_at.getTime() - cooldownClock.getTime(),
    ).toBeGreaterThan(23 * 60 * 60 * 1_000);
    await expect(
      createPersistentPracticeSession(registration.user),
    ).rejects.toMatchObject({ code: "ACCOUNT_RESTRICTED" });

    vi.setSystemTime(Date.UTC(2000, 0, 1));
    const excludedUser = await seedUser();
    const exclusion = await persistSelfExclusion({
      user: excludedUser,
      scope: "SKILL_GAMING_WORLD",
      durationDays: 30,
      requestId: "clock-exclusion",
    });
    const exclusionClock = await databaseClock();
    expect(
      Math.abs(exclusion.startsAt.getTime() - exclusionClock.getTime()),
    ).toBeLessThan(2_000);
    expect(exclusion.endsAt!.getTime() - exclusion.startsAt.getTime()).toBe(
      30 * 24 * 60 * 60 * 1_000,
    );

    await client.query(
      `update "sessions" set "expires_at" = clock_timestamp() - interval '1 second'
       where "user_id" = $1`,
      [registration.user.id],
    );
    await expect(
      persistentUserFromToken(registration.session.token),
    ).resolves.toBeNull();
  });

  it("uses DB-clock windows and bounded keyed credential shards despite forged-cookie rotation", async () => {
    const intervalMs = 60_000;
    const before = await databaseClock();
    skewApplicationClock(Date.UTC(2100, 0, 1));
    const email = "credential-shard@example.test";
    const attempts = await Promise.all([
      enforceRateLimit(
        requestWithCookie("forged-cookie-a"),
        "login",
        2,
        intervalMs,
        { anonymousCredential: email },
      ),
      enforceRateLimit(
        requestWithCookie("forged-cookie-b"),
        "login",
        2,
        intervalMs,
        { anonymousCredential: email },
      ),
    ]);
    expect(attempts).toEqual([null, null]);
    const blocked = await enforceRateLimit(
      requestWithCookie("forged-cookie-c"),
      "login",
      2,
      intervalMs,
      { anonymousCredential: email },
    );
    expect(blocked?.status).toBe(429);
    const after = await databaseClock();
    const loginBuckets = await client.query<{
      bucket_key: string;
      resets_at: Date;
      updated_at: Date;
    }>(
      `select "bucket_key", "resets_at", "updated_at"
       from "rate_limit_buckets" where "bucket_key" like 'login:%'`,
    );
    expect(loginBuckets.rows).toHaveLength(1);
    expect(loginBuckets.rows[0].bucket_key).toMatch(
      /^login:credential-shard-[0-9a-f]{2}$/,
    );
    expect(loginBuckets.rows[0].resets_at.getTime()).toBeGreaterThanOrEqual(
      before.getTime() + intervalMs,
    );
    expect(loginBuckets.rows[0].resets_at.getTime()).toBeLessThanOrEqual(
      after.getTime() + intervalMs,
    );
    expect(loginBuckets.rows[0].updated_at.getTime()).toBeLessThan(
      Date.UTC(2090, 0, 1),
    );

    await client.exec(`
      insert into "rate_limit_buckets" (
        "bucket_key", "request_count", "resets_at", "updated_at"
      ) values (
        'legacy-unbounded-cookie-key', 1,
        clock_timestamp() - interval '1 second', clock_timestamp()
      )
    `);
    for (let index = 0; index < 300; index += 1) {
      await enforceRateLimit(
        requestWithCookie(`rotated-${index}`),
        "register",
        1_000,
        intervalMs,
        { anonymousCredential: `person-${index}@example.test` },
      );
    }
    const storage = await client.query<{ count: number }>(
      `
        select count(*)::int as "count"
        from "rate_limit_buckets"
        where "bucket_key" like 'register:credential-shard-%'
      `,
    );
    expect(storage.rows[0].count).toBeLessThanOrEqual(256);
    const legacy = await client.query<{ count: number }>(
      `select count(*)::int as "count" from "rate_limit_buckets"
       where "bucket_key" = 'legacy-unbounded-cookie-key'`,
    );
    expect(legacy.rows[0].count).toBe(0);
  }, 15_000);

  it("rolls back configured mutations when their same-transaction audit cannot append", async () => {
    const user = await seedUser();
    await client.exec(`
      insert into "audit_events" (
        "event_type", "actor_type", "actor_id", "subject_type", "subject_id",
        "reason", "request_id", "event_hash"
      ) values
        ('BROKEN_ROOT_A', 'USER', 'a', 'TEST', 'a', 'a', 'a', repeat('a', 64)),
        ('BROKEN_ROOT_B', 'USER', 'b', 'TEST', 'b', 'b', 'b', repeat('b', 64))
    `);

    await expect(
      persistCooldown(user, 24, "rollback-cooldown"),
    ).rejects.toThrow("AUDIT_CHAIN_INTEGRITY_FAILURE");
    await expect(
      persistSelfExclusion({
        user,
        scope: "SKILL_GAMING_WORLD",
        durationDays: 30,
        requestId: "rollback-exclusion",
      }),
    ).rejects.toThrow("AUDIT_CHAIN_INTEGRITY_FAILURE");
    await expect(
      createPersistentPracticeSession(user, "rollback-practice"),
    ).rejects.toThrow("AUDIT_CHAIN_INTEGRITY_FAILURE");
    await expect(
      createPersistentRegistration({
        email: "rolled-back@example.test",
        displayName: "Rolled Back",
        passwordHash: "not-a-real-hash",
        requestId: "rollback-registration",
      }),
    ).rejects.toThrow("AUDIT_CHAIN_INTEGRITY_FAILURE");

    const persistence = await client.query<{
      limits: number;
      exclusions: number;
      sessions: number;
      registration: number;
      status: string;
    }>(
      `
        select
          (select count(*)::int from "responsible_gaming_limits") as "limits",
          (select count(*)::int from "self_exclusions") as "exclusions",
          (select count(*)::int from "game_sessions") as "sessions",
          (select count(*)::int from "users"
            where "email" = 'rolled-back@example.test') as "registration",
          (select "status"::text from "users" where "id" = $1) as "status"
      `,
      [user.id],
    );
    expect(persistence.rows[0]).toEqual({
      limits: 0,
      exclusions: 0,
      sessions: 0,
      registration: 0,
      status: "ACTIVE",
    });
  });

  it("serializes exclusion and closure against play commits with the player lock first", async () => {
    const exclusionUser = await seedUser();
    const [restriction, creation] = await Promise.allSettled([
      persistSelfExclusion({
        user: exclusionUser,
        scope: "SKILL_GAMING_WORLD",
        durationDays: 30,
        requestId: "race-exclusion",
      }),
      createPersistentPracticeSession(exclusionUser, "race-practice"),
    ]);
    expect(restriction.status).toBe("fulfilled");
    const exclusionEvidence = await client.query<{
      starts_at: Date;
      created_at: Date | null;
    }>(
      `
        select exclusion."starts_at", session."created_at"
        from "self_exclusions" as exclusion
        left join "game_sessions" as session
          on session."user_id" = exclusion."user_id"
        where exclusion."user_id" = $1
      `,
      [exclusionUser.id],
    );
    if (creation.status === "fulfilled") {
      expect(
        exclusionEvidence.rows[0].created_at!.getTime(),
      ).toBeLessThanOrEqual(exclusionEvidence.rows[0].starts_at.getTime());
    } else {
      expect(creation.reason).toMatchObject({ code: "SELF_EXCLUDED" });
    }

    const closingUser = await seedUser();
    const session = await createPersistentPracticeSession(closingUser);
    const [closure, move] = await Promise.allSettled([
      closePersistentUser(closingUser.id, "race-close"),
      submitPersistentMove({
        user: closingUser,
        sessionId: session.id,
        actionId: "race-close-move-action",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(session.state),
        intent: { type: "DRAW_STOCK" },
      }),
    ]);
    expect(closure.status).toBe("fulfilled");
    const closeEvidence = await client.query<{
      closed_at: Date;
      move_at: Date | null;
    }>(
      `
        select account."updated_at" as "closed_at",
          move."server_received_at" as "move_at"
        from "users" as account
        left join "move_events" as move
          on move."game_session_id" = $2 and move."accepted"
        where account."id" = $1
      `,
      [closingUser.id, session.id],
    );
    if (move.status === "fulfilled") {
      expect(closeEvidence.rows[0].move_at!.getTime()).toBeLessThanOrEqual(
        closeEvidence.rows[0].closed_at.getTime(),
      );
    } else {
      expect(move.reason).toMatchObject({ code: "ACCOUNT_RESTRICTED" });
    }

    const entryUser = await seedUser();
    await persistentCompetitionSnapshot();
    const currentCompetition = await client.query<{ id: string }>(
      `select "id" from "competitions" order by "created_at" desc limit 1`,
    );
    const competitionId = currentCompetition.rows[0].id;
    await client.exec(
      'alter table "competitions" disable trigger "competitions_publication_freeze"',
    );
    try {
      await client.query(
        `
          update "competitions"
          set "status" = 'OPEN',
              "opens_at" = clock_timestamp() - interval '1 second',
              "closes_at" = clock_timestamp() + interval '7 days',
              "published_at" = clock_timestamp() - interval '2 seconds',
              "updated_at" = clock_timestamp()
          where "id" = $1
        `,
        [competitionId],
      );
    } finally {
      await client.exec(
        'alter table "competitions" enable trigger "competitions_publication_freeze"',
      );
    }
    const decisionId = randomUUID();
    await client.query(
      `
        insert into "jurisdiction_decisions" (
          "id", "user_id", "product_mode", "decision", "rule_version",
          "location_evidence_status", "request_id"
        ) values ($1, $2, 'MONETAIRE_PLAY', 'ALLOW', 'TEST_V1', 'APPROVED', $3)
      `,
      [decisionId, entryUser.id, `entry-race-${randomUUID()}`],
    );
    const [entryRestriction, entry] = await Promise.allSettled([
      persistSelfExclusion({
        user: entryUser,
        scope: "SKILL_GAMING_WORLD",
        durationDays: 30,
        requestId: "race-entry-exclusion",
      }),
      enterPersistentCompetition(entryUser, competitionId, decisionId, {
        requestId: "race-entry",
        eventType: "NONCASH_COMPETITION_ENTERED",
      }),
    ]);
    expect(entryRestriction.status).toBe("fulfilled");
    const entryEvidence = await client.query<{
      starts_at: Date;
      entered_at: Date | null;
    }>(
      `
        select exclusion."starts_at", entry."entered_at"
        from "self_exclusions" as exclusion
        left join "competition_entries" as entry
          on entry."user_id" = exclusion."user_id"
        where exclusion."user_id" = $1
      `,
      [entryUser.id],
    );
    if (entry.status === "fulfilled") {
      expect(entryEvidence.rows[0].entered_at!.getTime()).toBeLessThanOrEqual(
        entryEvidence.rows[0].starts_at.getTime(),
      );
    } else {
      expect(entry.reason).toMatchObject({ code: "SELF_EXCLUDED" });
    }
  });
});
