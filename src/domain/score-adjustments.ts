import {
  AdminActor,
  AdminAuditLog,
  appendAdminAuditEvent,
} from "./admin-audit";
import { GameStatus } from "./game-engine";
import { OfficialScore } from "./scoring";
import {
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
} from "./shared";

export interface ScoreRankingFields {
  readonly completed: boolean;
  readonly validMoves: number;
  readonly verifiedActivePlayMs: number;
  readonly gameStatus: GameStatus;
}

export interface OfficialScoreAdjustment {
  readonly adjustmentId: string;
  readonly auditId: string;
  readonly scoreId: string;
  readonly actorId: string;
  readonly actorRole: "COMPLIANCE_ADMIN" | "SUPER_ADMIN";
  readonly serverRecordedAtMs: number;
  readonly reason: string;
  readonly beforeState: Readonly<ScoreRankingFields>;
  readonly afterState: Readonly<ScoreRankingFields>;
}

export interface AuditedOfficialScore {
  readonly original: Readonly<OfficialScore>;
  readonly adjustments: readonly Readonly<OfficialScoreAdjustment>[];
}

export function createAuditedOfficialScore(
  score: Readonly<OfficialScore>,
): Readonly<AuditedOfficialScore> {
  return deepFreeze({ original: score, adjustments: [] });
}

function rankingFields(
  score: Readonly<OfficialScore>,
): Readonly<ScoreRankingFields> {
  return deepFreeze({
    completed: score.completed,
    validMoves: score.validMoves,
    verifiedActivePlayMs: score.verifiedActivePlayMs,
    gameStatus: score.gameStatus,
  });
}

export function getEffectiveOfficialScore(
  record: Readonly<AuditedOfficialScore>,
): Readonly<OfficialScore> {
  const correction =
    record.adjustments[record.adjustments.length - 1]?.afterState;
  return correction === undefined
    ? record.original
    : deepFreeze({ ...record.original, ...correction });
}

export function adjustOfficialScoreAsAdmin(input: {
  readonly score: Readonly<AuditedOfficialScore>;
  readonly auditLog: Readonly<AdminAuditLog>;
  readonly adjustmentId: string;
  readonly auditId: string;
  readonly actor: Readonly<AdminActor>;
  readonly serverRecordedAtMs: number;
  readonly reason: string;
  readonly corrected: Readonly<ScoreRankingFields>;
}): {
  readonly score: Readonly<AuditedOfficialScore>;
  readonly effectiveScore: Readonly<OfficialScore>;
  readonly auditLog: Readonly<AdminAuditLog>;
  readonly adjustment: Readonly<OfficialScoreAdjustment>;
} {
  const adjustmentId = requireNonEmpty(
    input.adjustmentId,
    "adjustmentId",
  );
  if (
    input.score.adjustments.some(
      (adjustment) => adjustment.adjustmentId === adjustmentId,
    )
  ) {
    throw new DomainError(
      "DUPLICATE_SCORE_ADJUSTMENT",
      "Score adjustment id was already recorded",
    );
  }
  requireNonNegativeInteger(
    input.serverRecordedAtMs,
    "serverRecordedAtMs",
  );
  const priorAdjustment =
    input.score.adjustments[input.score.adjustments.length - 1];
  const earliestCorrectionTime =
    priorAdjustment?.serverRecordedAtMs ??
    input.score.original.finalizedAtServerMs;
  if (input.serverRecordedAtMs < earliestCorrectionTime) {
    throw new DomainError(
      "NON_MONOTONIC_SCORE_ADJUSTMENT_TIME",
      "Score adjustment cannot precede the score or prior correction",
    );
  }
  requireNonNegativeInteger(input.corrected.validMoves, "validMoves");
  requireNonNegativeInteger(
    input.corrected.verifiedActivePlayMs,
    "verifiedActivePlayMs",
  );
  if (
    input.corrected.completed !==
    (input.corrected.gameStatus === "WON")
  ) {
    throw new DomainError(
      "INCONSISTENT_SCORE_CORRECTION",
      "Completed state must agree with the authoritative game status",
    );
  }
  if (
    input.actor.role !== "COMPLIANCE_ADMIN" &&
    input.actor.role !== "SUPER_ADMIN"
  ) {
    throw new DomainError(
      "ADMIN_ACTION_FORBIDDEN",
      "Only compliance or super administrators can correct a score",
    );
  }

  const beforeState = rankingFields(getEffectiveOfficialScore(input.score));
  const afterState = deepFreeze({ ...input.corrected });
  if (
    beforeState.completed === afterState.completed &&
    beforeState.validMoves === afterState.validMoves &&
    beforeState.verifiedActivePlayMs ===
      afterState.verifiedActivePlayMs &&
    beforeState.gameStatus === afterState.gameStatus
  ) {
    throw new DomainError(
      "NO_SCORE_CHANGE",
      "Score correction must change the score",
    );
  }

  const reason = requireNonEmpty(input.reason, "reason");
  const auditId = requireNonEmpty(input.auditId, "auditId");
  const adjustment = deepFreeze({
    adjustmentId,
    auditId,
    scoreId: input.score.original.scoreId,
    actorId: input.actor.actorId,
    actorRole: input.actor.role,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason,
    beforeState,
    afterState,
  }) as Readonly<OfficialScoreAdjustment>;
  const score = deepFreeze({
    original: input.score.original,
    adjustments: [...input.score.adjustments, adjustment],
  });
  const effectiveScore = getEffectiveOfficialScore(score);
  const audit = appendAdminAuditEvent(input.auditLog, {
    auditId,
    actionType: "OFFICIAL_SCORE_ADJUSTMENT",
    actor: input.actor,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason,
    subjectType: "OFFICIAL_SCORE",
    subjectId: input.score.original.scoreId,
    beforeState,
    afterState,
  });

  return deepFreeze({
    score,
    effectiveScore,
    auditLog: audit.log,
    adjustment,
  });
}
