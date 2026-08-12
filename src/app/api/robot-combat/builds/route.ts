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
  listRobotBuilds,
  RobotCombatServiceError,
  saveRobotBuild,
} from "@/lib/robot-combat-service";
import {
  buildKeySchema,
  robotBlueprintSchema,
  robotCombatStatus,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const rateError = await enforceRateLimit(request, "robot-combat-builds-list", 120, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  try {
    return NextResponse.json({ builds: await listRobotBuilds(user) });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_BUILDS_FAILED", "Builds could not be loaded.", id);
  }
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "robot-combat-build-save", 60, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  const payload = await request.json().catch(() => null);
  const parsed = zRobotBuildPayload.safeParse(payload);
  if (!parsed.success) return jsonError(400, "INVALID_ROBOT_BUILD", "Check the machine definition.", id);
  try {
    const build = await saveRobotBuild({
      user,
      buildKey: parsed.data.buildKey,
      blueprint: parsed.data.blueprint,
    });
    return NextResponse.json({ build }, { status: 201 });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_BUILD_SAVE_FAILED", "The machine could not be saved.", id);
  }
}

const zRobotBuildPayload = z.object({
  buildKey: buildKeySchema,
  blueprint: robotBlueprintSchema,
});
