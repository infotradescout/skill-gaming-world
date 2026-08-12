import { NextRequest, NextResponse } from "next/server";

import { currentRuntimeUser } from "@/lib/auth";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import {
  joinRobotMatch,
  RobotCombatServiceError,
} from "@/lib/robot-combat-service";
import {
  buildSelectionSchema,
  robotCombatStatus,
} from "../../../_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "robot-combat-match-join", 60, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  const { matchId } = await context.params;
  const parsed = buildSelectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID_ROBOT_MATCH_JOIN", "Choose an inspection-valid machine.", id);
  try {
    const match = await joinRobotMatch({ user, matchId, ...parsed.data });
    return NextResponse.json({ match });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_MATCH_JOIN_FAILED", "The opponent could not join the match.", id);
  }
}
