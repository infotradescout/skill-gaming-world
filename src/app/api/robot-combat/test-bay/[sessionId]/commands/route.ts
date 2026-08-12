import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentRuntimeUser } from "@/lib/auth";
import {
  commandRobotTestSession,
  RobotCombatServiceError,
} from "@/lib/robot-combat-service";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";
import { robotCombatStatus } from "../../../_shared";

export const dynamic = "force-dynamic";

const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CONTROL"),
    slot: z.literal("A"),
    throttle: z.number().finite().min(-1).max(1),
    steering: z.number().finite().min(-1).max(1),
  }),
  z.object({ type: z.literal("FIRE"), slot: z.literal("A") }),
  z.object({ type: z.literal("TEST_CONTACT"), slot: z.literal("A") }),
  z.object({ type: z.literal("RESET_TEST"), slot: z.literal("A") }),
  z.object({ type: z.literal("TICK"), elapsedMs: z.number().int().min(0).max(250) }),
]);

const payloadSchema = z.object({
  actionId: z.string().regex(/^[A-Za-z0-9:_-]{12,128}$/),
  command: commandSchema,
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "robot-combat-test-command", 600, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  const { sessionId } = await context.params;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID_ROBOT_TEST_COMMAND", "Check the private test action.", id);
  try {
    const result = await commandRobotTestSession({
      user,
      sessionId,
      actionId: parsed.data.actionId,
      command: parsed.data.command,
    });
    if (!result.event.accepted) {
      return NextResponse.json(
        {
          accepted: false,
          rejection: { message: result.event.message },
          test: result.state,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      accepted: true,
      idempotentReplay: result.idempotentReplay ?? false,
      event: result.event,
      test: result.state,
    });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_TEST_COMMAND_FAILED", "The private test action could not be processed.", id);
  }
}
