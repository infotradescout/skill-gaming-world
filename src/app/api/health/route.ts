import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getRuntimeEnv();
  return NextResponse.json({
    status: "ok",
    service: "skill-gaming-world",
    mode: env.DEMO_MODE ? "safe-demo" : "configured",
    operations: {
      monetairePlay: env.DEMO_MODE,
      monetairePrize: false,
      socialCasino: false,
      realMoneyCasino: false,
      productionPayments: false,
    },
  });
}
