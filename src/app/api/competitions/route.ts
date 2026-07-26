import { NextResponse } from "next/server";

import { publicCompetitionSnapshotIfAvailable } from "@/lib/competition-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const competition = publicCompetitionSnapshotIfAvailable();
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
