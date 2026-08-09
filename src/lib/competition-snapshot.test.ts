import { describe, expect, it } from "vitest";

import {
  competitionView,
  type PersistentCompetitionSnapshot,
} from "./competition-snapshot";

describe("competition snapshot presentation", () => {
  it("maps the configured persistent API shape without demo-only fields", () => {
    const snapshot: PersistentCompetitionSnapshot = {
      competitionId: "competition-configured",
      publicName: "Configured noncash ranking",
      status: "ACTIVE",
      entryCostPlayCoins: 0,
      valuablePrize: false,
      dealCommitment: "commitment",
      rulesetVersion: "KLONDIKE_DRAW_THREE_V2",
      scoringVersion: "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1",
      dealGeneratorVersion: "CURATED_SOLVABLE_V1",
      validation: {
        validationId: "validation-configured",
        status: "VERIFIED_SOLVABLE",
        protocol: "MONETAIRE_CURATED_SOLVABLE_V1",
        validatorKey: "CURATED_SOLVABLE",
        validatorVersion: "V1",
        evidenceHash: "evidence-hash",
        validatedAtServerMs: Date.UTC(2026, 6, 26, 11, 59),
      },
      opensAtServerMs: Date.UTC(2026, 6, 26, 12),
      closesAtServerMs: Date.UTC(2026, 7, 2, 12),
      closedAtServerMs: null,
      seedReveal: null,
      revealedAtServerMs: null,
      canonicalDealHash: null,
      seedVerified: null,
      entryCount: 1,
      finalLeaderboardSnapshot: null,
      standings: [
        {
          rank: 1,
          tied: false,
          completed: true,
          validMoveCount: 81,
          verifiedActiveDurationMs: 12_345,
          displayName: "Player",
        },
      ],
    };

    expect(competitionView(snapshot)).toMatchObject({
      id: "competition-configured",
      name: "Configured noncash ranking",
      environment: "configured",
      entryCount: 1,
      rulesetVersion: "KLONDIKE_DRAW_THREE_V2",
      validation: {
        validationId: "validation-configured",
        protocol: "MONETAIRE_CURATED_SOLVABLE_V1",
        solver: "CURATED_SOLVABLE",
      },
      opensAt: "2026-07-26T12:00:00.000Z",
      standings: [
        {
          rank: 1,
          validMoves: 81,
          verifiedActivePlayMs: 12_345,
          displayName: "Player",
        },
      ],
    });
  });
});
