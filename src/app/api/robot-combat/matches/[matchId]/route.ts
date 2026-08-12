import { NextRequest, NextResponse } from "next/server";

import { currentRuntimeUser } from "@/lib/auth";
import { enforceRateLimit, jsonError, requestId } from "@/lib/http";
import {
  getRobotMatch,
  RobotCombatServiceError,
} from "@/lib/robot-combat-service";
import { robotCombatStatus } from "../../_shared";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  const id = requestId(request);
  const rateError = await enforceRateLimit(request, "robot-combat-match-get", 180, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  const { matchId } = await context.params;
  try {
    const match = await getRobotMatch({ user, matchId });
    return NextResponse.json({ match });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_MATCH_GET_FAILED", "The match could not be loaded.", id);
  }
}
