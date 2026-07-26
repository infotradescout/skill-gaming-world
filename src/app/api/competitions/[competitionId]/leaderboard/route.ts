import { NextRequest, NextResponse } from "next/server";

import {
  CURATED_COMPETITION_ID,
  publicCompetitionSnapshotIfAvailable,
} from "@/lib/competition-catalog";
import { jsonError, requestId } from "@/lib/http";
import { getRuntimeEnv } from "@/lib/env";
import {
  persistentCompetitionSnapshot,
  persistentLeaderboard,
} from "@/lib/persistent-competition";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ competitionId: string }> },
) {
  const { competitionId } = await context.params;
  const env = getRuntimeEnv();
  if (env.DEMO_MODE && competitionId !== CURATED_COMPETITION_ID) {
    return jsonError(
      404,
      "COMPETITION_NOT_FOUND",
      "Competition was not found.",
      requestId(request),
    );
  }
  const competition = env.DEMO_MODE
    ? publicCompetitionSnapshotIfAvailable()
    : await persistentCompetitionSnapshot();
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
    standings: env.DEMO_MODE
      ? competition.standings
      : await persistentLeaderboard(competitionId),
  });
}
