import { getVerifiedActivePlayMs, rankOfficialScores } from "@/domain";

import { demoAchievementProjection } from "./achievements";
import {
  getDemoStore,
  playCoinBalance,
  playCoinHistory,
} from "./demo-store";
import { getRuntimeEnv } from "./env";
import {
  persistentPlayerProjection,
  type PlayerCurrentRank,
} from "./persistent-projections";

export function demoCurrentRank(userId: string): PlayerCurrentRank | null {
  const store = getDemoStore();
  const ownedEntries = store.competitionEntries
    .filter((entry) => entry.userId === userId)
    .toSorted(
      (left, right) => right.enteredAtServerMs - left.enteredAtServerMs,
    );

  const entry = ownedEntries[0];
  if (!entry) return null;
  const competitionEntryIds = new Set(
    store.competitionEntries
      .filter((candidate) => candidate.competitionId === entry.competitionId)
      .map((candidate) => candidate.entryId),
  );
  const standing = rankOfficialScores(
    store.officialScores.filter((score) =>
      competitionEntryIds.has(score.entryId),
    ),
  ).find((candidate) => candidate.score.entryId === entry.entryId);
  return standing
    ? {
        competitionId: entry.competitionId,
        entryId: entry.entryId,
        rank: standing.rank,
        tied: standing.tied,
      }
    : null;
}

export function demoPlayerProjection(userId: string) {
  const store = getDemoStore();
  const observedAtMs = Date.now();
  const ownedSessions = [...store.gameSessionsById.values()]
    .filter((session) => session.userId === userId)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
  const recentSessions = ownedSessions
    .slice(0, 20)
    .map((session) => {
      const competitionId = session.competitionEntryId
        ? store.competitionEntries.find(
            (entry) => entry.entryId === session.competitionEntryId,
          )?.competitionId
        : undefined;
      const status =
        session.state.status === "WON" ? "COMPLETED" : session.state.status;
      const officialScore = store.officialScores.find(
        (score) => score.gameId === session.id,
      );
      const rejectedMoveCount = store.rejectedGameCommandAttempts.filter(
        (attempt) =>
          attempt.userId === userId && attempt.gameSessionId === session.id,
      ).length;
      return {
        id: session.id,
        mode: session.mode,
        status,
        competitionEntryId: session.competitionEntryId ?? null,
        competitionId: competitionId ?? null,
        startedAt: session.createdAt,
        completedAt:
          status === "COMPLETED"
            ? new Date(session.activityClock.lastServerEventMs).toISOString()
            : null,
        scoreCompleted:
          officialScore?.completed ??
          (status === "ACTIVE" ? null : status === "COMPLETED"),
        scoreValidMoveCount:
          officialScore?.validMoves ?? session.state.validMoveCount,
        scoreVerifiedActivePlayMs:
          officialScore?.verifiedActivePlayMs ??
          getVerifiedActivePlayMs(session.activityClock, observedAtMs),
        acceptedMoveCount: session.state.validMoveCount,
        rejectedMoveCount,
      };
    });

  return {
    playCoinBalanceMinor: playCoinBalance(userId),
    playCoinEntries: playCoinHistory(userId),
    completedGames: ownedSessions.filter(
      (session) => session.state.status === "WON",
    ).length,
    currentRank: demoCurrentRank(userId),
    achievements: demoAchievementProjection(userId),
    recentSessions,
  };
}

export async function runtimePlayerProjection(userId: string) {
  return getRuntimeEnv().DEMO_MODE
    ? demoPlayerProjection(userId)
    : persistentPlayerProjection(userId);
}
