import { GameStatus, KlondikeGameState } from "./game-engine";
import {
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
} from "./shared";

export const OFFICIAL_SCORE_VERSION =
  "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1" as const;

export type ActivityClockStatus = "RUNNING" | "PAUSED" | "FINALIZED";

export interface ServerActivityClock {
  readonly status: ActivityClockStatus;
  readonly accumulatedActiveMs: number;
  readonly runningSinceServerMs: number | null;
  readonly lastServerEventMs: number;
}

export interface OfficialScore {
  readonly scoreId: string;
  readonly entryId: string;
  readonly gameId: string;
  readonly scoreVersion: typeof OFFICIAL_SCORE_VERSION;
  readonly completed: boolean;
  readonly validMoves: number;
  readonly verifiedActivePlayMs: number;
  readonly gameStatus: GameStatus;
  readonly finalizedAtServerMs: number;
}

export interface RankedOfficialScore {
  readonly rank: number;
  readonly tied: boolean;
  readonly score: Readonly<OfficialScore>;
}

export function createServerActivityClock(
  serverStartedAtMs: number,
): Readonly<ServerActivityClock> {
  requireNonNegativeInteger(serverStartedAtMs, "serverStartedAtMs");
  return deepFreeze({
    status: "RUNNING",
    accumulatedActiveMs: 0,
    runningSinceServerMs: serverStartedAtMs,
    lastServerEventMs: serverStartedAtMs,
  });
}

function requireMonotonicServerTime(
  clock: Readonly<ServerActivityClock>,
  serverAtMs: number,
): void {
  requireNonNegativeInteger(serverAtMs, "serverAtMs");
  if (serverAtMs < clock.lastServerEventMs) {
    throw new DomainError(
      "NON_MONOTONIC_SERVER_TIME",
      "Server time cannot move backwards",
    );
  }
}

function runningDelta(
  clock: Readonly<ServerActivityClock>,
  serverAtMs: number,
): number {
  if (clock.status !== "RUNNING" || clock.runningSinceServerMs === null) {
    return 0;
  }
  return serverAtMs - clock.runningSinceServerMs;
}

export function pauseActivityClock(
  clock: Readonly<ServerActivityClock>,
  serverPausedAtMs: number,
): Readonly<ServerActivityClock> {
  requireMonotonicServerTime(clock, serverPausedAtMs);
  if (clock.status !== "RUNNING") {
    throw new DomainError("INVALID_CLOCK_TRANSITION", "Clock is not running");
  }

  return deepFreeze({
    status: "PAUSED",
    accumulatedActiveMs:
      clock.accumulatedActiveMs + runningDelta(clock, serverPausedAtMs),
    runningSinceServerMs: null,
    lastServerEventMs: serverPausedAtMs,
  });
}

export function resumeActivityClock(
  clock: Readonly<ServerActivityClock>,
  serverResumedAtMs: number,
): Readonly<ServerActivityClock> {
  requireMonotonicServerTime(clock, serverResumedAtMs);
  if (clock.status !== "PAUSED") {
    throw new DomainError("INVALID_CLOCK_TRANSITION", "Clock is not paused");
  }

  return deepFreeze({
    status: "RUNNING",
    accumulatedActiveMs: clock.accumulatedActiveMs,
    runningSinceServerMs: serverResumedAtMs,
    lastServerEventMs: serverResumedAtMs,
  });
}

export function getVerifiedActivePlayMs(
  clock: Readonly<ServerActivityClock>,
  serverObservedAtMs: number,
): number {
  requireMonotonicServerTime(clock, serverObservedAtMs);
  return (
    clock.accumulatedActiveMs + runningDelta(clock, serverObservedAtMs)
  );
}

export function finalizeActivityClock(
  clock: Readonly<ServerActivityClock>,
  serverFinalizedAtMs: number,
): Readonly<ServerActivityClock> {
  requireMonotonicServerTime(clock, serverFinalizedAtMs);
  if (clock.status === "FINALIZED") {
    throw new DomainError(
      "INVALID_CLOCK_TRANSITION",
      "Clock is already finalized",
    );
  }

  return deepFreeze({
    status: "FINALIZED",
    accumulatedActiveMs: getVerifiedActivePlayMs(clock, serverFinalizedAtMs),
    runningSinceServerMs: null,
    lastServerEventMs: serverFinalizedAtMs,
  });
}

/**
 * Builds the score only from server-held game and clock state. No client clock,
 * claimed move count, or client completion flag is accepted.
 */
export function createOfficialScore(input: {
  readonly scoreId: string;
  readonly entryId: string;
  readonly game: Readonly<KlondikeGameState>;
  readonly finalizedClock: Readonly<ServerActivityClock>;
}): Readonly<OfficialScore> {
  if (input.finalizedClock.status !== "FINALIZED") {
    throw new DomainError(
      "CLOCK_NOT_FINALIZED",
      "Official score requires a finalized server clock",
    );
  }

  return deepFreeze({
    scoreId: requireNonEmpty(input.scoreId, "scoreId"),
    entryId: requireNonEmpty(input.entryId, "entryId"),
    gameId: input.game.gameId,
    scoreVersion: OFFICIAL_SCORE_VERSION,
    completed: input.game.status === "WON",
    validMoves: input.game.validMoveCount,
    verifiedActivePlayMs: input.finalizedClock.accumulatedActiveMs,
    gameStatus: input.game.status,
    finalizedAtServerMs: input.finalizedClock.lastServerEventMs,
  });
}

/**
 * Completed entries rank before every incomplete entry. Completed entries then
 * rank by fewer valid moves and lower server-verified active time. The fairness
 * contract does not define a progress metric for incomplete games, so incomplete
 * entries remain exact ties instead of inventing one.
 */
export function compareOfficialScores(
  left: Readonly<OfficialScore>,
  right: Readonly<OfficialScore>,
): number {
  if (left.completed !== right.completed) {
    return left.completed ? -1 : 1;
  }
  if (!left.completed) {
    return 0;
  }
  if (left.validMoves !== right.validMoves) {
    return left.validMoves - right.validMoves;
  }
  return left.verifiedActivePlayMs - right.verifiedActivePlayMs;
}

export function areExactOfficialTies(
  left: Readonly<OfficialScore>,
  right: Readonly<OfficialScore>,
): boolean {
  return compareOfficialScores(left, right) === 0;
}

export function rankOfficialScores(
  scores: readonly Readonly<OfficialScore>[],
): readonly Readonly<RankedOfficialScore>[] {
  const sorted = [...scores].sort((left, right) => {
    const officialComparison = compareOfficialScores(left, right);
    if (officialComparison !== 0) {
      return officialComparison;
    }
    // Stable, deterministic display only. Rank remains tied.
    return left.entryId.localeCompare(right.entryId);
  });

  return deepFreeze(
    sorted.map((score, index) => {
      const prior = index > 0 ? sorted[index - 1] : undefined;
      const next = index < sorted.length - 1 ? sorted[index + 1] : undefined;
      const tiedWithPrior =
        prior !== undefined && areExactOfficialTies(prior, score);
      const tiedWithNext =
        next !== undefined && areExactOfficialTies(score, next);

      let rank = index + 1;
      if (tiedWithPrior) {
        const priorRanked = sorted
          .slice(0, index)
          .map((candidate, candidateIndex) => ({
            candidate,
            rank: candidateIndex + 1,
          }))
          .reverse()
          .find(({ candidate }) => !areExactOfficialTies(candidate, score));
        rank = priorRanked === undefined ? 1 : priorRanked.rank + 1;
      }

      return {
        rank,
        tied: tiedWithPrior || tiedWithNext,
        score,
      };
    }),
  );
}
