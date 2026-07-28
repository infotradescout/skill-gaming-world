import { getDemoStore } from "./demo-store";

export const ACHIEVEMENT_DEFINITIONS = [
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

export function demoAchievementProjection(userId: string) {
  const store = getDemoStore();
  const wonSessions = [...store.gameSessionsById.values()].filter(
    (session) => session.userId === userId && session.state.status === "WON",
  );
  const rejectedSessionIds = new Set(
    store.rejectedGameCommandAttempts
      .filter((attempt) => attempt.userId === userId)
      .map((attempt) => attempt.gameSessionId),
  );
  const earnedSessionByKey = new Map<string, (typeof wonSessions)[number]>();
  earnedSessionByKey.set(
    "FIRST_FOUNDATION",
    wonSessions.find((session) => session.mode === "PRACTICE")!,
  );
  earnedSessionByKey.set(
    "MEASURED_FINISH",
    wonSessions.find((session) => session.mode === "NONCASH_COMPETITION")!,
  );
  earnedSessionByKey.set(
    "CLEAN_SEQUENCE",
    wonSessions.find((session) => !rejectedSessionIds.has(session.id))!,
  );

  return ACHIEVEMENT_DEFINITIONS.map(({ key, title, description }) => {
    const session = earnedSessionByKey.get(key);
    return {
      key,
      title,
      description,
      awardedAt: session
        ? new Date(session.activityClock.lastServerEventMs).toISOString()
        : null,
    };
  });
}
