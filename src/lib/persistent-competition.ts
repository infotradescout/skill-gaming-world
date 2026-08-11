import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  competitionEntries,
  competitions,
  deals,
  dealValidations,
  gameDefinitions,
  gameSessions,
  jurisdictionDecisions,
  leaderboardSnapshots,
  rulesetVersions,
  scores,
  users,
  userProfiles,
} from "@/db/schema";
import {
  canonicalJson,
  createCuratedSolvableKlondikeDeal,
  createKlondikeGameState,
  createSeededKlondikeDeal,
  createServerActivityClock,
  CURATED_SOLUTION_PROOF_VERSION,
  finalizeActivityClock,
  getVerifiedActivePlayMs,
  isKlondikeDrawThreeRules,
  KLONDIKE_DRAW_THREE_RULES,
  KLONDIKE_DRAW_THREE_RULESET,
  OFFICIAL_SCORE_VERSION,
  replayCuratedSolvableDeal,
  sha256Hex,
  verifyDealReveal,
} from "@/domain";
import type {
  DealGeneratorVersion,
  KlondikeGameState,
  KlondikeRulesetVersion,
  ServerActivityClock,
} from "@/domain";

import type { DemoGameSession, DemoUser } from "./demo-store";
import { appendPersistentAuditEvent } from "./audit";
import { getRuntimeEnv } from "./env";
import { GameServiceError } from "./game-service";
import { assertPersistentAccess } from "./persistent-game";

const COMPETITION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
const COMPETITION_PUBLICATION_LEAD_MS = 5_000;
const CONFIGURED_COMPETITION_LOCK =
  "MONETAIRE_CONFIGURED_COMPETITION_V1";
const UUID_PATTERN =
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_PUBLIC_READS_IN_FLIGHT = 128;
const publicReadsInFlight = new Map<string, Promise<unknown>>();

type CompetitionTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type CompetitionRecord = typeof competitions.$inferSelect;
type DealRecord = typeof deals.$inferSelect;

async function coalescePublicCompetitionRead<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const existing = publicReadsInFlight.get(key);
  if (existing) return existing as Promise<T>;
  while (publicReadsInFlight.size >= MAX_PUBLIC_READS_IN_FLIGHT) {
    await Promise.race(publicReadsInFlight.values()).catch(() => undefined);
    const converged = publicReadsInFlight.get(key);
    if (converged) return converged as Promise<T>;
  }
  const promise = loader();
  publicReadsInFlight.set(key, promise);
  promise.finally(() => {
    if (publicReadsInFlight.get(key) === promise) {
      publicReadsInFlight.delete(key);
    }
  }).catch(() => undefined);
  return promise;
}

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
      version: KLONDIKE_DRAW_THREE_RULESET,
      rules: KLONDIKE_DRAW_THREE_RULES,
      scoring: { version: OFFICIAL_SCORE_VERSION },
      immutableAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing();
  const [ruleset] = await database
    .select()
    .from(rulesetVersions)
    .where(
      and(
        eq(rulesetVersions.gameDefinitionId, definition.id),
        eq(rulesetVersions.version, KLONDIKE_DRAW_THREE_RULESET),
      ),
    )
    .limit(1);
  if (!ruleset) throw new Error("RULESET_MISSING");
  if (
    !isKlondikeDrawThreeRules(ruleset.rules) ||
    ruleset.scoring.version !== OFFICIAL_SCORE_VERSION
  ) {
    throw new Error("RULESET_CONTRACT_MISMATCH");
  }
  return ruleset;
}

function verifyRankedDeal(dealRecord: DealRecord, seed: string) {
  const generated = createCuratedSolvableKlondikeDeal(seed);
  const canonicalDealHash = sha256Hex(
    generated.orderedDeck.map((card) => card.id).join(","),
  );
  if (
    generated.commitment !== dealRecord.seedCommitment ||
    canonicalDealHash !== dealRecord.canonicalDealHash
  ) {
    throw new Error("RANKED_DEAL_INTEGRITY_FAILURE");
  }
  return generated;
}

function verifyStoredDealReveal(input: {
  dealRecord: DealRecord;
  seed: string;
  rulesetVersion: string;
  dealGeneratorVersion: string | null;
}) {
  if (
    input.rulesetVersion !== "KLONDIKE_DRAW_THREE_V1" &&
    input.rulesetVersion !== KLONDIKE_DRAW_THREE_RULESET
  ) {
    throw new Error("RANKED_DEAL_RULESET_UNSUPPORTED");
  }
  if (
    input.dealGeneratorVersion !== "CURATED_SOLVABLE_V1" &&
    input.dealGeneratorVersion !== "SHA256_FISHER_YATES_V1"
  ) {
    throw new Error("RANKED_DEAL_GENERATOR_UNSUPPORTED");
  }
  const rulesetVersion = input.rulesetVersion as KlondikeRulesetVersion;
  const dealGeneratorVersion =
    input.dealGeneratorVersion as DealGeneratorVersion;
  if (
    !verifyDealReveal({
      seed: input.seed,
      commitment: input.dealRecord.seedCommitment,
      rulesetVersion,
      generatorVersion: dealGeneratorVersion,
    })
  ) {
    throw new Error("RANKED_DEAL_REVEAL_INTEGRITY_FAILURE");
  }
  const generated =
    dealGeneratorVersion === "CURATED_SOLVABLE_V1"
      ? createCuratedSolvableKlondikeDeal(input.seed)
      : createSeededKlondikeDeal(input.seed);
  if (
    sha256Hex(generated.orderedDeck.map((card) => card.id).join(",")) !==
    input.dealRecord.canonicalDealHash
  ) {
    throw new Error("RANKED_DEAL_REVEAL_INTEGRITY_FAILURE");
  }
}

async function createPublishedCompetition(
  transaction: CompetitionTransaction,
  rulesetVersionId: string,
): Promise<CompetitionRecord> {
  const seed = randomBytes(32).toString("base64url");
  const generated = createCuratedSolvableKlondikeDeal(seed);
  const canonicalDealHash = sha256Hex(
    generated.orderedDeck.map((card) => card.id).join(","),
  );
  const dealId = randomUUID();
  const validationId = randomUUID();
  // Transcript times are explicitly logical proof coordinates, not claimed
  // wall-clock observations. Persisted validation/publication timestamps are
  // sampled from PostgreSQL only after this complete replay succeeds.
  const logicalTranscriptStartedAtMs = 0;
  const proof = replayCuratedSolvableDeal({
    dealId,
    deal: generated,
    validationStartedAtServerMs: logicalTranscriptStartedAtMs,
  });
  const [databaseClock] = await transaction
    .select({ observedAt: sql<Date>`clock_timestamp()` })
    .from(sql`(select 1) as publication_clock_source`)
    .limit(1);
  if (!databaseClock) throw new Error("COMPETITION_DATABASE_CLOCK_UNAVAILABLE");
  const publishedAt = new Date(databaseClock.observedAt);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error("COMPETITION_DATABASE_CLOCK_INVALID");
  }
  const [dealRecord] = await transaction
    .insert(deals)
    .values({
      id: dealId,
      rulesetVersionId,
      seedCiphertext: encryptRankedSeed(seed),
      seedCommitment: generated.commitment,
      canonicalDealHash,
      immutableAt: publishedAt,
      createdAt: publishedAt,
    })
    .returning();
  if (!dealRecord) throw new Error("DEAL_PUBLICATION_FAILED");

  const evidence = {
    protocol: proof.proofVersion,
    rulesetVersion: KLONDIKE_DRAW_THREE_RULESET,
    dealGeneratorVersion: generated.generatorVersion,
    canonicalDealHash,
    dealCommitment: generated.commitment,
    logicalTranscriptStartedAtMs,
    logicalEventStepMs: 1,
    acceptedMoveCount: proof.acceptedMoveCount,
    finalStatus: proof.finalStatus,
    finalEventHash: proof.finalEventHash,
    transcriptHash: proof.transcriptHash,
    evidenceReference: `sha256:${proof.transcriptHash}`,
  };
  await transaction.insert(dealValidations).values({
    id: validationId,
    dealId: dealRecord.id,
    validatorKey: CURATED_SOLUTION_PROOF_VERSION,
    validatorVersion: "1",
    status: "VERIFIED_SOLVABLE",
    evidenceHash: sha256Hex(canonicalJson(evidence)),
    evidence,
    validatedAt: publishedAt,
    createdAt: publishedAt,
  });

  const opensAt = new Date(
    publishedAt.getTime() + COMPETITION_PUBLICATION_LEAD_MS,
  );
  const [competition] = await transaction
    .insert(competitions)
    .values({
      publicName: "Monetaire Weekly Noncash Ranking",
      productMode: "MONETAIRE_PLAY",
      status: "PUBLISHED",
      dealId: dealRecord.id,
      rulesetVersionId,
      opensAt,
      closesAt: new Date(opensAt.getTime() + COMPETITION_DURATION_MS),
      publishedAt,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    })
    .returning();
  if (!competition) throw new Error("COMPETITION_PUBLICATION_FAILED");
  return competition;
}

function finalClockAtCompetitionClose(
  clock: Readonly<ServerActivityClock>,
  closesAtServerMs: number,
): Readonly<ServerActivityClock> {
  if (clock.lastServerEventMs > closesAtServerMs) {
    throw new Error("COMPETITION_SESSION_EVENT_AFTER_CLOSE");
  }
  if (clock.status === "FINALIZED") return clock;
  return finalizeActivityClock(clock, closesAtServerMs);
}

async function terminalizeCompetitionSessions(
  transaction: CompetitionTransaction,
  competitionId: string,
  closesAt: Date,
  observedAt: Date,
) {
  const sessionIds = await transaction
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .innerJoin(
      competitionEntries,
      eq(competitionEntries.id, gameSessions.competitionEntryId),
    )
    .where(eq(competitionEntries.competitionId, competitionId))
    .orderBy(asc(gameSessions.id));

  for (const { id: sessionId } of sessionIds) {
    // Share the command serializer before reading authoritative state. A move
    // that started before the cutoff either commits first and is included, or
    // observes the terminal session after this transaction commits.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(
        hashtext('MONETAIRE_GAME_SESSION_V1'),
        hashtext(${sessionId})
      )`,
    );
    const [session] = await transaction
      .select({
        id: gameSessions.id,
        status: gameSessions.status,
        stateSnapshot: gameSessions.stateSnapshot,
        activityClockSnapshot: gameSessions.activityClockSnapshot,
      })
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .limit(1)
      .for("update");
    if (!session) throw new Error("COMPETITION_SESSION_MISSING");
    const [activeScore] = await transaction
      .select({ id: scores.id })
      .from(scores)
      .where(
        and(
          eq(scores.gameSessionId, session.id),
          isNull(scores.supersededByScoreId),
        ),
      )
      .limit(1);

    let state = session.stateSnapshot as unknown as KlondikeGameState;
    let activityClock =
      session.activityClockSnapshot as unknown as ServerActivityClock;
    let sessionStatus = session.status;

    if (sessionStatus !== "COMPLETED" && sessionStatus !== "ABANDONED") {
      activityClock = finalClockAtCompetitionClose(
        activityClock,
        closesAt.getTime(),
      );
      const completed = state.status === "WON";
      if (!completed) {
        state = { ...state, status: "ABANDONED" };
      }
      sessionStatus = completed ? "COMPLETED" : "ABANDONED";
      const [updated] = await transaction
        .update(gameSessions)
        .set({
          status: sessionStatus,
          stateSnapshot: state as unknown as Record<string, unknown>,
          activityClockSnapshot:
            activityClock as unknown as Record<string, unknown>,
          activeDurationMs: BigInt(activityClock.accumulatedActiveMs),
          lastActiveAt: closesAt,
          completedAt: completed ? closesAt : null,
          abandonedAt: completed ? null : closesAt,
          updatedAt: observedAt,
        })
        .where(
          and(
            eq(gameSessions.id, session.id),
            eq(gameSessions.status, session.status),
          ),
        )
        .returning({ id: gameSessions.id });
      if (!updated) throw new Error("COMPETITION_SESSION_CLOSE_RACE");
    }

    if (activeScore) continue;
    if (activityClock.status !== "FINALIZED") {
      throw new Error("COMPETITION_SCORE_CLOCK_NOT_FINALIZED");
    }
    await transaction
      .insert(scores)
      .values({
        gameSessionId: session.id,
        completed: sessionStatus === "COMPLETED" && state.status === "WON",
        validMoveCount: state.validMoveCount,
        verifiedActiveDurationMs: BigInt(activityClock.accumulatedActiveMs),
        scoringVersion: OFFICIAL_SCORE_VERSION,
        computedAt: observedAt,
        createdAt: observedAt,
      })
      .onConflictDoNothing();
  }
}

async function leaderboardWithinTransaction(
  transaction: CompetitionTransaction,
  competitionId: string,
) {
  const rows = await transaction
    .select({
      entryId: competitionEntries.id,
      displayName: userProfiles.displayName,
      scoreId: scores.id,
      completed: scores.completed,
      validMoveCount: scores.validMoveCount,
      durationMs: scores.verifiedActiveDurationMs,
      stateSnapshot: gameSessions.stateSnapshot,
      activityClockSnapshot: gameSessions.activityClockSnapshot,
      observedAt: sql<Date>`statement_timestamp()`,
    })
    .from(competitionEntries)
    .innerJoin(users, eq(users.id, competitionEntries.userId))
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .innerJoin(
      gameSessions,
      eq(gameSessions.competitionEntryId, competitionEntries.id),
    )
    .leftJoin(
      scores,
      and(
        eq(scores.gameSessionId, gameSessions.id),
        isNull(scores.supersededByScoreId),
      ),
    )
    .where(eq(competitionEntries.competitionId, competitionId))
    .orderBy(
      sql`coalesce(${scores.completed}, false) desc`,
      sql`case when ${scores.completed} then ${scores.validMoveCount} end asc nulls last`,
      sql`case when ${scores.completed} then ${scores.verifiedActiveDurationMs} end asc nulls last`,
      asc(competitionEntries.id),
      asc(scores.id),
    );

  const standingsRows = rows.map((row) => {
    const state = row.stateSnapshot as unknown as KlondikeGameState;
    const activityClock =
      row.activityClockSnapshot as unknown as ServerActivityClock;
    const observedAtServerMs = new Date(row.observedAt).getTime();
    if (Number.isNaN(observedAtServerMs)) {
      throw new Error("LEADERBOARD_DATABASE_CLOCK_INVALID");
    }
    const fallbackObservedAt = Math.max(
      observedAtServerMs,
      activityClock.lastServerEventMs,
    );
    return {
      entryId: row.entryId,
      displayName: row.displayName,
      scoreId: row.scoreId,
      completed: row.completed ?? false,
      validMoveCount: row.validMoveCount ?? state.validMoveCount,
      durationMs:
        row.durationMs === null
          ? getVerifiedActivePlayMs(activityClock, fallbackObservedAt)
          : Number(row.durationMs),
    };
  });
  const completedCount = standingsRows.filter((row) => row.completed).length;
  const incompleteCount = standingsRows.length - completedCount;
  let lastCompletedRank = 0;
  return standingsRows.map((row, index) => {
    if (!row.completed) {
      return {
        rank: completedCount + 1,
        entryId: row.entryId,
        displayName: row.displayName,
        scoreId: row.scoreId,
        completed: false,
        validMoveCount: row.validMoveCount,
        verifiedActiveDurationMs: row.durationMs,
        tied: incompleteCount > 1,
      };
    }

    const previous = standingsRows[index - 1];
    const tiedWithPrevious =
      Boolean(previous?.completed) &&
      previous?.validMoveCount === row.validMoveCount &&
      previous?.durationMs === row.durationMs;
    if (!tiedWithPrevious) lastCompletedRank = index + 1;
    const next = standingsRows[index + 1];
    const tiedWithNext =
      Boolean(next?.completed) &&
      next?.validMoveCount === row.validMoveCount &&
      next?.durationMs === row.durationMs;
    return {
      rank: lastCompletedRank,
      entryId: row.entryId,
      displayName: row.displayName,
      scoreId: row.scoreId,
      completed: true,
      validMoveCount: row.validMoveCount,
      verifiedActiveDurationMs: row.durationMs,
      tied: tiedWithPrevious || tiedWithNext,
    };
  });
}

async function persistFinalLeaderboardSnapshot(
  transaction: CompetitionTransaction,
  competitionId: string,
  observedAt: Date,
) {
  const standings = await leaderboardWithinTransaction(
    transaction,
    competitionId,
  );
  const persistedStandings = standings.map((standing) => {
    if (!standing.scoreId) {
      throw new Error("FINAL_LEADERBOARD_SCORE_MISSING");
    }
    return {
      rank: standing.rank,
      entryId: standing.entryId,
      scoreId: standing.scoreId,
      tied: standing.tied,
    };
  });
  const snapshotHash = sha256Hex(
    canonicalJson({
      competitionId,
      scoringVersion: OFFICIAL_SCORE_VERSION,
      standings: persistedStandings,
    }),
  );
  const existing = await transaction
    .select()
    .from(leaderboardSnapshots)
    .where(eq(leaderboardSnapshots.competitionId, competitionId))
    .orderBy(asc(leaderboardSnapshots.createdAt), asc(leaderboardSnapshots.id));
  if (existing.length > 0) {
    if (
      existing.length !== 1 ||
      existing[0].scoringVersion !== OFFICIAL_SCORE_VERSION ||
      existing[0].snapshotHash !== snapshotHash ||
      canonicalJson(existing[0].standings) !== canonicalJson(persistedStandings)
    ) {
      throw new Error("FINAL_LEADERBOARD_SNAPSHOT_INTEGRITY_FAILURE");
    }
    return existing[0];
  }
  const [snapshot] = await transaction
    .insert(leaderboardSnapshots)
    .values({
      competitionId,
      scoringVersion: OFFICIAL_SCORE_VERSION,
      standings: persistedStandings,
      snapshotHash,
      createdAt: observedAt,
    })
    .returning();
  if (!snapshot) throw new Error("FINAL_LEADERBOARD_SNAPSHOT_FAILED");
  return snapshot;
}

export async function advancePersistentCompetitionLifecycle() {
  const database = getDatabase();
  const ruleset = await ensureConfiguredRuleset();
  return database.transaction(async (transaction) => {
    // The lifecycle lock covers publication, closure, evidence, and successor
    // creation, including the empty-table case where row locks cannot help.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${CONFIGURED_COMPETITION_LOCK}))`,
    );
    const [databaseClock] = await transaction
      .select({ observedAt: sql<Date>`clock_timestamp()` })
      .from(gameDefinitions)
      .limit(1);
    if (!databaseClock?.observedAt) {
      throw new Error("COMPETITION_DATABASE_CLOCK_UNAVAILABLE");
    }
    const observedAt = new Date(databaseClock.observedAt);
    if (Number.isNaN(observedAt.getTime())) {
      throw new Error("COMPETITION_DATABASE_CLOCK_INVALID");
    }
    const expired = await transaction
      .select()
      .from(competitions)
      .where(
        and(
          inArray(competitions.status, ["PUBLISHED", "OPEN"]),
          lte(competitions.closesAt, observedAt),
          eq(competitions.rulesetVersionId, ruleset.id),
        ),
      )
      .orderBy(asc(competitions.closesAt), asc(competitions.id))
      .for("update");

    const closed: CompetitionRecord[] = [];
    for (const record of expired) {
      let competition = record;
      if (competition.status === "PUBLISHED") {
        const [opened] = await transaction
          .update(competitions)
          .set({ status: "OPEN", updatedAt: observedAt })
          .where(
            and(
              eq(competitions.id, competition.id),
              eq(competitions.status, "PUBLISHED"),
            ),
          )
          .returning();
        if (!opened) throw new Error("COMPETITION_OPEN_TRANSITION_FAILED");
        competition = opened;
      }

      await terminalizeCompetitionSessions(
        transaction,
        competition.id,
        competition.closesAt,
        observedAt,
      );
      await persistFinalLeaderboardSnapshot(
        transaction,
        competition.id,
        observedAt,
      );
      const [closedCompetition] = await transaction
        .update(competitions)
        .set({
          status: "CLOSED",
          closedAt: competition.closesAt,
          updatedAt: observedAt,
        })
        .where(
          and(
            eq(competitions.id, competition.id),
            eq(competitions.status, "OPEN"),
          ),
        )
        .returning();
      if (!closedCompetition) {
        throw new Error("COMPETITION_CLOSE_TRANSITION_FAILED");
      }
      closed.push(closedCompetition);
    }

    // Reveal only after every selected publication has reached a terminal
    // state. The deal trigger independently rejects an early reveal.
    for (const competition of closed) {
      const [dealRecord] = await transaction
        .select()
        .from(deals)
        .where(eq(deals.id, competition.dealId))
        .limit(1);
      if (!dealRecord) throw new Error("COMPETITION_DEAL_MISSING");
      const seed = decryptRankedSeed(dealRecord.seedCiphertext);
      verifyRankedDeal(dealRecord, seed);
      if (dealRecord.revealedSeed === null) {
        const [revealed] = await transaction
          .update(deals)
          .set({ revealedSeed: seed, revealedAt: observedAt })
          .where(
            and(eq(deals.id, dealRecord.id), isNull(deals.revealedSeed)),
          )
          .returning();
        if (!revealed) throw new Error("COMPETITION_DEAL_REVEAL_FAILED");
        verifyRankedDeal(revealed, revealed.revealedSeed ?? "");
      } else {
        verifyRankedDeal(dealRecord, dealRecord.revealedSeed);
      }
    }

    let [current] = await transaction
      .select()
      .from(competitions)
      .where(
        and(
          inArray(competitions.status, ["PUBLISHED", "OPEN"]),
          gt(competitions.closesAt, observedAt),
          eq(competitions.rulesetVersionId, ruleset.id),
        ),
      )
      .orderBy(asc(competitions.opensAt), asc(competitions.id))
      .limit(1)
      .for("update");
    if (!current) {
      current = await createPublishedCompetition(
        transaction,
        ruleset.id,
      );
    }
    if (
      current.status === "PUBLISHED" &&
      current.opensAt.getTime() <= observedAt.getTime()
    ) {
      const [opened] = await transaction
        .update(competitions)
        .set({ status: "OPEN", updatedAt: observedAt })
        .where(
          and(
            eq(competitions.id, current.id),
            eq(competitions.status, "PUBLISHED"),
          ),
        )
        .returning();
      if (!opened) throw new Error("COMPETITION_OPEN_TRANSITION_FAILED");
      current = opened;
    }
    return {
      current,
      closedCompetitionIds: closed.map((competition) => competition.id),
    };
  });
}

export async function ensurePersistentCompetition() {
  return (await advancePersistentCompetitionLifecycle()).current;
}

async function projectPersistentCompetition(competition: CompetitionRecord) {
  const database = getDatabase();
  const standings = await persistentLeaderboard(competition.id);
  const [publication] = await database
    .select({
      commitment: deals.seedCommitment,
      canonicalDealHash: deals.canonicalDealHash,
      revealedSeed: deals.revealedSeed,
      revealedAt: deals.revealedAt,
      rulesetVersion: rulesetVersions.version,
      scoring: rulesetVersions.scoring,
    })
    .from(deals)
    .innerJoin(
      rulesetVersions,
      eq(rulesetVersions.id, deals.rulesetVersionId),
    )
    .where(eq(deals.id, competition.dealId))
    .limit(1);
  if (!publication) throw new Error("COMPETITION_PUBLICATION_MISSING");

  const validations = await database
    .select({
      id: dealValidations.id,
      status: dealValidations.status,
      validatorKey: dealValidations.validatorKey,
      validatorVersion: dealValidations.validatorVersion,
      evidenceHash: dealValidations.evidenceHash,
      evidence: dealValidations.evidence,
      validatedAt: dealValidations.validatedAt,
    })
    .from(dealValidations)
    .where(
      and(
        eq(dealValidations.dealId, competition.dealId),
        eq(dealValidations.status, "VERIFIED_SOLVABLE"),
      ),
    )
    .orderBy(asc(dealValidations.createdAt), asc(dealValidations.id))
    .limit(2);
  if (validations.length !== 1) {
    throw new Error("COMPETITION_VERIFIED_VALIDATION_NOT_UNIQUE");
  }
  const validation = validations[0];
  if (
    !validation.evidence ||
    !validation.evidenceHash ||
    sha256Hex(canonicalJson(validation.evidence)) !== validation.evidenceHash
  ) {
    throw new Error("DEAL_VALIDATION_EVIDENCE_HASH_MISMATCH");
  }
  const [entryCountRecord] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(competitionEntries)
    .where(eq(competitionEntries.competitionId, competition.id));
  const [finalSnapshot] = await database
    .select()
    .from(leaderboardSnapshots)
    .where(eq(leaderboardSnapshots.competitionId, competition.id))
    .orderBy(asc(leaderboardSnapshots.createdAt), asc(leaderboardSnapshots.id))
    .limit(1);
  if (
    finalSnapshot &&
    finalSnapshot.snapshotHash !==
      sha256Hex(
        canonicalJson({
          competitionId: competition.id,
          scoringVersion: finalSnapshot.scoringVersion,
          standings: finalSnapshot.standings,
        }),
      )
  ) {
    throw new Error("FINAL_LEADERBOARD_SNAPSHOT_INTEGRITY_FAILURE");
  }

  const terminal = ["CLOSED", "SETTLED", "CANCELLED"].includes(
    competition.status,
  );
  const evidenceGenerator = validation?.evidence?.dealGeneratorVersion;
  const dealGeneratorVersion =
    typeof evidenceGenerator === "string"
      ? evidenceGenerator
      : validation?.validatorKey === "CURATED_SOLVABLE"
        ? "CURATED_SOLVABLE_V1"
        : null;
  const storedScoringVersion =
    typeof publication.scoring.version === "string"
      ? publication.scoring.version
      : finalSnapshot?.scoringVersion ?? null;
  let seedVerified: true | null = null;
  if (terminal && publication.revealedSeed) {
    const [dealRecord] = await database
      .select()
      .from(deals)
      .where(eq(deals.id, competition.dealId))
      .limit(1);
    if (!dealRecord) throw new Error("COMPETITION_DEAL_MISSING");
    verifyStoredDealReveal({
      dealRecord,
      seed: publication.revealedSeed,
      rulesetVersion: publication.rulesetVersion,
      dealGeneratorVersion,
    });
    seedVerified = true;
  }

  return {
    competitionId: competition.id,
    publicName: competition.publicName,
    status: competition.status === "OPEN" ? "ACTIVE" : competition.status,
    entryCostPlayCoins: 0,
    valuablePrize: false,
    dealCommitment: publication.commitment,
    rulesetVersion: publication.rulesetVersion,
    scoringVersion: storedScoringVersion,
    dealGeneratorVersion,
    validation: validation
      ? {
          validationId: validation.id,
          status: validation.status,
          protocol:
            typeof validation.evidence?.protocol === "string"
              ? validation.evidence.protocol
              : `${validation.validatorKey}_${validation.validatorVersion}`,
          validatorKey: validation.validatorKey,
          validatorVersion: validation.validatorVersion,
          evidenceHash: validation.evidenceHash,
          validatedAtServerMs: validation.validatedAt?.getTime() ?? null,
        }
      : null,
    opensAtServerMs: competition.opensAt.getTime(),
    closesAtServerMs: competition.closesAt.getTime(),
    closedAtServerMs: terminal ? competition.closedAt?.getTime() ?? null : null,
    seedReveal:
      terminal && seedVerified ? publication.revealedSeed : null,
    revealedAtServerMs:
      terminal && seedVerified ? publication.revealedAt?.getTime() ?? null : null,
    canonicalDealHash:
      terminal && seedVerified ? publication.canonicalDealHash : null,
    seedVerified,
    entryCount: entryCountRecord?.count ?? 0,
    finalLeaderboardSnapshot: finalSnapshot
      ? {
          scoringVersion: finalSnapshot.scoringVersion,
          snapshotHash: finalSnapshot.snapshotHash,
          createdAtServerMs: finalSnapshot.createdAt.getTime(),
          standings: finalSnapshot.standings,
        }
      : null,
    standings,
  };
}

export async function persistentCompetitionSnapshot() {
  return coalescePublicCompetitionRead("current", async () => {
    const competition = await ensurePersistentCompetition();
    return projectPersistentCompetition(competition);
  });
}

export async function persistentCompetitionSnapshotById(
  competitionId: string,
) {
  if (!UUID_PATTERN.test(competitionId)) return null;
  return coalescePublicCompetitionRead(`id:${competitionId}`, async () => {
    const [existingCompetition] = await getDatabase()
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);
    if (!existingCompetition) return null;

    await advancePersistentCompetitionLifecycle();
    const [competition] = await getDatabase()
      .select()
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);
    if (!competition) return null;
    return projectPersistentCompetition(competition);
  });
}

export async function enterPersistentCompetition(
  user: DemoUser,
  competitionId: string,
  jurisdictionDecisionId: string,
  audit?: {
    requestId: string;
    eventType: "GAME_SESSION_CREATED" | "NONCASH_COMPETITION_ENTERED";
  },
): Promise<DemoGameSession> {
  const createdSession = await getDatabase().transaction(async (transaction) => {
    // Match restriction and gameplay lock order: player first, then the
    // competition-entry serializer, and only then competition rows.
    await assertPersistentAccess(user, transaction);
    // A single account may enter a competition once. Serialize the read/create
    // pair across instances, while retaining the database unique constraint as
    // a final convergence boundary.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(
        hashtext('MONETAIRE_COMPETITION_ENTRY_V1'),
        hashtext(${`${competitionId}:${user.id}`})
      )`,
    );
    if (
      !jurisdictionDecisionId ||
      !UUID_PATTERN.test(jurisdictionDecisionId)
    ) {
      throw new GameServiceError(
        "ACCOUNT_RESTRICTED",
        "An allowed Monetaire Play jurisdiction decision is required.",
      );
    }
    const [eligibilityDecision] = await transaction
      .select({ id: jurisdictionDecisions.id })
      .from(jurisdictionDecisions)
      .where(
        and(
          eq(jurisdictionDecisions.id, jurisdictionDecisionId),
          eq(jurisdictionDecisions.userId, user.id),
          eq(jurisdictionDecisions.productMode, "MONETAIRE_PLAY"),
          eq(jurisdictionDecisions.decision, "ALLOW"),
        ),
      )
      .limit(1)
      .for("key share");
    if (!eligibilityDecision) {
      throw new GameServiceError(
        "ACCOUNT_RESTRICTED",
        "An allowed Monetaire Play jurisdiction decision is required.",
      );
    }
    const [databaseClock] = await transaction
      .select({ observedAt: sql<Date>`clock_timestamp()` })
      .from(sql`(select 1) as database_clock_source`)
      .limit(1);
    if (!databaseClock) throw new Error("DATABASE_CLOCK_UNAVAILABLE");
    const now = new Date(databaseClock.observedAt);
    if (Number.isNaN(now.getTime())) {
      throw new Error("DATABASE_CLOCK_INVALID");
    }
    const [competition] = await transaction
      .select()
      .from(competitions)
      .where(
        and(
          eq(competitions.id, competitionId),
          eq(competitions.status, "OPEN"),
          lte(competitions.opensAt, now),
          gt(competitions.closesAt, now),
        ),
      )
      .limit(1)
      .for("update");
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
    const deal = verifyRankedDeal(dealRecord, seed);
    const [entry] = await transaction
      .insert(competitionEntries)
      .values({
        competitionId: competition.id,
        userId: user.id,
        dealId: dealRecord.id,
        eligibilityDecisionId: jurisdictionDecisionId,
        enteredAt: now,
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
      startedAt: now,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    });
    if (audit) {
      await appendPersistentAuditEvent(transaction, {
        eventType: audit.eventType,
        actorId: user.id,
        subjectType:
          audit.eventType === "GAME_SESSION_CREATED"
            ? "GAME_SESSION"
            : "COMPETITION_ENTRY",
        subjectId:
          audit.eventType === "GAME_SESSION_CREATED" ? id : entry.id,
        reason:
          audit.eventType === "GAME_SESSION_CREATED"
            ? "Player entered the zero-cost, noncash ranked competition."
            : "Player entered a zero-cost competition with no valuable prize.",
        requestId: audit.requestId,
        afterState: {
          mode: "NONCASH_COMPETITION",
          entryCost: 0,
          valuablePrize: false,
          dealCommitment: state.dealCommitment,
          environment: "configured",
        },
      });
    }
    return {
      id,
      userId: user.id,
      mode: "NONCASH_COMPETITION" as const,
      competitionEntryId: entry.id,
      seed: "SERVER_HELD_UNTIL_COMPETITION_CLOSE",
      state,
      activityClock,
      createdAt: now.toISOString(),
    };
  });
  return createdSession;
}

export async function persistentLeaderboard(competitionId: string) {
  return getDatabase().transaction((transaction) =>
    leaderboardWithinTransaction(transaction, competitionId),
  );
}
