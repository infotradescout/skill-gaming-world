import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendRuntimeAuditEvent } from "@/lib/audit";
import { currentRuntimeUser } from "@/lib/auth";
import { getDemoStore } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { createId } from "@/lib/ids";
import {
  createPersistentAppeal,
  listPersistentAppeals,
} from "@/lib/persistent-support";

const appealSchema = z.object({
  gameSessionId: z.string().trim().min(8).max(128).optional(),
  subject: z
    .string()
    .trim()
    .min(5)
    .max(160)
    .refine((value) => !value.includes("\u0000")),
  statement: z
    .string()
    .trim()
    .min(20)
    .max(5_000)
    .refine((value) => !value.includes("\u0000")),
});

export async function GET(request: NextRequest) {
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId(request));
  }
  return NextResponse.json({
    appeals: getRuntimeEnv().DEMO_MODE
      ? getDemoStore().appeals.filter((appeal) => appeal.userId === user.id)
      : await listPersistentAppeals(user.id),
  });
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "appeal", 6, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }

  const parsed = appealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_APPEAL", "Check the appeal details.", id);
  }

  const store = getRuntimeEnv().DEMO_MODE ? getDemoStore() : null;
  if (
    parsed.data.gameSessionId &&
    !store &&
    !z.string().uuid().safeParse(parsed.data.gameSessionId).success
  ) {
    return jsonError(
      400,
      "INVALID_APPEAL",
      "Check the appeal details.",
      id,
    );
  }
  if (parsed.data.gameSessionId && store) {
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

  let appeal;
  try {
    if (store) {
      const demoAppeal = {
        id: createId("appeal"),
        userId: user.id,
        gameSessionId: parsed.data.gameSessionId,
        subject: parsed.data.subject,
        statement: parsed.data.statement,
        status: "OPEN" as const,
        createdAt: new Date().toISOString(),
      };
      store.appeals.push(demoAppeal);
      appeal = demoAppeal;
    } else {
      appeal = await createPersistentAppeal({
        userId: user.id,
        ...parsed.data,
        requestId: id,
      });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "GAME_SESSION_NOT_FOUND") {
      return jsonError(404, code, "The referenced game session was not found.", id);
    }
    if (code === "GAME_SESSION_FORBIDDEN") {
      return jsonError(403, code, "The referenced game session belongs to another account.", id);
    }
    throw error;
  }
  if (store) {
    await appendRuntimeAuditEvent({
      eventType: "PLAYER_APPEAL_SUBMITTED",
      actorId: user.id,
      subjectType: "APPEAL",
      subjectId: appeal.id,
      reason: "Player submitted a reviewable appeal.",
      afterState: {
        status: appeal.status,
        gameSessionId: appeal.gameSessionId,
        environment: "safe-demo",
      },
    });
  }

  return NextResponse.json({ appeal }, { status: 201 });
}
