import { and, desc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  responsibleGamingLimits,
  selfExclusions,
  users,
} from "@/db/schema";

import type { DemoSelfExclusion, DemoUser } from "./demo-store";
import { GameServiceError } from "./game-service";
import { evaluateDemoPlayerAccess } from "./player-access";
import type { DemoProductMode } from "./player-access";

export type PersistentPlayerAccessTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

/**
 * Serializes configured play authorization and restriction activation for one
 * player. Callers must hold this transaction-scoped lock until their mutation
 * commits so a newly activated restriction cannot race a session, entry, or
 * move into existence.
 */
export async function lockPersistentPlayerAccess(
  transaction: PersistentPlayerAccessTransaction,
  userId: string,
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(
      hashtext('MONETAIRE_PLAYER_ACCESS_V1'),
      hashtext(${userId})
    )`,
  );
}

export async function assertPersistentPlayerAccess(
  transaction: PersistentPlayerAccessTransaction,
  user: DemoUser,
  mode: DemoProductMode = "MONETAIRE_PLAY",
): Promise<void> {
  const snapshot = await persistentPlayerAccessSnapshot(transaction, user);
  const decision = evaluateDemoPlayerAccess({
    user: snapshot.user,
    mode,
    exclusions: snapshot.exclusions,
    serverAtMs: snapshot.serverAtMs,
  });
  if (!decision.allowed) {
    throw new GameServiceError(
      decision.reasonCodes.includes("SELF_EXCLUDED")
        ? "SELF_EXCLUDED"
        : "ACCOUNT_RESTRICTED",
      mode === "ROBOT_COMBAT_FREE"
        ? "Account restrictions block Robot Combat."
        : "Account restrictions block Monetaire Play.",
    );
  }
}

export async function persistentPlayerAccessSnapshot(
  transaction: PersistentPlayerAccessTransaction,
  user: Readonly<DemoUser>,
): Promise<{
  user: DemoUser;
  exclusions: readonly DemoSelfExclusion[];
  serverAtMs: number;
}> {
  await lockPersistentPlayerAccess(transaction, user.id);

  const [account] = await transaction
    .select({
      status: users.status,
      serverAt: sql<Date>`clock_timestamp()`,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
    .for("key share");
  if (!account) {
    throw new GameServiceError(
      "ACCOUNT_RESTRICTED",
      "Account restrictions block Monetaire Play.",
    );
  }

  const [cooldown] = await transaction
    .select({ effectiveAt: responsibleGamingLimits.effectiveAt })
    .from(responsibleGamingLimits)
    .where(
      and(
        eq(responsibleGamingLimits.userId, user.id),
        eq(responsibleGamingLimits.limitType, "COOLDOWN_UNTIL"),
      ),
    )
    .orderBy(desc(responsibleGamingLimits.createdAt))
    .limit(1);
  const exclusions = await transaction
    .select()
    .from(selfExclusions)
    .where(eq(selfExclusions.userId, user.id));

  const serverAtMs = new Date(account.serverAt).getTime();
  if (Number.isNaN(serverAtMs)) {
    throw new Error("DATABASE_CLOCK_INVALID");
  }
  const authoritativeUser: DemoUser = {
    ...user,
    status: account.status,
    cooldownUntil: cooldown?.effectiveAt.toISOString(),
  };
  return {
    user: authoritativeUser,
    exclusions: exclusions.map((record) => ({
      id: record.id,
      userId: record.userId,
      scope: record.scope as
        | "ALL_PRODUCTS"
        | "SKILL_GAMING_WORLD"
        | "CASINO",
      startsAt: record.startsAt.toISOString(),
      endsAt: record.endsAt?.toISOString(),
      permanent: record.permanent,
      removalPolicy: "COMPLIANCE_REVIEW_ONLY",
    })),
    serverAtMs,
  };
}
