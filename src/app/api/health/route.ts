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
  return NextResponse.json({
    status: ready ? "ok" : "not-ready",
    service: "skill-gaming-world",
    mode: env.DEMO_MODE ? "safe-demo" : "configured",
    dependencies: { database },
    operations: {
      monetairePlay: env.DEMO_MODE,
      monetairePrize: false,
      socialCasino: false,
      realMoneyCasino: false,
      productionPayments: false,
    },
  }, { status: ready ? 200 : 503 });
}
