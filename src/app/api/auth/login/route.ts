import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createDemoSession,
  publicUser,
  setSessionCookie,
} from "@/lib/auth";
import { appendDemoAuditEvent } from "@/lib/audit";
import { getDemoStore } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { verifyPassword } from "@/lib/password";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = enforceRateLimit(request, "login", 12, 60_000);
  if (rateError) return rateError;

  if (!getRuntimeEnv().DEMO_MODE) {
    return jsonError(
      503,
      "LOGIN_ADAPTER_NOT_CONFIGURED",
      "Login is unavailable until the production identity adapter is configured.",
      id,
    );
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_LOGIN", "Check the login fields.", id);
  }

  const store = getDemoStore();
  const userId = store.userIdsByEmail.get(parsed.data.email);
  const user = userId ? store.usersById.get(userId) : undefined;
  const valid = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : false;

  if (!user || !valid) {
    appendDemoAuditEvent({
      eventType: "ACCOUNT_LOGIN_FAILED",
      actorId: user?.id ?? "anonymous",
      subjectType: "AUTH_ATTEMPT",
      subjectId: id,
      reason: "Safe-demo login failed without recording submitted credentials.",
    });
    return jsonError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.", id);
  }
  if (user.status === "CLOSED" || user.status === "SUSPENDED") {
    appendDemoAuditEvent({
      eventType: "ACCOUNT_LOGIN_BLOCKED",
      actorId: user.id,
      subjectType: "USER",
      subjectId: user.id,
      reason: "Safe-demo login was denied by account status.",
      afterState: { status: user.status },
    });
    return jsonError(403, "ACCOUNT_BLOCKED", "This account cannot sign in.", id);
  }

  appendDemoAuditEvent({
    eventType: "ACCOUNT_LOGIN",
    actorId: user.id,
    subjectType: "USER",
    subjectId: user.id,
    reason: "Successful safe demo login.",
  });

  const session = createDemoSession(user.id);
  const response = NextResponse.json({
    user: publicUser(user),
    environment: "safe-demo",
  });
  setSessionCookie(response, session);
  return response;
}
