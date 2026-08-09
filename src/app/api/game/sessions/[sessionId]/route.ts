import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentRuntimeUser } from "@/lib/auth";
import {
  GameServiceError,
  publicGameSession,
  resumeOwnedGameSession,
} from "@/lib/game-service";
import { enforceRateLimit, jsonError, requestId } from "@/lib/http";
import { getRuntimeEnv } from "@/lib/env";
import { resumePersistentSession } from "@/lib/persistent-game";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const id = requestId(request);
  const rateError = await enforceRateLimit(
    request,
    "get-game-session",
    120,
    60_000,
  );
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }
  const { sessionId } = await context.params;
  const env = getRuntimeEnv();
  if (!env.DEMO_MODE && !z.string().uuid().safeParse(sessionId).success) {
    return jsonError(404, "SESSION_NOT_FOUND", "Game session was not found.", id);
  }

  try {
    return NextResponse.json({
      session: publicGameSession(
        env.DEMO_MODE
          ? resumeOwnedGameSession(user, sessionId)
          : await resumePersistentSession(user, sessionId),
      ),
    });
  } catch (error) {
    if (error instanceof GameServiceError) {
      const status = error.code === "SESSION_NOT_FOUND" ? 404 : 403;
      return jsonError(status, error.code, error.message, id);
    }
    return jsonError(500, "GAME_RESUME_FAILED", "The session could not be resumed.", id);
  }
}
