import { NextRequest, NextResponse } from "next/server";

import {
  CURATED_COMPETITION_ID,
  publicCompetitionSnapshotIfAvailable,
} from "@/lib/competition-catalog";
import { getRuntimeEnv } from "@/lib/env";
import { jsonError, requestId } from "@/lib/http";
import { persistentCompetitionSnapshotById } from "@/lib/persistent-competition";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ competitionId: string }> },
) {
  const { competitionId } = await context.params;
  const env = getRuntimeEnv();
  const competition = env.DEMO_MODE
    ? competitionId === CURATED_COMPETITION_ID
      ? publicCompetitionSnapshotIfAvailable()
      : null
    : await persistentCompetitionSnapshotById(competitionId);

  if (!competition) {
    return jsonError(
      404,
      "COMPETITION_NOT_FOUND",
      "Competition was not found.",
      requestId(request),
    );
  }

  return NextResponse.json({ competition });
}
