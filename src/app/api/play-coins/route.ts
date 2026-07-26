import { NextRequest, NextResponse } from "next/server";

import { currentRuntimeUser } from "@/lib/auth";
import { playCoinBalance, playCoinHistory } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import { jsonError, requestId } from "@/lib/http";
import { persistentPlayCoinProjection } from "@/lib/persistent-projections";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await currentRuntimeUser(request);
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId(request));
  }

  const env = getRuntimeEnv();
  const projection = env.DEMO_MODE
    ? {
        balanceMinor: playCoinBalance(user.id),
        entries: playCoinHistory(user.id).toSorted((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      }
    : await persistentPlayCoinProjection(user.id);

  return NextResponse.json({
    ledgerType: "PLAY_COIN",
    balanceMinor: projection.balanceMinor,
    cashValue: null,
    redeemable: false,
    withdrawable: false,
    transferable: false,
    balanceDerivedFromDoubleEntryLines: true,
    entries: projection.entries.toReversed(),
  });
}
