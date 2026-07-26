import { NextRequest, NextResponse } from "next/server";

import { currentRuntimeUser } from "@/lib/auth";
import { jsonError, requestId } from "@/lib/http";
import { runtimeEligibilitySnapshot } from "@/lib/runtime-eligibility";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId(request));
  }

  return NextResponse.json(await runtimeEligibilitySnapshot(user));
}
