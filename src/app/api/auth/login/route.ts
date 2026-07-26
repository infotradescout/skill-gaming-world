import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createRuntimeSession,
  publicUser,
  setSessionCookie,
} from "@/lib/auth";
import { appendRuntimeAuditEvent } from "@/lib/audit";
import { getDemoStore } from "@/lib/demo-store";
import { getRuntimeEnv, isPreviewOwnerEmail } from "@/lib/env";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { persistentUserByEmail } from "@/lib/persistent-auth";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "login", 12, 60_000);
  if (rateError) return rateError;

  const env = getRuntimeEnv();

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_LOGIN", "Check the login fields.", id);
  }
  if (!isPreviewOwnerEmail(env, parsed.data.email)) {
    return jsonError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
      id,
    );
  }

  const store = env.DEMO_MODE ? getDemoStore() : null;
  const userId = store?.userIdsByEmail.get(parsed.data.email);
  const user = env.DEMO_MODE
    ? userId
      ? store?.usersById.get(userId)
      : undefined
    : await persistentUserByEmail(parsed.data.email);
  const valid = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : false;

  if (!user || !valid) {
    await appendRuntimeAuditEvent({
      eventType: "ACCOUNT_LOGIN_FAILED",
      actorId: user?.id ?? "anonymous",
      subjectType: "AUTH_ATTEMPT",
      subjectId: id,
      reason: "Safe-demo login failed without recording submitted credentials.",
    });
    return jsonError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.", id);
  }
  if (user.status === "CLOSED" || user.status === "SUSPENDED") {
    await appendRuntimeAuditEvent({
      eventType: "ACCOUNT_LOGIN_BLOCKED",
      actorId: user.id,
      subjectType: "USER",
      subjectId: user.id,
      reason: "Safe-demo login was denied by account status.",
      afterState: { status: user.status },
    });
    return jsonError(403, "ACCOUNT_BLOCKED", "This account cannot sign in.", id);
  }

  await appendRuntimeAuditEvent({
    eventType: "ACCOUNT_LOGIN",
    actorId: user.id,
    subjectType: "USER",
    subjectId: user.id,
    reason: "Successful safe demo login.",
  });

  const session = await createRuntimeSession(user.id);
  const response = NextResponse.json({
    user: publicUser(user),
    environment: env.DEMO_MODE ? "safe-demo" : "configured",
  });
  setSessionCookie(response, session);
  return response;
}
