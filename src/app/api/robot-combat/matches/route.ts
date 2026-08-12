import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentRuntimeUser } from "@/lib/auth";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import {
  createRobotMatch,
  RobotCombatServiceError,
} from "@/lib/robot-combat-service";
import {
  buildSelectionSchema,
  robotCombatStatus,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "robot-combat-match-create", 30, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  const parsed = createMatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID_ROBOT_MATCH", "Choose an inspection-valid machine.", id);
  try {
    const match = await createRobotMatch({ user, ...parsed.data });
    return NextResponse.json({ match }, { status: 201 });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_MATCH_CREATE_FAILED", "The match could not be created.", id);
  }
}

const createMatchSchema = buildSelectionSchema.extend({
  arenaKey: z.string().trim().min(1).max(96).optional(),
});
