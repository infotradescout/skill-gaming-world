import { NextRequest, NextResponse } from "next/server";

import { currentRuntimeUser } from "@/lib/auth";
import {
  getRobotTestSession,
  RobotCombatServiceError,
} from "@/lib/robot-combat-service";
import {
  enforceRateLimit,
  jsonError,
  requestId,
} from "@/lib/http";
import { robotCombatStatus } from "../../_shared";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const id = requestId(request);
  const rateError = await enforceRateLimit(request, "robot-combat-test-get", 180, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  const { sessionId } = await context.params;
  try {
    return NextResponse.json({ test: await getRobotTestSession({ user, sessionId }) });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_TEST_GET_FAILED", "The private test bay could not be loaded.", id);
  }
}
