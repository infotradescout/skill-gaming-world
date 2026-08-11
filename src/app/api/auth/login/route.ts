import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createRuntimeSession,
  publicUser,
  setSessionCookie,
} from "@/lib/auth";
import { appendRuntimeAuditEvent } from "@/lib/audit";
import { getDemoStore } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import {
  PersistentAuthenticationError,
  persistentUserByEmail,
} from "@/lib/persistent-auth";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(128),
});
const DUMMY_PASSWORD_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  const rateError = await enforceRateLimit(
    request,
    "login",
    12,
    60_000,
    parsed.success
      ? { anonymousCredential: parsed.data.email }
      : undefined,
  );
  if (rateError) return rateError;
  if (!parsed.success) {
    return jsonError(400, "INVALID_LOGIN", "Check the login fields.", id);
  }
  const env = getRuntimeEnv();
  const store = env.DEMO_MODE ? getDemoStore() : null;
  const userId = store?.userIdsByEmail.get(parsed.data.email);
  const user = env.DEMO_MODE
    ? userId
      ? store?.usersById.get(userId)
      : undefined
    : await persistentUserByEmail(parsed.data.email);
  // Unknown accounts still pay the same password-KDF cost. The response and
  // limiter partition remain identical, so this does not expose enumeration.
  const valid = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !valid) {
    await appendRuntimeAuditEvent({
      eventType: "ACCOUNT_LOGIN_FAILED",
      actorId: user?.id ?? "anonymous",
      subjectType: "AUTH_ATTEMPT",
      subjectId: id,
      reason: "Login failed without recording submitted credentials.",
      afterState: {
        environment: env.DEMO_MODE ? "safe-demo" : "configured",
      },
    }).catch(() => undefined);
    return jsonError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.", id);
  }
  if (user.status === "CLOSED" || user.status === "SUSPENDED") {
    await appendRuntimeAuditEvent({
      eventType: "ACCOUNT_LOGIN_BLOCKED",
      actorId: user.id,
      subjectType: "USER",
      subjectId: user.id,
      reason: "Login was denied by account status.",
      afterState: {
        status: user.status,
        environment: env.DEMO_MODE ? "safe-demo" : "configured",
      },
    }).catch(() => undefined);
    return jsonError(403, "ACCOUNT_BLOCKED", "This account cannot sign in.", id);
  }

  const loginAudit = {
    eventType: "ACCOUNT_LOGIN",
    actorId: user.id,
    subjectType: "USER",
    subjectId: user.id,
    reason: "Successful account login.",
    requestId: id,
    afterState: {
      environment: env.DEMO_MODE ? "safe-demo" : "configured",
    },
  };
  if (env.DEMO_MODE) await appendRuntimeAuditEvent(loginAudit);
  let session;
  try {
    session = await createRuntimeSession(
      user.id,
      env.DEMO_MODE ? undefined : loginAudit,
    );
  } catch (error) {
    if (error instanceof PersistentAuthenticationError) {
      await appendRuntimeAuditEvent({
        eventType: "ACCOUNT_LOGIN_BLOCKED",
        actorId: user.id,
        subjectType: "USER",
        subjectId: user.id,
        reason: "Login was denied by account status.",
        afterState: { status: "RESTRICTED", environment: "configured" },
      }).catch(() => undefined);
      return jsonError(403, error.code, error.message, id);
    }
    throw error;
  }
  const response = NextResponse.json({
    user: publicUser(user),
    environment: env.DEMO_MODE ? "safe-demo" : "configured",
  });
  setSessionCookie(response, session);
  return response;
}
