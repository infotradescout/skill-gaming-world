import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  sessions,
  responsibleGamingLimits,
  selfExclusions,
  termsVersions,
  userAdminRoles,
  userProfiles,
  userTermsAcceptances,
  users,
} from "@/db/schema";

import type { DemoAdminRole, DemoUser, DemoUserStatus } from "./demo-store";
import {
  appendPersistentAuditEvent,
  type RuntimeAuditEventInput,
} from "./audit";
import { effectivePlayerAccountStatus } from "./player-access";
import { lockPersistentPlayerAccess } from "./persistent-player-access";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PLAY_COIN_TERMS_VERSION = "PLAY_COIN_TERMS_V1_2026_07_26";
const PLAY_COIN_TERMS_CONTENT_HASH =
  "994e1b5737dbcb6b61f951825a37f72dd2e420bc87f846a701c08fbd2d5ef17d";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface PersistentUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
  requestId?: string;
}

export class PersistentRestrictionError extends Error {
  readonly code = "ACCOUNT_RESTRICTED";

  constructor() {
    super("This account status cannot be replaced by a cooldown.");
    this.name = "PersistentRestrictionError";
  }
}

export class PersistentAuthenticationError extends Error {
  readonly code = "ACCOUNT_BLOCKED";

  constructor() {
    super("This account cannot sign in.");
    this.name = "PersistentAuthenticationError";
  }
}

export async function createPersistentRegistration(
  input: PersistentUserInput,
): Promise<{
  user: DemoUser;
  session: { token: string; expiresAt: Date };
}> {
  const database = getDatabase();
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");

  return database.transaction(async (transaction) => {
    const [databaseClock] = await transaction
      .select({ observedAt: sql<Date>`clock_timestamp()` })
      .from(sql`(select 1) as database_clock_source`)
      .limit(1);
    if (!databaseClock) throw new Error("DATABASE_CLOCK_UNAVAILABLE");
    const observedAt = new Date(databaseClock.observedAt);
    if (Number.isNaN(observedAt.getTime())) {
      throw new Error("DATABASE_CLOCK_INVALID");
    }
    const [created] = await transaction
      .insert(users)
      .values({
        id,
        email: input.email,
        passwordHash: input.passwordHash,
        status: "ACTIVE",
        createdAt: observedAt,
        updatedAt: observedAt,
      })
      .returning();
    await transaction.insert(userProfiles).values({
      userId: created.id,
      displayName: input.displayName,
      createdAt: observedAt,
      updatedAt: observedAt,
    });
    await transaction
      .insert(termsVersions)
      .values({
        documentKey: "PLAY_COIN_TERMS",
        version: PLAY_COIN_TERMS_VERSION,
        contentHash: PLAY_COIN_TERMS_CONTENT_HASH,
        effectiveAt: new Date("2026-07-26T00:00:00.000Z"),
        createdAt: observedAt,
      })
      .onConflictDoNothing();
    const [terms] = await transaction
      .select({ id: termsVersions.id })
      .from(termsVersions)
      .where(
        and(
          eq(termsVersions.documentKey, "PLAY_COIN_TERMS"),
          eq(termsVersions.version, PLAY_COIN_TERMS_VERSION),
        ),
      )
      .limit(1);
    if (!terms) throw new Error("PLAY_COIN_TERMS_VERSION_MISSING");
    const [acceptance] = await transaction
      .insert(userTermsAcceptances)
      .values({
        userId: created.id,
        termsVersionId: terms.id,
        requestId: randomUUID(),
        acceptedAt: observedAt,
      })
      .returning({ acceptedAt: userTermsAcceptances.acceptedAt });
    if (!acceptance) throw new Error("PLAY_COIN_TERMS_ACCEPTANCE_MISSING");
    const [session] = await transaction
      .insert(sessions)
      .values({
        userId: created.id,
        tokenHash: hashToken(token),
        expiresAt: sql`clock_timestamp() + (${SESSION_TTL_MS} * interval '1 millisecond')`,
        lastSeenAt: sql`clock_timestamp()`,
        createdAt: sql`clock_timestamp()`,
      })
      .returning({ expiresAt: sessions.expiresAt });
    if (!session) throw new Error("SESSION_CREATION_FAILED");
    await appendPersistentAuditEvent(transaction, {
      eventType: "ACCOUNT_REGISTERED",
      actorId: created.id,
      subjectType: "USER",
      subjectId: created.id,
      reason: "Player registered and accepted the Play Coin terms.",
      requestId: input.requestId,
      afterState: {
        status: created.status,
        environment: "configured",
        playCoinTermsVersion: PLAY_COIN_TERMS_VERSION,
        playCoinTermsAcceptedAt: acceptance.acceptedAt.toISOString(),
      },
    });
    const user: DemoUser = {
      id: created.id,
      email: created.email,
      displayName: input.displayName,
      passwordHash: created.passwordHash,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      acceptedPlayCoinTermsVersion: PLAY_COIN_TERMS_VERSION,
      acceptedPlayCoinTermsAt: acceptance.acceptedAt.toISOString(),
      adminRoles: [],
    };
    return { user, session: { token, expiresAt: session.expiresAt } };
  });
}

export async function persistentUserByEmail(
  email: string,
): Promise<DemoUser | null> {
  const database = getDatabase();
  const rows = await database
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      status: users.status,
      createdAt: users.createdAt,
      displayName: userProfiles.displayName,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ? hydrateUser(rows[0]) : null;
}

export async function persistentUserById(
  userId: string,
): Promise<DemoUser | null> {
  const database = getDatabase();
  const rows = await database
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      status: users.status,
      createdAt: users.createdAt,
      displayName: userProfiles.displayName,
      serverAt: sql<Date>`clock_timestamp()`,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) return null;

  const roles = await database
    .select({ role: userAdminRoles.role })
    .from(userAdminRoles)
    .where(
      and(
        eq(userAdminRoles.userId, userId),
        isNull(userAdminRoles.revokedAt),
      ),
    );
  const [cooldown] = await database
    .select({ effectiveAt: responsibleGamingLimits.effectiveAt })
    .from(responsibleGamingLimits)
    .where(
      and(
        eq(responsibleGamingLimits.userId, userId),
        eq(responsibleGamingLimits.limitType, "COOLDOWN_UNTIL"),
      ),
    )
    .orderBy(desc(responsibleGamingLimits.createdAt))
    .limit(1);
  const user = hydrateUser(rows[0], roles.map(({ role }) => role));
  if (cooldown) {
    user.cooldownUntil = cooldown.effectiveAt.toISOString();
    const serverAtMs = new Date(rows[0].serverAt).getTime();
    if (Number.isNaN(serverAtMs)) throw new Error("DATABASE_CLOCK_INVALID");
    user.status = effectivePlayerAccountStatus(user, serverAtMs);
  }
  return user;
}

function hydrateUser(
  row: {
    id: string;
    email: string;
    passwordHash: string;
    status: DemoUserStatus;
    createdAt: Date;
    displayName: string;
  },
  adminRoles: DemoAdminRole[] = [],
): DemoUser {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    acceptedPlayCoinTermsVersion: PLAY_COIN_TERMS_VERSION,
    acceptedPlayCoinTermsAt: row.createdAt.toISOString(),
    adminRoles,
  };
}

export async function createPersistentSession(
  userId: string,
  audit?: RuntimeAuditEventInput,
) {
  const token = randomBytes(32).toString("base64url");
  return getDatabase().transaction(async (transaction) => {
    await lockPersistentPlayerAccess(transaction, userId);
    const [account] = await transaction
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("key share");
    if (
      !account ||
      account.status === "CLOSED" ||
      account.status === "SUSPENDED"
    ) {
      throw new PersistentAuthenticationError();
    }
    const [session] = await transaction
      .insert(sessions)
      .values({
        userId,
        tokenHash: hashToken(token),
        expiresAt: sql`clock_timestamp() + (${SESSION_TTL_MS} * interval '1 millisecond')`,
        lastSeenAt: sql`clock_timestamp()`,
        createdAt: sql`clock_timestamp()`,
      })
      .returning({ expiresAt: sessions.expiresAt });
    if (!session) throw new Error("SESSION_CREATION_FAILED");
    if (audit) await appendPersistentAuditEvent(transaction, audit);
    return { token, expiresAt: session.expiresAt };
  });
}

export async function persistentUserFromToken(
  token?: string,
): Promise<DemoUser | null> {
  if (!token) return null;
  const database = getDatabase();
  const rows = await database
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        sql`${sessions.expiresAt} > clock_timestamp()`,
      ),
    )
    .limit(1);
  if (!rows[0]) return null;
  await database
    .update(sessions)
    .set({ lastSeenAt: sql`clock_timestamp()` })
    .where(eq(sessions.tokenHash, hashToken(token)));
  return persistentUserById(rows[0].userId);
}

export async function revokePersistentSession(
  token?: string,
  audit?: RuntimeAuditEventInput,
): Promise<void> {
  if (!token) return;
  await getDatabase().transaction(async (transaction) => {
    const [revoked] = await transaction
      .update(sessions)
      .set({ revokedAt: sql`clock_timestamp()` })
      .where(eq(sessions.tokenHash, hashToken(token)))
      .returning({ id: sessions.id });
    if (revoked && audit) {
      await appendPersistentAuditEvent(transaction, audit);
    }
  });
}

export async function closePersistentUser(
  userId: string,
  requestId?: string,
): Promise<void> {
  await getDatabase().transaction(async (transaction) => {
    await lockPersistentPlayerAccess(transaction, userId);
    const [account] = await transaction
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    if (!account) throw new Error("USER_NOT_FOUND");
    await transaction
      .update(users)
      .set({ status: "CLOSED", updatedAt: sql`clock_timestamp()` })
      .where(eq(users.id, userId));
    await transaction
      .update(sessions)
      .set({ revokedAt: sql`clock_timestamp()` })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    await appendPersistentAuditEvent(transaction, {
      eventType: "ACCOUNT_CLOSED",
      actorId: userId,
      subjectType: "USER",
      subjectId: userId,
      reason: "Player completed the explicit account-closure confirmation.",
      requestId,
      beforeState: { status: account.status },
      afterState: { status: "CLOSED", environment: "configured" },
    });
  });
}

export async function persistCooldown(
  user: DemoUser,
  hours: 24 | 72 | 168,
  requestId?: string,
): Promise<DemoUser> {
  const database = getDatabase();
  await database.transaction(async (transaction) => {
    await lockPersistentPlayerAccess(transaction, user.id);
    const [account] = await transaction
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
      .for("update");
    if (!account) throw new Error("USER_NOT_FOUND");
    if (account.status === "CLOSED" || account.status === "SUSPENDED") {
      throw new PersistentRestrictionError();
    }
    const [window] = await transaction
      .select({
        effectiveAt: sql<Date>`greatest(
          clock_timestamp() + (${hours} * interval '1 hour'),
          coalesce(
            max(${responsibleGamingLimits.effectiveAt}),
            '-infinity'::timestamptz
          )
        )`,
      })
      .from(responsibleGamingLimits)
      .where(
        and(
          eq(responsibleGamingLimits.userId, user.id),
          eq(responsibleGamingLimits.limitType, "COOLDOWN_UNTIL"),
        ),
      );
    if (!window) throw new Error("DATABASE_CLOCK_UNAVAILABLE");
    const effectiveAt = new Date(window.effectiveAt);
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new Error("DATABASE_CLOCK_INVALID");
    }
    const [record] = await transaction
      .insert(responsibleGamingLimits)
      .values({
        userId: user.id,
        limitType: "COOLDOWN_UNTIL",
        effectiveAt,
        createdAt: sql`clock_timestamp()`,
      })
      .returning({ effectiveAt: responsibleGamingLimits.effectiveAt });
    if (!record) throw new Error("COOLDOWN_CREATION_FAILED");
    if (account.status !== "SELF_EXCLUDED") {
      await transaction
        .update(users)
        .set({ status: "COOLDOWN", updatedAt: sql`clock_timestamp()` })
        .where(eq(users.id, user.id));
    }
    user.status =
      account.status === "ACTIVE" || account.status === "COOLDOWN"
        ? "COOLDOWN"
        : account.status;
    user.cooldownUntil = record.effectiveAt.toISOString();
    await appendPersistentAuditEvent(transaction, {
      eventType: "ACCOUNT_COOLDOWN_ACTIVATED",
      actorId: user.id,
      subjectType: "USER",
      subjectId: user.id,
      reason: `Player selected a ${hours}-hour cooldown.`,
      requestId,
      beforeState: { status: account.status },
      afterState: {
        status: user.status,
        cooldownUntil: user.cooldownUntil,
        environment: "configured",
      },
    });
  });
  return user;
}

export async function persistSelfExclusion(input: {
  user: DemoUser;
  scope: "ALL_PRODUCTS" | "SKILL_GAMING_WORLD" | "CASINO";
  durationDays: 30 | 90 | 365 | null;
  requestId?: string;
}) {
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    await lockPersistentPlayerAccess(transaction, input.user.id);
    const [account] = await transaction
      .select({
        status: users.status,
        observedAt: sql<Date>`clock_timestamp()`,
      })
      .from(users)
      .where(eq(users.id, input.user.id))
      .limit(1)
      .for("update");
    if (!account) throw new Error("USER_NOT_FOUND");
    const startsAt = new Date(account.observedAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new Error("DATABASE_CLOCK_INVALID");
    }
    const endsAt =
      input.durationDays === null
        ? undefined
        : new Date(
            startsAt.getTime() + input.durationDays * 24 * 60 * 60 * 1_000,
          );
    const [record] = await transaction
      .insert(selfExclusions)
      .values({
        userId: input.user.id,
        scope: input.scope,
        startsAt,
        endsAt,
        permanent: input.durationDays === null,
        createdAt: startsAt,
      })
      .returning();
    if (
      (input.scope === "ALL_PRODUCTS" ||
        input.scope === "SKILL_GAMING_WORLD") &&
      account.status !== "CLOSED" &&
      account.status !== "SUSPENDED"
    ) {
      await transaction
        .update(users)
        .set({ status: "SELF_EXCLUDED", updatedAt: startsAt })
        .where(eq(users.id, input.user.id));
      input.user.status = "SELF_EXCLUDED";
    } else {
      input.user.status = account.status;
    }
    await appendPersistentAuditEvent(transaction, {
      eventType: "SELF_EXCLUSION_ACTIVATED",
      actorId: input.user.id,
      subjectType: "SELF_EXCLUSION",
      subjectId: record.id,
      reason: `Player selected ${
        input.durationDays === null ? "PERMANENT" : `${input.durationDays}_DAYS`
      } for ${input.scope}.`,
      requestId: input.requestId,
      beforeState: { status: account.status },
      afterState: {
        status: input.user.status,
        scope: record.scope,
        endsAt: record.endsAt?.toISOString(),
        permanent: record.permanent,
        environment: "configured",
      },
    });
    return record;
  });
}
