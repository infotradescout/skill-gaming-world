import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { getRuntimeEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getRuntimeEnv();
  let database: "not-required" | "ready" | "unavailable" = "not-required";
  if (!env.DEMO_MODE) {
    try {
      await getDatabase().execute(sql`select 1`);
      database = "ready";
    } catch {
      database = "unavailable";
    }
  }
  const ready = database !== "unavailable";
  const configuredJurisdiction =
    env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION;
  const jurisdictionReady =
    env.DEMO_MODE ||
    (Boolean(configuredJurisdiction) &&
      env.MONETAIRE_PLAY_JURISDICTIONS.includes(configuredJurisdiction));
  const monetairePlayReady = ready && jurisdictionReady;
  return NextResponse.json({
    status: ready && jurisdictionReady ? "ok" : "not-ready",
    service: "skill-gaming-world",
    mode: env.DEMO_MODE ? "safe-demo" : "configured",
    dependencies: {
      database,
      jurisdiction: jurisdictionReady ? "ready" : "unavailable",
    },
    operations: {
      monetairePlay: monetairePlayReady,
      monetairePrize: false,
      socialCasino: false,
      realMoneyCasino: false,
      productionPayments: false,
    },
  }, { status: ready && jurisdictionReady ? 200 : 503 });
}
