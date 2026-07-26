import { NextRequest, NextResponse } from "next/server";

import {
  CURATED_COMPETITION_ID,
  publicCompetitionSnapshotIfAvailable,
} from "@/lib/competition-catalog";
import { jsonError, requestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ competitionId: string }> },
) {
  const { competitionId } = await context.params;
  if (competitionId !== CURATED_COMPETITION_ID) {
    return jsonError(
      404,
      "COMPETITION_NOT_FOUND",
      "Competition was not found.",
      requestId(request),
    );
  }
  const competition = publicCompetitionSnapshotIfAvailable();
  if (!competition) {
    return jsonError(
      503,
      "RANKED_PUBLICATION_ADAPTER_UNAVAILABLE",
      "Ranked competition records are unavailable.",
      requestId(request),
    );
  }
  return NextResponse.json({
    competitionId,
    scoring:
      "Completion, then fewest valid moves, then lowest verified active-play duration. Exact ties remain tied.",
    standings: competition.standings,
  });
}
