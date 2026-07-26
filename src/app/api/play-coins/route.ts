import { NextRequest, NextResponse } from "next/server";

import { currentDemoUser } from "@/lib/auth";
import { playCoinBalance, playCoinHistory } from "@/lib/demo-store";
import { jsonError, requestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = currentDemoUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId(request));
  }

  const entries = playCoinHistory(user.id)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({
    ledgerType: "PLAY_COIN",
    balanceMinor: playCoinBalance(user.id),
    cashValue: null,
    redeemable: false,
    withdrawable: false,
    transferable: false,
    balanceDerivedFromDoubleEntryLines: true,
    entries,
  });
}
