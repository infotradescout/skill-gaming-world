import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendRuntimeAuditEvent } from "@/lib/audit";
import { currentRuntimeUser, publicUser } from "@/lib/auth";
import { getRuntimeEnv } from "@/lib/env";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import {
  persistCooldown,
  PersistentRestrictionError,
} from "@/lib/persistent-auth";

const cooldownSchema = z.object({
  hours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
  confirm: z.literal(true),
});

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "cooldown", 4, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
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
  if (getRuntimeEnv().DEMO_MODE) {
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
    const cooldownEnd = new Date(Math.max(requestedEnd, existingEnd));
    user.cooldownUntil = cooldownEnd.toISOString();
  } else {
    try {
      await persistCooldown(user, parsed.data.hours, id);
    } catch (error) {
      if (error instanceof PersistentRestrictionError) {
        return jsonError(403, error.code, error.message, id);
      }
      throw error;
    }
  }

  if (getRuntimeEnv().DEMO_MODE) {
    await appendRuntimeAuditEvent({
      eventType: "ACCOUNT_COOLDOWN_ACTIVATED",
      actorId: user.id,
      subjectType: "USER",
      subjectId: user.id,
      reason: `Player selected a ${parsed.data.hours}-hour cooldown.`,
      beforeState: before,
      afterState: {
        status: user.status,
        cooldownUntil: user.cooldownUntil,
        environment: "safe-demo",
      },
    });
  }

  return NextResponse.json({ user: publicUser(user), cooldownCannotBeShortened: true });
}
