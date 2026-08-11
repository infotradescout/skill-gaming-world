import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  achievements,
  competitionEntries,
  competitions,
  gameSessions,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  ledgers,
  moveEvents,
  scores,
  userAchievements,
} from "@/db/schema";
import { ACHIEVEMENT_DEFINITIONS } from "./achievements";
import {
  advancePersistentCompetitionLifecycle,
  persistentLeaderboard,
} from "./persistent-competition";

export type PlayCoinHistoryEntry = {
  id: string;
  transactionId: string;
  direction: "CREDIT" | "DEBIT";
  amountMinor: number;
  balanceAfterMinor: number;
  reason: string;
  createdAt: string;
  chargedRealMoney: false;
};

export type PlayerCurrentRank = {
  competitionId: string;
  entryId: string;
  rank: number;
  tied: boolean;
};

export const CURRENT_RANK_COMPETITION_STATUSES = [
  "PUBLISHED",
  "OPEN",
] as const;

export type SessionScoreEvidence = {
  sessionId: string;
  completed: boolean;
  validMoveCount: number;
  verifiedActivePlayMs: number;
};

export type SessionMoveEvidence = {
  sessionId: string;
  accepted: boolean;
};

export type SessionHistoryEvidence = {
  scoreCompleted: boolean | null;
  scoreValidMoveCount: number | null;
  scoreVerifiedActivePlayMs: number | null;
  acceptedMoveCount: number;
  rejectedMoveCount: number;
};

export function sessionHistoryEvidence(
  sessions: readonly { id: string }[],
  scores: readonly SessionScoreEvidence[],
  moves: readonly SessionMoveEvidence[],
): Readonly<Record<string, Readonly<SessionHistoryEvidence>>> {
  const sessionIds = new Set(sessions.map((session) => session.id));
  const evidence: Record<string, SessionHistoryEvidence> = Object.fromEntries(
    sessions.map((session) => [
      session.id,
      {
        scoreCompleted: null,
        scoreValidMoveCount: null,
        scoreVerifiedActivePlayMs: null,
        acceptedMoveCount: 0,
        rejectedMoveCount: 0,
      },
    ]),
  );
  for (const score of scores) {
    if (!sessionIds.has(score.sessionId)) continue;
    evidence[score.sessionId].scoreCompleted = score.completed;
    evidence[score.sessionId].scoreValidMoveCount = score.validMoveCount;
    evidence[score.sessionId].scoreVerifiedActivePlayMs =
      score.verifiedActivePlayMs;
  }
  for (const move of moves) {
    if (!sessionIds.has(move.sessionId)) continue;
    if (move.accepted) evidence[move.sessionId].acceptedMoveCount += 1;
    else evidence[move.sessionId].rejectedMoveCount += 1;
  }
  return Object.freeze(evidence);
}

export type ConfiguredCompletedSessionEvidence = {
  sessionId: string;
  scoreId: string;
  mode: string;
  terminalAtServerMs?: number;
};

export type ConfiguredMoveEvidence = {
  id: string;
  sessionId: string;
  accepted: boolean;
  serverReceivedAtServerMs?: number;
};

export function configuredAchievementEvidence(
  completed: readonly ConfiguredCompletedSessionEvidence[],
  moves: readonly ConfiguredMoveEvidence[],
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const evidenceFor = (session: ConfiguredCompletedSessionEvidence) => ({
    source: "AUTHORITATIVE_GAME_SCORE_V2",
    gameSessionId: session.sessionId,
    scoreId: session.scoreId,
  });
  const firstPractice = completed.find((row) => row.mode === "PRACTICE");
  const firstRanked = completed.find(
    (row) => row.mode === "NONCASH_COMPETITION",
  );
  const firstClean = completed.find((row) => {
    const sessionMoves = moves.filter(
      (move) =>
        move.sessionId === row.sessionId &&
        (row.terminalAtServerMs === undefined ||
          move.serverReceivedAtServerMs === undefined ||
          move.serverReceivedAtServerMs <= row.terminalAtServerMs),
    );
    return sessionMoves.length > 0 && sessionMoves.every((move) => move.accepted);
  });
  const evidence: Record<string, Readonly<Record<string, unknown>>> = {};
  if (firstPractice) evidence.FIRST_FOUNDATION = evidenceFor(firstPractice);
  if (firstRanked) evidence.MEASURED_FINISH = evidenceFor(firstRanked);
  if (firstClean) {
    evidence.CLEAN_SEQUENCE = {
      ...evidenceFor(firstClean),
      moveEventIds: moves
        .filter(
          (move) =>
            move.sessionId === firstClean.sessionId &&
            (firstClean.terminalAtServerMs === undefined ||
              move.serverReceivedAtServerMs === undefined ||
              move.serverReceivedAtServerMs <=
                firstClean.terminalAtServerMs),
        )
        .map((move) => move.id),
      rejectedMoveEventIds: [],
    };
  }
  return Object.freeze(evidence);
}

export function currentRankForEntry(
  competitionId: string,
  entryId: string,
  standings: readonly {
    entryId?: string;
    rank: number;
    tied: boolean;
  }[],
): PlayerCurrentRank | null {
  const standing = standings.find((candidate) => candidate.entryId === entryId);
  return standing
    ? {
        competitionId,
        entryId,
        rank: standing.rank,
        tied: standing.tied,
      }
    : null;
}

function signedAmount(direction: "CREDIT" | "DEBIT", amount: bigint): bigint {
  return direction === "CREDIT" ? amount : -amount;
}

export async function persistentPlayCoinProjection(
  userId: string,
): Promise<{ balanceMinor: number; entries: PlayCoinHistoryEntry[] }> {
  const rows = await getDatabase()
    .select({
      id: ledgerEntries.id,
      transactionId: ledgerTransactions.id,
      direction: ledgerEntries.direction,
      amountMinor: ledgerEntries.amountMinor,
      reason: ledgerTransactions.reason,
      createdAt: ledgerTransactions.createdAt,
    })
    .from(ledgerEntries)
    .innerJoin(
      ledgerTransactions,
      eq(ledgerTransactions.id, ledgerEntries.transactionId),
    )
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .innerJoin(ledgers, eq(ledgers.id, ledgerEntries.ledgerId))
    .where(
      and(
        eq(ledgerAccounts.userId, userId),
        eq(ledgers.ledgerType, "PLAY_COIN"),
      ),
    )
    .orderBy(asc(ledgerTransactions.createdAt), asc(ledgerEntries.id));

  let balance = BigInt(0);
  const entries = rows.map((row) => {
    balance += signedAmount(row.direction, row.amountMinor);
    if (balance < BigInt(0)) throw new Error("PLAY_COIN_NEGATIVE_BALANCE");
    return {
      id: row.id,
      transactionId: row.transactionId,
      direction: row.direction,
      amountMinor: Number(row.amountMinor),
      balanceAfterMinor: Number(balance),
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      chargedRealMoney: false as const,
    };
  });
  return { balanceMinor: Number(balance), entries };
}

export async function refreshPersistentAchievements(userId: string) {
  const database = getDatabase();
  for (const definition of ACHIEVEMENT_DEFINITIONS) {
    await database.insert(achievements).values(definition).onConflictDoNothing();
  }
  const completed = await database
    .select({
      sessionId: gameSessions.id,
      scoreId: scores.id,
      mode: gameSessions.sessionMode,
      scoreComputedAt: scores.computedAt,
      sessionCompletedAt: gameSessions.completedAt,
      sessionAbandonedAt: gameSessions.abandonedAt,
    })
    .from(gameSessions)
    .innerJoin(
      scores,
      and(
        eq(scores.gameSessionId, gameSessions.id),
        isNull(scores.supersededByScoreId),
        eq(scores.completed, true),
      ),
    )
    .where(eq(gameSessions.userId, userId))
    .orderBy(asc(gameSessions.startedAt), asc(gameSessions.id));
  const moveEvidence = await database
    .select({
      id: moveEvents.id,
      sessionId: moveEvents.gameSessionId,
      accepted: moveEvents.accepted,
      serverReceivedAt: moveEvents.serverReceivedAt,
    })
    .from(moveEvents)
    .innerJoin(gameSessions, eq(gameSessions.id, moveEvents.gameSessionId))
    .where(eq(gameSessions.userId, userId))
    .orderBy(asc(moveEvents.serverReceivedAt), asc(moveEvents.id));
  const earnedEvidence = configuredAchievementEvidence(
    completed.map((session) => ({
      sessionId: session.sessionId,
      scoreId: session.scoreId,
      mode: session.mode,
      terminalAtServerMs: (
        session.sessionCompletedAt ??
        session.sessionAbandonedAt ??
        session.scoreComputedAt
      ).getTime(),
    })),
    moveEvidence.map((move) => ({
      id: move.id,
      sessionId: move.sessionId,
      accepted: move.accepted,
      serverReceivedAtServerMs: move.serverReceivedAt.getTime(),
    })),
  );
  const earnedAtBySessionId = new Map(
    completed.map((session) => [
      session.sessionId,
      session.sessionCompletedAt ??
        session.sessionAbandonedAt ??
        session.scoreComputedAt,
    ]),
  );
  const definitions = await database.select().from(achievements);
  for (const definition of definitions) {
    const evidence = earnedEvidence[definition.key];
    if (!evidence) continue;
    const evidenceSessionId = evidence.gameSessionId;
    const awardedAt =
      typeof evidenceSessionId === "string"
        ? earnedAtBySessionId.get(evidenceSessionId)
        : null;
    if (!awardedAt) throw new Error("ACHIEVEMENT_EVIDENCE_TIME_MISSING");
    await database
      .insert(userAchievements)
      .values({
        userId,
        achievementId: definition.id,
        evidence,
        awardedAt,
      })
      .onConflictDoUpdate({
        target: [userAchievements.userId, userAchievements.achievementId],
        set: { evidence, awardedAt },
      });
  }
  const awarded = await database
    .select({
      key: achievements.key,
      title: achievements.title,
      description: achievements.description,
      evidence: userAchievements.evidence,
      awardedAt: userAchievements.awardedAt,
    })
    .from(achievements)
    .leftJoin(
      userAchievements,
      and(
        eq(userAchievements.achievementId, achievements.id),
        eq(userAchievements.userId, userId),
      ),
    )
    .where(eq(achievements.active, true))
    .orderBy(asc(achievements.title));
  return awarded.map((row) => ({
    ...row,
    evidence: earnedEvidence[row.key] ?? null,
    awardedAt: earnedEvidence[row.key]
      ? (row.awardedAt?.toISOString() ?? null)
      : null,
  }));
}

async function persistentCurrentRank(userId: string) {
  const [ownedStanding] = await getDatabase()
    .select({
      competitionId: competitionEntries.competitionId,
      entryId: competitionEntries.id,
    })
    .from(competitionEntries)
    .innerJoin(
      competitions,
      eq(competitions.id, competitionEntries.competitionId),
    )
    .where(
      and(
        eq(competitionEntries.userId, userId),
        inArray(competitions.status, CURRENT_RANK_COMPETITION_STATUSES),
      ),
    )
    .orderBy(desc(competitions.opensAt), desc(competitionEntries.enteredAt))
    .limit(1);
  if (!ownedStanding) return null;
  return currentRankForEntry(
    ownedStanding.competitionId,
    ownedStanding.entryId,
    await persistentLeaderboard(ownedStanding.competitionId),
  );
}

export async function persistentPlayerProjection(userId: string) {
  // Dashboard/history reads are also lifecycle read boundaries. Advance first
  // so every parallel projection below observes one post-cutoff database truth
  // instead of returning an expired OPEN competition or ACTIVE session.
  await advancePersistentCompetitionLifecycle();
  const database = getDatabase();
  const [
    wallet,
    sessionRows,
    [completedGamesRow],
    achievementRows,
    currentRank,
  ] = await Promise.all([
    persistentPlayCoinProjection(userId),
    database
      .select({
        id: gameSessions.id,
        mode: gameSessions.sessionMode,
        status: gameSessions.status,
        competitionEntryId: gameSessions.competitionEntryId,
        startedAt: gameSessions.startedAt,
        completedAt: gameSessions.completedAt,
      })
      .from(gameSessions)
      .where(eq(gameSessions.userId, userId))
      .orderBy(desc(gameSessions.startedAt))
      .limit(20),
    database
      .select({ completedGames: count() })
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.userId, userId),
          eq(gameSessions.status, "COMPLETED"),
        ),
      ),
    refreshPersistentAchievements(userId),
    persistentCurrentRank(userId),
  ]);
  const completedGames = completedGamesRow?.completedGames ?? 0;
  const [scoreRows, moveRows] = sessionRows.length
    ? await Promise.all([
        database
          .select({
            sessionId: scores.gameSessionId,
            completed: scores.completed,
            validMoveCount: scores.validMoveCount,
            verifiedActivePlayMs: scores.verifiedActiveDurationMs,
          })
          .from(scores)
          .innerJoin(gameSessions, eq(gameSessions.id, scores.gameSessionId))
          .where(
            and(
              eq(gameSessions.userId, userId),
              isNull(scores.supersededByScoreId),
            ),
          ),
        database
          .select({
            sessionId: moveEvents.gameSessionId,
            accepted: moveEvents.accepted,
          })
          .from(moveEvents)
          .innerJoin(gameSessions, eq(gameSessions.id, moveEvents.gameSessionId))
          .where(eq(gameSessions.userId, userId)),
      ])
    : [[], []];
  const historyEvidence = sessionHistoryEvidence(
    sessionRows,
    scoreRows.map((row) => ({
      ...row,
      verifiedActivePlayMs: Number(row.verifiedActivePlayMs),
    })),
    moveRows,
  );
  return {
    playCoinBalanceMinor: wallet.balanceMinor,
    playCoinEntries: wallet.entries,
    completedGames,
    currentRank,
    achievements: achievementRows,
    recentSessions: sessionRows.map((row) => ({
      ...row,
      ...historyEvidence[row.id],
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
  };
}
