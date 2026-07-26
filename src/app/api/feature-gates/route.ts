import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/lib/env";
import { initialOperationGateSnapshot } from "@/lib/operation-gates";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getRuntimeEnv();
  return NextResponse.json({
    evaluatedAt: new Date().toISOString(),
    failClosed: true,
    gates: initialOperationGateSnapshot(env),
    environmentRequests: {
      monetairePrize: env.FEATURE_MONETAIRE_PRIZE,
      socialCasino: env.FEATURE_SOCIAL_CASINO,
      realMoneyCasino: env.FEATURE_REAL_MONEY_CASINO,
      productionPayments: env.FEATURE_PRODUCTION_PAYMENTS,
    },
    environmentRequestsCannotActivateHeldOperations: true,
  });
}
