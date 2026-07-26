import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

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
}

export async function createPersistentUser(
  input: PersistentUserInput,
): Promise<DemoUser> {
  const database = getDatabase();
  const now = new Date();
  const id = randomUUID();

  return database.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(users)
      .values({
        id,
        email: input.email,
        passwordHash: input.passwordHash,
        status: "ACTIVE",
      })
      .returning();
    await transaction.insert(userProfiles).values({
      userId: created.id,
      displayName: input.displayName,
    });
    await transaction
      .insert(termsVersions)
      .values({
        documentKey: "PLAY_COIN_TERMS",
        version: PLAY_COIN_TERMS_VERSION,
        contentHash: PLAY_COIN_TERMS_CONTENT_HASH,
        effectiveAt: new Date("2026-07-26T00:00:00.000Z"),
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
    await transaction.insert(userTermsAcceptances).values({
      userId: created.id,
      termsVersionId: terms.id,
      requestId: randomUUID(),
      acceptedAt: now,
    });
    return {
      id: created.id,
      email: created.email,
      displayName: input.displayName,
      passwordHash: created.passwordHash,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      acceptedPlayCoinTermsVersion: PLAY_COIN_TERMS_VERSION,
      acceptedPlayCoinTermsAt: now.toISOString(),
      adminRoles: [],
    };
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
  if (cooldown) user.cooldownUntil = cooldown.effectiveAt.toISOString();
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

export async function createPersistentSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await getDatabase().insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function persistentUserFromToken(
  token?: string,
): Promise<DemoUser | null> {
  if (!token) return null;
  const database = getDatabase();
  const now = new Date();
  const rows = await database
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!rows[0]) return null;
  await database
    .update(sessions)
    .set({ lastSeenAt: now })
    .where(eq(sessions.tokenHash, hashToken(token)));
  return persistentUserById(rows[0].userId);
}

export async function revokePersistentSession(token?: string): Promise<void> {
  if (!token) return;
  await getDatabase()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}

export async function closePersistentUser(userId: string): Promise<void> {
  await getDatabase().transaction(async (transaction) => {
    await transaction
      .update(users)
      .set({ status: "CLOSED", updatedAt: new Date() })
      .where(eq(users.id, userId));
    await transaction
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  });
}

export async function persistCooldown(
  user: DemoUser,
  requestedEnd: Date,
): Promise<DemoUser> {
  const database = getDatabase();
  await database.transaction(async (transaction) => {
    await transaction.insert(responsibleGamingLimits).values({
      userId: user.id,
      limitType: "COOLDOWN_UNTIL",
      effectiveAt: requestedEnd,
    });
    if (user.status !== "SELF_EXCLUDED") {
      await transaction
        .update(users)
        .set({ status: "COOLDOWN", updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }
  });
  user.status = user.status === "SELF_EXCLUDED" ? user.status : "COOLDOWN";
  user.cooldownUntil = requestedEnd.toISOString();
  return user;
}

export async function persistSelfExclusion(input: {
  user: DemoUser;
  scope: "ALL_PRODUCTS" | "SKILL_GAMING_WORLD" | "CASINO";
  startsAt: Date;
  endsAt?: Date;
  permanent: boolean;
}) {
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    const [record] = await transaction
      .insert(selfExclusions)
      .values({
        userId: input.user.id,
        scope: input.scope,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        permanent: input.permanent,
      })
      .returning();
    if (
      (input.scope === "ALL_PRODUCTS" ||
        input.scope === "SKILL_GAMING_WORLD") &&
      input.user.status !== "CLOSED" &&
      input.user.status !== "SUSPENDED"
    ) {
      await transaction
        .update(users)
        .set({ status: "SELF_EXCLUDED", updatedAt: new Date() })
        .where(eq(users.id, input.user.id));
      input.user.status = "SELF_EXCLUDED";
    }
    return record;
  });
}
