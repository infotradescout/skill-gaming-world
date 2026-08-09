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
      opensAtServerMs: Date.UTC(2026, 6, 26, 12),
      closesAtServerMs: Date.UTC(2026, 7, 2, 12),
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
      entryCount: null,
      rulesetVersion: "KLONDIKE_DRAW_THREE_V2",
      validation: null,
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
