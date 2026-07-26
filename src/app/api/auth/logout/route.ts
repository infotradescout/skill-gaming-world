import { NextRequest, NextResponse } from "next/server";

import { appendDemoAuditEvent } from "@/lib/audit";
import {
  clearSessionCookie,
  currentDemoUser,
  revokeDemoSession,
} from "@/lib/auth";
import { enforceRateLimit, enforceSameOrigin } from "@/lib/http";

export async function POST(request: NextRequest) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = enforceRateLimit(request, "logout", 20, 60_000);
  if (rateError) return rateError;

  const user = currentDemoUser(request);
  revokeDemoSession(request);
  if (user) {
    appendDemoAuditEvent({
      eventType: "ACCOUNT_LOGOUT",
      actorId: user.id,
      subjectType: "USER",
      subjectId: user.id,
      reason: "Safe-demo session was explicitly revoked.",
    });
  }
  const response = NextResponse.json({ signedOut: true });
  clearSessionCookie(response);
  return response;
}
