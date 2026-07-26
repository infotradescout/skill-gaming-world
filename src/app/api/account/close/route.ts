import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendRuntimeAuditEvent } from "@/lib/audit";
import {
  clearSessionCookie,
  currentRuntimeUser,
  revokeRuntimeSession,
} from "@/lib/auth";
import { getDemoStore } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { closePersistentUser } from "@/lib/persistent-auth";

const closeSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal("CLOSE MY ACCOUNT"),
});

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "account-close", 3, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }

  const parsed = closeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_CLOSURE_REQUEST", "Check the closure confirmation.", id);
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonError(401, "INVALID_CREDENTIALS", "Password is incorrect.", id);
  }

  const before = { status: user.status };
  user.status = "CLOSED";
  if (getRuntimeEnv().DEMO_MODE) {
    const store = getDemoStore();
    for (const [tokenHash, session] of store.sessionsByTokenHash) {
      if (session.userId === user.id) {
        store.sessionsByTokenHash.delete(tokenHash);
      }
    }
  } else {
    await closePersistentUser(user.id);
  }

  await appendRuntimeAuditEvent({
    eventType: "ACCOUNT_CLOSED",
    actorId: user.id,
    subjectType: "USER",
    subjectId: user.id,
    reason: "Player completed the explicit account-closure confirmation.",
    beforeState: before,
    afterState: { status: user.status },
  });

  const response = NextResponse.json({ closed: true });
  await revokeRuntimeSession(request);
  clearSessionCookie(response);
  return response;
}
