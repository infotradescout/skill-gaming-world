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
  commandRobotMatch,
  RobotCombatServiceError,
} from "@/lib/robot-combat-service";
import { robotCombatStatus } from "../../../_shared";

export const dynamic = "force-dynamic";

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("READY"), slot: z.enum(["A", "B"]) }),
  z.object({
    type: z.literal("CONTROL"),
    slot: z.enum(["A", "B"]),
    throttle: z.number().finite().min(-1).max(1),
    steering: z.number().finite().min(-1).max(1),
  }),
  z.object({ type: z.literal("FIRE"), slot: z.enum(["A", "B"]) }),
  z.object({ type: z.literal("TICK"), elapsedMs: z.number().int().min(0).max(250) }),
  z.object({
    type: z.literal("DISCONNECT"),
    slot: z.enum(["A", "B"]),
    reason: z.string().trim().min(1).max(96),
  }),
  z.object({
    type: z.literal("CANCEL"),
    slot: z.enum(["A", "B"]),
    reason: z.string().trim().min(1).max(96),
  }),
]);

const payloadSchema = z.object({
  actionId: z.string().regex(/^[A-Za-z0-9:_-]{12,128}$/),
  command: commandSchema,
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  const id = requestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimit(request, "robot-combat-match-command", 600, 60_000);
  if (rateError) return rateError;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", id);
  const { matchId } = await context.params;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID_ROBOT_COMMAND", "Check the match command.", id);
  try {
    const result = await commandRobotMatch({
      user,
      matchId,
      actionId: parsed.data.actionId,
      command: parsed.data.command,
    });
    if (!result.event.accepted) {
      return NextResponse.json(
        {
          accepted: false,
          rejection: { message: result.event.message },
          match: result.state,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      accepted: true,
      idempotentReplay: result.idempotentReplay ?? false,
      event: result.event,
      match: result.state,
    });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) {
      return jsonError(robotCombatStatus(error), error.code, error.message, id);
    }
    return jsonError(500, "ROBOT_COMBAT_COMMAND_FAILED", "The match command could not be processed.", id);
  }
}
