import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentRuntimeUser } from "@/lib/auth";
import {
  createRobotTestSession,
  RobotCombatServiceError,
} from "@/lib/robot-combat-service";
import {
  buildSelectionSchema,
  robotCombatStatus,
} from "../_shared";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  buildId: buildSelectionSchema.shape.buildId,
  revision: buildSelectionSchema.shape.revision,
});

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "robot-combat-test-create", 60, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID_ROBOT_TEST", "Choose an inspection-valid revision.", id);
  try {
    const test = await createRobotTestSession({ user, ...parsed.data });
    return NextResponse.json({ test }, { status: 201 });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_TEST_CREATE_FAILED", "The private test bay could not be opened.", id);
  }
}
