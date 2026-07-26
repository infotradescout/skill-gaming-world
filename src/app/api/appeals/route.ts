import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendDemoAuditEvent } from "@/lib/audit";
import { currentDemoUser } from "@/lib/auth";
import { getDemoStore } from "@/lib/demo-store";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { createId } from "@/lib/ids";

const appealSchema = z.object({
  gameSessionId: z.string().trim().min(8).max(128).optional(),
  subject: z.string().trim().min(5).max(160),
  statement: z.string().trim().min(20).max(5_000),
});

export async function GET(request: NextRequest) {
  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId(request));
  }
  return NextResponse.json({
    appeals: getDemoStore().appeals.filter((appeal) => appeal.userId === user.id),
  });
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = enforceRateLimit(request, "appeal", 6, 60_000);
  if (rateError) return rateError;
  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }

  const parsed = appealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_APPEAL", "Check the appeal details.", id);
  }

  const store = getDemoStore();
  if (parsed.data.gameSessionId) {
    const session = store.gameSessionsById.get(
      parsed.data.gameSessionId,
    );
    if (!session) {
      return jsonError(
        404,
        "GAME_SESSION_NOT_FOUND",
        "The referenced game session was not found.",
        id,
      );
    }
    if (session.userId !== user.id) {
      return jsonError(
        403,
        "GAME_SESSION_FORBIDDEN",
        "The referenced game session belongs to another account.",
        id,
      );
    }
  }

  const appeal = {
    id: createId("appeal"),
    userId: user.id,
    gameSessionId: parsed.data.gameSessionId,
    subject: parsed.data.subject,
    statement: parsed.data.statement,
    status: "OPEN" as const,
    createdAt: new Date().toISOString(),
  };
  store.appeals.push(appeal);
  appendDemoAuditEvent({
    eventType: "PLAYER_APPEAL_SUBMITTED",
    actorId: user.id,
    subjectType: "APPEAL",
    subjectId: appeal.id,
    reason: "Player submitted a reviewable appeal.",
    afterState: {
      status: appeal.status,
      gameSessionId: appeal.gameSessionId,
    },
  });

  return NextResponse.json({ appeal }, { status: 201 });
}
