import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendRuntimeAuditEvent } from "@/lib/audit";
import { currentRuntimeUser, publicUser } from "@/lib/auth";
import { getDemoStore } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { createId } from "@/lib/ids";
import { persistSelfExclusion } from "@/lib/persistent-auth";

const exclusionSchema = z.object({
  scope: z.enum(["ALL_PRODUCTS", "SKILL_GAMING_WORLD", "CASINO"]),
  duration: z.enum(["30_DAYS", "90_DAYS", "1_YEAR", "PERMANENT"]),
  confirm: z.literal(true),
});

const durationDays = {
  "30_DAYS": 30,
  "90_DAYS": 90,
  "1_YEAR": 365,
  PERMANENT: null,
} as const;

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "self-exclusion", 4, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  }

  const parsed = exclusionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "INVALID_SELF_EXCLUSION", "Check the exclusion request.", id);
  }

  const days = durationDays[parsed.data.duration];
  const startsAt = new Date();
  const draftRecord = {
    userId: user.id,
    scope: parsed.data.scope,
    startsAt: startsAt.toISOString(),
    endsAt:
      days === null
        ? undefined
        : new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
    permanent: days === null,
    removalPolicy: "COMPLIANCE_REVIEW_ONLY" as const,
  };
  const record = getRuntimeEnv().DEMO_MODE
    ? { id: createId("exclude"), ...draftRecord }
    : await persistSelfExclusion({
        user,
        scope: parsed.data.scope,
        startsAt,
        endsAt: draftRecord.endsAt ? new Date(draftRecord.endsAt) : undefined,
        permanent: draftRecord.permanent,
      }).then((created) => ({
        id: created.id,
        ...draftRecord,
      }));
  if (getRuntimeEnv().DEMO_MODE) {
    const store = getDemoStore();
    store.selfExclusions = Object.freeze([
      ...store.selfExclusions,
      Object.freeze(record),
    ]);
  }
  const before = { status: user.status };
  if (
    parsed.data.scope === "ALL_PRODUCTS" ||
    parsed.data.scope === "SKILL_GAMING_WORLD"
  ) {
    // Recording self-exclusion must never erase a stronger administrative or
    // terminal account restriction.
    if (user.status !== "CLOSED" && user.status !== "SUSPENDED") {
      user.status = "SELF_EXCLUDED";
    }
  }

  await appendRuntimeAuditEvent({
    eventType: "SELF_EXCLUSION_ACTIVATED",
    actorId: user.id,
    subjectType: "SELF_EXCLUSION",
    subjectId: record.id,
    reason: `Player selected ${parsed.data.duration} for ${parsed.data.scope}.`,
    beforeState: before,
    afterState: {
      status: user.status,
      scope: record.scope,
      endsAt: record.endsAt,
      permanent: record.permanent,
    },
  });

  return NextResponse.json(
    {
      user: publicUser(user),
      exclusion: record,
      ordinarySupportCannotRemove: true,
    },
    { status: 201 },
  );
}
