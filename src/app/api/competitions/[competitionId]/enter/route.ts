import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendRuntimeAuditEvent } from "@/lib/audit";
import { currentRuntimeUser } from "@/lib/auth";
import {
  CURATED_COMPETITION_ID,
  publicCompetitionSnapshot,
} from "@/lib/competition-catalog";
import {
  createCompetitionSession,
  GameServiceError,
  publicGameSession,
} from "@/lib/game-service";
import { getRuntimeEnv } from "@/lib/env";
import { authorizeMonetairePlay } from "@/lib/configured-jurisdiction";
import {
  enterPersistentCompetition,
  persistentCompetitionSnapshot,
} from "@/lib/persistent-competition";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ competitionId: string }> },
) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "competition-entry", 10, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }
  const { competitionId } = await context.params;
  const env = getRuntimeEnv();
  if (env.DEMO_MODE && competitionId !== CURATED_COMPETITION_ID) {
    return jsonError(404, "COMPETITION_NOT_FOUND", "Competition was not found.", id);
  }
  if (!env.DEMO_MODE && !z.string().uuid().safeParse(competitionId).success) {
    return jsonError(404, "COMPETITION_NOT_FOUND", "Competition was not found.", id);
  }
  const authorization = await authorizeMonetairePlay(user, id);
  if (!authorization.allowed) {
    return jsonError(
      503,
      "JURISDICTION_ADAPTER_REQUIRED",
      "Competition entry requires a configured server jurisdiction decision.",
      id,
    );
  }
  if (!env.DEMO_MODE && !authorization.jurisdictionDecisionId) {
    return jsonError(
      500,
      "JURISDICTION_DECISION_NOT_RECORDED",
      "Competition entry authorization evidence was not recorded.",
      id,
    );
  }

  try {
    const competition = env.DEMO_MODE
      ? publicCompetitionSnapshot()
      : await persistentCompetitionSnapshot();
    const resolvedCompetitionId =
      "competitionId" in competition ? competition.competitionId : competition.id;
    if (resolvedCompetitionId !== competitionId) {
      return jsonError(404, "COMPETITION_NOT_FOUND", "Competition was not found.", id);
    }
    const session = env.DEMO_MODE
      ? createCompetitionSession(user)
      : await enterPersistentCompetition(
          user,
          competitionId,
          authorization.jurisdictionDecisionId!,
          { requestId: id, eventType: "NONCASH_COMPETITION_ENTERED" },
        );
    if (env.DEMO_MODE) {
      await appendRuntimeAuditEvent({
        eventType: "NONCASH_COMPETITION_ENTERED",
        actorId: user.id,
        subjectType: "COMPETITION_ENTRY",
        subjectId: session.competitionEntryId ?? session.id,
        reason: "Player entered a zero-cost competition with no valuable prize.",
        afterState: {
          entryCost: 0,
          valuablePrize: false,
          dealCommitment: session.state.dealCommitment,
          environment: "safe-demo",
        },
      });
    }
    return NextResponse.json(
      {
        competition,
        session: publicGameSession(session),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof GameServiceError) {
      return jsonError(
        error.code === "DUPLICATE_COMPETITION_ENTRY" ? 409 : 403,
        error.code,
        error.message,
        id,
      );
    }
    console.error("COMPETITION_ENTRY_FAILED", {
      requestId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(500, "COMPETITION_ENTRY_FAILED", "Entry could not be created.", id);
  }
}
