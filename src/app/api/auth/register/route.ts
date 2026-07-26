import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createRuntimeSession,
  createDemoUserId,
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
import { hashPassword } from "@/lib/password";
import {
  createPersistentUser,
  persistentUserByEmail,
} from "@/lib/persistent-auth";

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
  const rateError = await enforceRateLimit(request, "register", 8, 60_000);
  if (rateError) return rateError;

  const env = getRuntimeEnv();

  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_REGISTRATION", "Check the registration fields.", id);
  }

  // Hash before the final uniqueness check so two concurrent registrations
  // cannot both pass the check while yielding to the password worker.
  const passwordHash = await hashPassword(parsed.data.password);
  const store = env.DEMO_MODE ? getDemoStore() : null;
  const existing = env.DEMO_MODE
    ? store?.userIdsByEmail.has(parsed.data.email)
    : Boolean(await persistentUserByEmail(parsed.data.email));
  if (existing) {
    return jsonError(409, "ACCOUNT_EXISTS", "An account already exists for this email.", id);
  }

  const acceptedAt = new Date().toISOString();
  let user;
  try {
    user = env.DEMO_MODE
      ? {
        id: createDemoUserId(),
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        passwordHash,
        status: "ACTIVE" as const,
        createdAt: acceptedAt,
        acceptedPlayCoinTermsVersion: PLAY_COIN_TERMS_VERSION,
        acceptedPlayCoinTermsAt: acceptedAt,
        adminRoles: [],
        }
      : await createPersistentUser({
          email: parsed.data.email,
          displayName: parsed.data.displayName,
          passwordHash,
        });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return jsonError(
        409,
        "ACCOUNT_EXISTS",
        "An account already exists for this email.",
        id,
      );
    }
    throw error;
  }
  if (store) {
    store.usersById.set(user.id, user);
    store.userIdsByEmail.set(user.email, user.id);
  }

  await appendRuntimeAuditEvent({
    eventType: "ACCOUNT_REGISTERED",
    actorId: user.id,
    subjectType: "USER",
    subjectId: user.id,
    reason: "Player registered in safe demo mode and accepted Play Coin terms.",
    afterState: {
      status: user.status,
      playCoinTermsVersion: user.acceptedPlayCoinTermsVersion,
      playCoinTermsAcceptedAt: user.acceptedPlayCoinTermsAt,
    },
  });

  const session = await createRuntimeSession(user.id);
  const response = NextResponse.json(
    {
      user: publicUser(user),
      environment: env.DEMO_MODE ? "safe-demo" : "configured",
    },
    { status: 201 },
  );
  setSessionCookie(response, session);
  return response;
}
