import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendDemoAuditEvent } from "@/lib/audit";
import { currentDemoUser, publicUser } from "@/lib/auth";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";

const cooldownSchema = z.object({
  hours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
  confirm: z.literal(true),
});

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = enforceRateLimit(request, "cooldown", 4, 60_000);
  if (rateError) return rateError;
  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }

  const parsed = cooldownSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_COOLDOWN", "Choose a supported cooldown.", id);
  }
  if (user.status === "CLOSED" || user.status === "SUSPENDED") {
    return jsonError(
      403,
      "ACCOUNT_RESTRICTED",
      "This account status cannot be replaced by a cooldown.",
      id,
    );
  }

  const before = { status: user.status, cooldownUntil: user.cooldownUntil };
  const requestedEnd = Date.now() + parsed.data.hours * 60 * 60 * 1000;
  const existingEnd =
    user.cooldownUntil === undefined
      ? 0
      : new Date(user.cooldownUntil).getTime();
  if (!Number.isFinite(existingEnd)) {
    return jsonError(
      409,
      "RESTRICTION_STATE_INVALID",
      "The existing restriction state requires review.",
      id,
    );
  }
  // A cooldown may extend, but never replace, a stronger self-exclusion.
  if (user.status !== "SELF_EXCLUDED") {
    user.status = "COOLDOWN";
  }
  user.cooldownUntil = new Date(Math.max(requestedEnd, existingEnd)).toISOString();

  appendDemoAuditEvent({
    eventType: "ACCOUNT_COOLDOWN_ACTIVATED",
    actorId: user.id,
    subjectType: "USER",
    subjectId: user.id,
    reason: `Player selected a ${parsed.data.hours}-hour cooldown.`,
    beforeState: before,
    afterState: { status: user.status, cooldownUntil: user.cooldownUntil },
  });

  return NextResponse.json({ user: publicUser(user), cooldownCannotBeShortened: true });
}
