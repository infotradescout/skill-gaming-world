import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendRuntimeAuditEvent } from "@/lib/audit";
import { currentRuntimeUser } from "@/lib/auth";
import {
  GameServiceError,
  publicGameSession,
  submitGameMove,
} from "@/lib/game-service";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { getRuntimeEnv } from "@/lib/env";
import { submitPersistentMove } from "@/lib/persistent-game";

const moveIntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DRAW_STOCK") }),
  z.object({ type: z.literal("RECYCLE_WASTE") }),
  z.object({
    type: z.literal("FLIP_TABLEAU"),
    column: z.number().int().min(0).max(6),
  }),
  z.object({
    type: z.literal("WASTE_TO_TABLEAU"),
    toColumn: z.number().int().min(0).max(6),
  }),
  z.object({ type: z.literal("WASTE_TO_FOUNDATION") }),
  z.object({
    type: z.literal("TABLEAU_TO_TABLEAU"),
    fromColumn: z.number().int().min(0).max(6),
    startIndex: z.number().int().min(0).max(51),
    toColumn: z.number().int().min(0).max(6),
  }),
  z.object({
    type: z.literal("TABLEAU_TO_FOUNDATION"),
    fromColumn: z.number().int().min(0).max(6),
  }),
  z.object({
    type: z.literal("FOUNDATION_TO_TABLEAU"),
    suit: z.enum(["CLUBS", "DIAMONDS", "HEARTS", "SPADES"]),
    toColumn: z.number().int().min(0).max(6),
  }),
  z.object({ type: z.literal("ABANDON") }),
]);

const moveSchema = z.object({
  actionId: z.string().trim().min(12).max(128),
  sequence: z.number().int().positive(),
  priorStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  intent: moveIntentSchema,
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "game-move", 240, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }
  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_MOVE_COMMAND", "Check the move command.", id);
  }
  const { sessionId } = await context.params;

  try {
    const { session, result } = getRuntimeEnv().DEMO_MODE
      ? submitGameMove({
          user,
          sessionId,
          ...parsed.data,
        })
      : await submitPersistentMove({
          user,
          sessionId,
          ...parsed.data,
        });
    if (!result.accepted) {
      return NextResponse.json(
        {
          accepted: false,
          rejection: {
            code: result.code,
            message: result.message,
          },
          currentSession: publicGameSession(session),
        },
        { status: 409 },
      );
    }

    if (
      !result.idempotentReplay &&
      session.state.status !== "ACTIVE"
    ) {
      await appendRuntimeAuditEvent({
        eventType:
          session.state.status === "WON"
            ? "GAME_SESSION_COMPLETED"
            : "GAME_SESSION_ABANDONED",
        actorId: user.id,
        subjectType: "GAME_SESSION",
        subjectId: session.id,
        reason: `Server accepted terminal ${session.state.status} state.`,
        afterState: {
          status: session.state.status,
          validMoveCount: session.state.validMoveCount,
          verifiedActivePlayMs: session.activityClock.accumulatedActiveMs,
        },
      });
    }

    return NextResponse.json({
      accepted: true,
      idempotentReplay: result.idempotentReplay,
      outcome: result.outcome,
      currentSession: publicGameSession(session),
    });
  } catch (error) {
    if (error instanceof GameServiceError) {
      const status = error.code === "SESSION_NOT_FOUND" ? 404 : 403;
      return jsonError(status, error.code, error.message, id);
    }
    return jsonError(500, "MOVE_FAILED", "The move could not be processed.", id);
  }
}
