import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createDemoSession,
  createDemoUserId,
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
import { hashPassword } from "@/lib/password";

const registrationSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(12).max(128),
  acceptPlayCoinTerms: z.literal(true),
});
const PLAY_COIN_TERMS_VERSION = "PLAY_COIN_TERMS_V1_2026_07_26";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = enforceRateLimit(request, "register", 8, 60_000);
  if (rateError) return rateError;

  const env = getRuntimeEnv();
  if (!env.DEMO_MODE) {
    return jsonError(
      503,
      "REGISTRATION_ADAPTER_NOT_CONFIGURED",
      "Registration is unavailable until the production identity adapter is configured.",
      id,
    );
  }

  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_REGISTRATION", "Check the registration fields.", id);
  }

  // Hash before the final uniqueness check so two concurrent registrations
  // cannot both pass the check while yielding to the password worker.
  const passwordHash = await hashPassword(parsed.data.password);
  const store = getDemoStore();
  if (store.userIdsByEmail.has(parsed.data.email)) {
    return jsonError(409, "ACCOUNT_EXISTS", "An account already exists for this email.", id);
  }

  const userId = createDemoUserId();
  const acceptedAt = new Date().toISOString();
  const user = {
    id: userId,
    email: parsed.data.email,
    displayName: parsed.data.displayName,
    passwordHash,
    status: "ACTIVE" as const,
    createdAt: acceptedAt,
    acceptedPlayCoinTermsVersion: PLAY_COIN_TERMS_VERSION,
    acceptedPlayCoinTermsAt: acceptedAt,
    adminRoles: [],
  };
  store.usersById.set(userId, user);
  store.userIdsByEmail.set(user.email, userId);

  appendDemoAuditEvent({
    eventType: "ACCOUNT_REGISTERED",
    actorId: userId,
    subjectType: "USER",
    subjectId: userId,
    reason: "Player registered in safe demo mode and accepted Play Coin terms.",
    afterState: {
      status: user.status,
      playCoinTermsVersion: user.acceptedPlayCoinTermsVersion,
      playCoinTermsAcceptedAt: user.acceptedPlayCoinTermsAt,
    },
  });

  const session = createDemoSession(userId);
  const response = NextResponse.json(
    {
      user: publicUser(user),
      environment: "safe-demo",
    },
    { status: 201 },
  );
  setSessionCookie(response, session);
  return response;
}
