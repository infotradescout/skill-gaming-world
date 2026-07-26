import { NextResponse } from "next/server";

import { runtimeCompetitionSnapshot } from "@/lib/runtime-competition";

export const dynamic = "force-dynamic";

export async function GET() {
  const competition = await runtimeCompetitionSnapshot();
  const rankedEntryAvailable = competition?.status === "ACTIVE";
  return NextResponse.json({
    competitions: competition ? [competition] : [],
    rankedEntryAvailable,
    rankedEntryHoldReason: rankedEntryAvailable
      ? null
      : competition
        ? "RANKED_COMPETITION_NOT_OPEN"
        : "RANKED_PUBLICATION_ADAPTER_UNAVAILABLE",
    cashPrizesAvailable: false,
    valuablePrizesAvailable: false,
  });
}
