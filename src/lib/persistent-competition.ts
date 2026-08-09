import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  competitionEntries,
  competitions,
  deals,
  dealValidations,
  gameDefinitions,
  gameSessions,
  rulesetVersions,
  scores,
  users,
  userProfiles,
} from "@/db/schema";
import {
  canonicalJson,
  createCuratedSolvableKlondikeDeal,
  createKlondikeGameState,
  createServerActivityClock,
  sha256Hex,
} from "@/domain";

import type { DemoGameSession, DemoUser } from "./demo-store";
import { getRuntimeEnv } from "./env";
import { GameServiceError } from "./game-service";
import { assertPersistentAccess } from "./persistent-game";

const RULESET_VERSION = "KLONDIKE_DRAW_THREE_V1";
const SCORE_VERSION = "MONETAIRE_SCORE_V1";
const COMPETITION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

function rankedKey(): Buffer {
  const value = getRuntimeEnv().COMPETITION_SEED_ENCRYPTION_KEY;
  if (!value) throw new Error("COMPETITION_SEED_ENCRYPTION_KEY_REQUIRED");
  return createHash("sha256")
    .update("MONETAIRE_CONFIGURED_RANKED_SEED_V1\0")
    .update(value)
    .digest();
}

function encryptRankedSeed(seed: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", rankedKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(seed), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptRankedSeed(value: string): string {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("RANKED_SEED_CIPHERTEXT_INVALID");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    rankedKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString();
}

async function ensureConfiguredRuleset() {
  const database = getDatabase();
  await database
    .insert(gameDefinitions)
    .values({ key: "MONETAIRE_SOLITAIRE", publicName: "Monetaire" })
    .onConflictDoNothing();
  const [definition] = await database
    .select({ id: gameDefinitions.id })
    .from(gameDefinitions)
    .where(eq(gameDefinitions.key, "MONETAIRE_SOLITAIRE"))
    .limit(1);
  if (!definition) throw new Error("GAME_DEFINITION_MISSING");
  await database
    .insert(rulesetVersions)
    .values({
      gameDefinitionId: definition.id,
      version: RULESET_VERSION,
      rules: { draw: 1, redeals: "unlimited", valuablePrize: false },
      scoring: { version: SCORE_VERSION },
      immutableAt: new Date(),
    })
    .onConflictDoNothing();
  const [ruleset] = await database
    .select()
    .from(rulesetVersions)
    .where(
      and(
        eq(rulesetVersions.gameDefinitionId, definition.id),
        eq(rulesetVersions.version, RULESET_VERSION),
      ),
    )
    .limit(1);
  if (!ruleset) throw new Error("RULESET_MISSING");
  return ruleset;
}

export async function ensurePersistentCompetition() {
  const database = getDatabase();
  const ruleset = await ensureConfiguredRuleset();
  return database.transaction(async (transaction) => {
    // Publication has one configured-mode head. This lock also covers the
    // empty-table case where SELECT ... FOR UPDATE cannot serialize creators.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext('MONETAIRE_CONFIGURED_COMPETITION_V1'))`,
    );
    const now = new Date();
    const [existing] = await transaction
      .select()
      .from(competitions)
      .where(
        and(
          inArray(competitions.status, ["PUBLISHED", "OPEN"]),
          gt(competitions.closesAt, now),
        ),
      )
      .orderBy(asc(competitions.opensAt), asc(competitions.id))
      .limit(1);
    if (existing) return existing;

    const seed = randomBytes(32).toString("base64url");
    const deal = createCuratedSolvableKlondikeDeal(seed);
    const canonicalDealHash = sha256Hex(
      deal.orderedDeck.map((card) => card.id).join(","),
    );
    const [dealRecord] = await transaction
      .insert(deals)
      .values({
        rulesetVersionId: ruleset.id,
        seedCiphertext: encryptRankedSeed(seed),
        seedCommitment: deal.commitment,
        canonicalDealHash,
        immutableAt: now,
      })
      .returning();
    const evidence = {
      protocol: "MONETAIRE_CURATED_SOLVABLE_V1",
      rulesetVersion: RULESET_VERSION,
      canonicalDealHash,
    };
    await transaction.insert(dealValidations).values({
      dealId: dealRecord.id,
      validatorKey: "CURATED_SOLVABLE",
      validatorVersion: "V1",
      status: "VERIFIED_SOLVABLE",
      evidenceHash: sha256Hex(canonicalJson(evidence)),
      evidence,
      validatedAt: now,
    });
    const opensAt = now;
    const [competition] = await transaction
      .insert(competitions)
      .values({
        publicName: "Monetaire Weekly Noncash Ranking",
        productMode: "MONETAIRE_PLAY",
        status: "PUBLISHED",
        dealId: dealRecord.id,
        rulesetVersionId: ruleset.id,
        opensAt,
        closesAt: new Date(opensAt.getTime() + COMPETITION_DURATION_MS),
        publishedAt: new Date(now.getTime() - 1),
      })
      .returning();
    return competition;
  });
}

export async function persistentCompetitionSnapshot() {
  const competition = await ensurePersistentCompetition();
  const now = new Date();
  if (
    competition.status === "PUBLISHED" &&
    competition.opensAt.getTime() <= now.getTime()
  ) {
    const [updated] = await getDatabase()
      .update(competitions)
      .set({ status: "OPEN", updatedAt: now })
      .where(
        and(
          eq(competitions.id, competition.id),
          eq(competitions.status, "PUBLISHED"),
        ),
      )
      .returning();
    if (updated) Object.assign(competition, updated);
  }
  const standings = await persistentLeaderboard(competition.id);
  const [deal] = await getDatabase()
    .select({ commitment: deals.seedCommitment })
    .from(deals)
    .where(eq(deals.id, competition.dealId))
    .limit(1);
  return {
    competitionId: competition.id,
    publicName: competition.publicName,
    status: competition.status === "OPEN" ? "ACTIVE" : competition.status,
    entryCostPlayCoins: 0,
    valuablePrize: false,
    dealCommitment: deal?.commitment ?? null,
    opensAtServerMs: competition.opensAt.getTime(),
    closesAtServerMs: competition.closesAt.getTime(),
    standings,
  };
}

export async function enterPersistentCompetition(
  user: DemoUser,
  competitionId: string,
): Promise<DemoGameSession> {
  await assertPersistentAccess(user);
  return getDatabase().transaction(async (transaction) => {
    // A single account may enter a competition once. Serialize the read/create
    // pair across instances, while retaining the database unique constraint as
    // a final convergence boundary.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(
        hashtext('MONETAIRE_COMPETITION_ENTRY_V1'),
        hashtext(${`${competitionId}:${user.id}`})
      )`,
    );
    const now = new Date();
    const [competition] = await transaction
      .select()
      .from(competitions)
      .where(
        and(
          eq(competitions.id, competitionId),
          eq(competitions.status, "OPEN"),
          lt(competitions.opensAt, now),
          gt(competitions.closesAt, now),
        ),
      )
      .limit(1);
    if (!competition) {
      throw new GameServiceError(
        "SESSION_NOT_ACTIVE",
        "The noncash competition is not open.",
      );
    }
    const [existing] = await transaction
      .select({ id: competitionEntries.id })
      .from(competitionEntries)
      .where(
        and(
          eq(competitionEntries.competitionId, competition.id),
          eq(competitionEntries.userId, user.id),
        ),
      )
      .limit(1);
    if (existing) {
      throw new GameServiceError(
        "DUPLICATE_COMPETITION_ENTRY",
        "This account already entered the competition.",
      );
    }
    const [dealRecord] = await transaction
      .select()
      .from(deals)
      .where(eq(deals.id, competition.dealId))
      .limit(1);
    if (!dealRecord?.immutableAt) throw new Error("IMMUTABLE_DEAL_REQUIRED");
    const seed = decryptRankedSeed(dealRecord.seedCiphertext);
    const deal = createCuratedSolvableKlondikeDeal(seed);
    if (
      deal.commitment !== dealRecord.seedCommitment ||
      sha256Hex(deal.orderedDeck.map((card) => card.id).join(",")) !==
        dealRecord.canonicalDealHash
    ) {
      throw new Error("RANKED_DEAL_INTEGRITY_FAILURE");
    }
    const [entry] = await transaction
      .insert(competitionEntries)
      .values({
        competitionId: competition.id,
        userId: user.id,
        dealId: dealRecord.id,
      })
      .onConflictDoNothing()
      .returning();
    if (!entry) {
      throw new GameServiceError(
        "DUPLICATE_COMPETITION_ENTRY",
        "This account already entered the competition.",
      );
    }
    const id = randomUUID();
    const state = createKlondikeGameState({ gameId: id, deal });
    const activityClock = createServerActivityClock(now.getTime());
    await transaction.insert(gameSessions).values({
      id,
      userId: user.id,
      competitionEntryId: entry.id,
      dealId: dealRecord.id,
      rulesetVersionId: competition.rulesetVersionId,
      sessionMode: "NONCASH_COMPETITION",
      stateSnapshot: state as unknown as Record<string, unknown>,
      activityClockSnapshot: activityClock as unknown as Record<string, unknown>,
      seedCiphertext: "SERVER_HELD_UNTIL_COMPETITION_CLOSE",
      nextSequence: 1,
    });
    return {
      id,
      userId: user.id,
      mode: "NONCASH_COMPETITION",
      competitionEntryId: entry.id,
      seed: "SERVER_HELD_UNTIL_COMPETITION_CLOSE",
      state,
      activityClock,
      createdAt: now.toISOString(),
    };
  });
}

export async function persistentLeaderboard(competitionId: string) {
  const rows = await getDatabase()
    .select({
      entryId: competitionEntries.id,
      displayName: userProfiles.displayName,
      scoreId: scores.id,
      completed: scores.completed,
      validMoveCount: scores.validMoveCount,
      durationMs: scores.verifiedActiveDurationMs,
    })
    .from(competitionEntries)
    .innerJoin(users, eq(users.id, competitionEntries.userId))
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .innerJoin(gameSessions, eq(gameSessions.competitionEntryId, competitionEntries.id))
    .innerJoin(
      scores,
      and(
        eq(scores.gameSessionId, gameSessions.id),
        isNull(scores.supersededByScoreId),
      ),
    )
    .where(eq(competitionEntries.competitionId, competitionId))
    .orderBy(
      sql`${scores.completed} desc`,
      asc(scores.validMoveCount),
      asc(scores.verifiedActiveDurationMs),
      asc(scores.id),
    );
  let lastRank = 0;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const tiedWithPrevious =
      Boolean(previous) &&
      previous.completed === row.completed &&
      previous.validMoveCount === row.validMoveCount &&
      previous.durationMs === row.durationMs;
    if (!tiedWithPrevious) lastRank = index + 1;
    const next = rows[index + 1];
    const tiedWithNext =
      Boolean(next) &&
      next.completed === row.completed &&
      next.validMoveCount === row.validMoveCount &&
      next.durationMs === row.durationMs;
    return {
      rank: lastRank,
      entryId: row.entryId,
      displayName: row.displayName,
      scoreId: row.scoreId,
      completed: row.completed,
      validMoveCount: row.validMoveCount,
      verifiedActiveDurationMs: Number(row.durationMs),
      tied: tiedWithPrevious || tiedWithNext,
    };
  });
}
