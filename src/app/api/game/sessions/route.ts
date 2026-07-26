import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendDemoAuditEvent } from "@/lib/audit";
import { currentDemoUser } from "@/lib/auth";
import { getRuntimeEnv } from "@/lib/env";
import {
  createCompetitionSession,
  createPracticeSession,
  GameServiceError,
  publicGameSession,
} from "@/lib/game-service";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { evaluateInitialOperationGate } from "@/lib/operation-gates";

const startSchema = z.object({
  mode: z.enum(["PRACTICE", "NONCASH_COMPETITION"]),
});

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = enforceRateLimit(request, "start-game", 30, 60_000);
  if (rateError) return rateError;
  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }

  const env = getRuntimeEnv();
  if (
    !env.DEMO_MODE ||
    evaluateInitialOperationGate("mode.monetaire_play", env).decision !==
      "ALLOW"
  ) {
    return jsonError(
      503,
      "JURISDICTION_ADAPTER_REQUIRED",
      "Game sessions require a configured server jurisdiction decision.",
      id,
    );
  }

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_GAME_MODE", "Choose a supported game mode.", id);
  }

  try {
    const session =
      parsed.data.mode === "PRACTICE"
        ? createPracticeSession(user)
        : createCompetitionSession(user);
    appendDemoAuditEvent({
      eventType: "GAME_SESSION_CREATED",
      actorId: user.id,
      subjectType: "GAME_SESSION",
      subjectId: session.id,
      reason:
        session.mode === "PRACTICE"
          ? "Player started a noncash practice session."
          : "Player entered the zero-cost, noncash ranked competition.",
      afterState: {
        mode: session.mode,
        dealCommitment: session.state.dealCommitment,
        valuablePrize: false,
      },
    });
    return NextResponse.json(
      { session: publicGameSession(session) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof GameServiceError) {
      const status =
        error.code === "DUPLICATE_COMPETITION_ENTRY" ? 409 : 403;
      return jsonError(status, error.code, error.message, id);
    }
    return jsonError(500, "GAME_SESSION_FAILED", "The session could not be created.", id);
  }
}
