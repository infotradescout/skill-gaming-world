import { NextRequest, NextResponse } from "next/server";

import { appendRuntimeAuditEvent } from "@/lib/audit";
import {
  clearSessionCookie,
  currentRuntimeUser,
  revokeRuntimeSession,
} from "@/lib/auth";
import { enforceRateLimit, enforceSameOrigin } from "@/lib/http";

export async function POST(request: NextRequest) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "logout", 20, 60_000);
  if (rateError) return rateError;

  const user = await currentRuntimeUser(request);
  await revokeRuntimeSession(request);
  if (user) {
    await appendRuntimeAuditEvent({
      eventType: "ACCOUNT_LOGOUT",
      actorId: user.id,
      subjectType: "USER",
      subjectId: user.id,
      reason: "The authenticated session was explicitly revoked.",
    });
  }
  const response = NextResponse.json({ signedOut: true });
  clearSessionCookie(response);
  return response;
}
