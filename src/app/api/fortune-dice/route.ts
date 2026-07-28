import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentRuntimeUser } from "@/lib/auth";
import { commitFortuneDiceRound, settleFortuneDiceRound } from "@/lib/fortune-dice";
import {
  enforceRateLimit,
  enforceSameOrigin,
  jsonError,
  requestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to play.", requestId(request));
  if (user.status !== "ACTIVE") {
    return jsonError(403, "PLAYER_RESTRICTED", "Play is unavailable for this account.", requestId(request));
  }
  const rateDenial = await enforceRateLimit(request, "fortune-dice:commit", 40, 60_000);
  if (rateDenial) return rateDenial;
  try {
    return NextResponse.json(await commitFortuneDiceRound(user.id));
  } catch {
    return jsonError(503, "ROUND_UNAVAILABLE", "A fair round could not be prepared.", requestId(request));
  }
}

const requestSchema = z.object({
  roundId: z.string().uuid(),
  choice: z.enum(["under", "seven", "over"]),
  wagerMinor: z.number().int().min(10).max(1_000_000),
  clientSeed: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
});

export async function POST(request: NextRequest) {
  const originDenial = enforceSameOrigin(request);
  if (originDenial) return originDenial;
  const rateDenial = await enforceRateLimit(
    request,
    "fortune-dice:settle",
    30,
    60_000,
  );
  if (rateDenial) return rateDenial;
  const user = await currentRuntimeUser(request);
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to play.", requestId(request));
  if (user.status !== "ACTIVE") {
    return jsonError(403, "PLAYER_RESTRICTED", "Play is unavailable for this account.", requestId(request));
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID_ROUND", "Round request is invalid.", requestId(request));
  try {
    return NextResponse.json(await settleFortuneDiceRound({ userId: user.id, ...parsed.data }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "ROUND_FAILED";
    const status = code === "INSUFFICIENT_PLAY_COINS" ? 409 : code === "ROUND_NOT_AVAILABLE" ? 409 : 400;
    return jsonError(status, code, code === "INSUFFICIENT_PLAY_COINS" ? "Not enough Play Coins." : "The round could not be settled.", requestId(request));
  }
}
