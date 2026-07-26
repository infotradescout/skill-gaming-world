import { NextRequest, NextResponse } from "next/server";

import { currentDemoUser, publicUser } from "@/lib/auth";
import { jsonError, requestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId(request));
  }
  return NextResponse.json({ user: publicUser(user) });
}
