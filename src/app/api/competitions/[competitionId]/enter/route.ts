import { NextRequest, NextResponse } from "next/server";

import { appendDemoAuditEvent } from "@/lib/audit";
import { currentDemoUser } from "@/lib/auth";
import {
  CURATED_COMPETITION_ID,
  publicCompetitionSnapshot,
} from "@/lib/competition-catalog";
import {
  createCompetitionSession,
  GameServiceError,
  publicGameSession,
} from "@/lib/game-service";
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
  const rateError = enforceRateLimit(request, "competition-entry", 10, 60_000);
  if (rateError) return rateError;
  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }
  const { competitionId } = await context.params;
  if (competitionId !== CURATED_COMPETITION_ID) {
    return jsonError(404, "COMPETITION_NOT_FOUND", "Competition was not found.", id);
  }

  try {
    const session = createCompetitionSession(user);
    appendDemoAuditEvent({
      eventType: "NONCASH_COMPETITION_ENTERED",
      actorId: user.id,
      subjectType: "COMPETITION_ENTRY",
      subjectId: session.competitionEntryId ?? session.id,
      reason: "Player entered a zero-cost competition with no valuable prize.",
      afterState: {
        entryCost: 0,
        valuablePrize: false,
        dealCommitment: session.state.dealCommitment,
      },
    });
    return NextResponse.json(
      {
        competition: publicCompetitionSnapshot(),
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
    return jsonError(500, "COMPETITION_ENTRY_FAILED", "Entry could not be created.", id);
  }
}
