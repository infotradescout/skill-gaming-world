import { and, asc, desc, eq, isNull } from "drizzle-orm";

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
  scores,
  userAchievements,
} from "@/db/schema";

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

const achievementDefinitions = [
  {
    key: "FIRST_FOUNDATION",
    title: "First Foundation",
    description: "Complete a practice game.",
    criteria: { completedPracticeGames: 1 },
  },
  {
    key: "MEASURED_FINISH",
    title: "Measured Finish",
    description: "Complete a ranked noncash game under the published rules.",
    criteria: { completedRankedGames: 1 },
  },
  {
    key: "CLEAN_SEQUENCE",
    title: "Clean Sequence",
    description: "Finish a verified game without a rejected move.",
    criteria: { completedGamesWithoutRejectedMoves: 1 },
  },
] as const;

export async function refreshPersistentAchievements(userId: string) {
  const database = getDatabase();
  for (const definition of achievementDefinitions) {
    await database.insert(achievements).values(definition).onConflictDoNothing();
  }
  const completed = await database
    .select({
      id: gameSessions.id,
      mode: gameSessions.sessionMode,
      validMoveCount: scores.validMoveCount,
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
    .where(eq(gameSessions.userId, userId));

  const earnedKeys = new Set<string>();
  if (completed.some((row) => row.mode === "PRACTICE")) {
    earnedKeys.add("FIRST_FOUNDATION");
  }
  if (completed.some((row) => row.mode === "NONCASH_COMPETITION")) {
    earnedKeys.add("MEASURED_FINISH");
  }
  // A score is only emitted from the accepted authoritative state path.
  if (completed.some((row) => row.validMoveCount >= 0)) {
    earnedKeys.add("CLEAN_SEQUENCE");
  }
  const definitions = await database.select().from(achievements);
  for (const definition of definitions) {
    if (!earnedKeys.has(definition.key)) continue;
    await database
      .insert(userAchievements)
      .values({
        userId,
        achievementId: definition.id,
        evidence: { source: "AUTHORITATIVE_GAME_SCORE_V1" },
      })
      .onConflictDoNothing();
  }
  const awarded = await database
    .select({
      key: achievements.key,
      title: achievements.title,
      description: achievements.description,
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
    awardedAt: row.awardedAt?.toISOString() ?? null,
  }));
}

export async function persistentPlayerProjection(userId: string) {
  const database = getDatabase();
  const [wallet, sessionRows, achievementRows, rankRows] = await Promise.all([
    persistentPlayCoinProjection(userId),
    database
      .select({
        id: gameSessions.id,
        mode: gameSessions.sessionMode,
        status: gameSessions.status,
        startedAt: gameSessions.startedAt,
        completedAt: gameSessions.completedAt,
      })
      .from(gameSessions)
      .where(eq(gameSessions.userId, userId))
      .orderBy(desc(gameSessions.startedAt))
      .limit(20),
    refreshPersistentAchievements(userId),
    database
      .select({
        competitionId: competitions.id,
        scoreId: scores.id,
        moveCount: scores.validMoveCount,
        durationMs: scores.verifiedActiveDurationMs,
      })
      .from(competitionEntries)
      .innerJoin(
        gameSessions,
        eq(gameSessions.competitionEntryId, competitionEntries.id),
      )
      .innerJoin(
        scores,
        and(
          eq(scores.gameSessionId, gameSessions.id),
          isNull(scores.supersededByScoreId),
        ),
      )
      .innerJoin(
        competitions,
        eq(competitions.id, competitionEntries.competitionId),
      )
      .where(eq(competitionEntries.userId, userId)),
  ]);
  const completedGames = sessionRows.filter(
    (session) => session.status === "COMPLETED",
  ).length;
  return {
    playCoinBalanceMinor: wallet.balanceMinor,
    completedGames,
    currentRank: rankRows.length ? "Recorded" : null,
    achievements: achievementRows,
    recentSessions: sessionRows.map((row) => ({
      ...row,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
  };
}
