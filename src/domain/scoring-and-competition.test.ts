import { describe, expect, it } from "vitest";

import {
  activateCompetition,
  closeCompetitionAndRevealSeed,
  createDealValidationRecord,
  createDraftCompetition,
  enterNoncashCompetition,
  publishCompetition,
  reproduceCompetitionDeal,
  reviseDraftCompetition,
} from "./competition";
import { createVerifiedCuratedDealValidation } from "./curated-deal-proof";
import {
  createCuratedSolvableKlondikeDeal,
  createSeededKlondikeDeal,
  KLONDIKE_DRAW_THREE_RULESET,
} from "./deal";
import { createKlondikeGameState } from "./game-engine";
import {
  areExactOfficialTies,
  createOfficialScore,
  createServerActivityClock,
  finalizeActivityClock,
  pauseActivityClock,
  rankOfficialScores,
  resumeActivityClock,
} from "./scoring";

describe("official scoring", () => {
  it("uses only server-controlled active time", () => {
    let clock = createServerActivityClock(1_000);
    clock = pauseActivityClock(clock, 1_500);
    clock = resumeActivityClock(clock, 9_000);
    clock = finalizeActivityClock(clock, 9_250);

    const game = {
      ...createKlondikeGameState({
        gameId: "score-game",
        deal: createSeededKlondikeDeal("score-seed"),
      }),
      status: "ABANDONED" as const,
      validMoveCount: 18,
    };
    const score = createOfficialScore({
      scoreId: "score-1",
      entryId: "entry-1",
      game,
      finalizedClock: clock,
    });

    expect(score.verifiedActivePlayMs).toBe(750);
    expect(score.validMoves).toBe(18);
    expect(score.completed).toBe(false);
  });

  it("ranks completion, then moves, then active time and retains ties", () => {
    const base = {
      gameId: "game",
      scoreVersion:
        "MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1" as const,
      gameStatus: "WON" as const,
      finalizedAtServerMs: 1_000,
    };
    const scores = [
      {
        ...base,
        scoreId: "s-slower",
        entryId: "entry-slower",
        completed: true,
        validMoves: 100,
        verifiedActivePlayMs: 60_000,
      },
      {
        ...base,
        scoreId: "s-tie-a",
        entryId: "entry-tie-a",
        completed: true,
        validMoves: 90,
        verifiedActivePlayMs: 50_000,
      },
      {
        ...base,
        scoreId: "s-tie-b",
        entryId: "entry-tie-b",
        completed: true,
        validMoves: 90,
        verifiedActivePlayMs: 50_000,
      },
      {
        ...base,
        scoreId: "s-incomplete",
        entryId: "entry-incomplete",
        completed: false,
        gameStatus: "ABANDONED" as const,
        validMoves: 1,
        verifiedActivePlayMs: 1,
      },
    ];

    const ranked = rankOfficialScores(scores);
    expect(ranked.map(({ rank, score }) => [rank, score.entryId])).toEqual([
      [1, "entry-tie-a"],
      [1, "entry-tie-b"],
      [3, "entry-slower"],
      [4, "entry-incomplete"],
    ]);
    expect(ranked[0].tied).toBe(true);
    expect(areExactOfficialTies(ranked[0].score, ranked[1].score)).toBe(
      true,
    );
  });
});

describe("immutable ranked competition contract", () => {
  it("gives every entrant the same precommitted verified deal", () => {
    const seed = "338b6114b70fb22bb568984ac30eac09";
    const deal = createCuratedSolvableKlondikeDeal(seed);
    const verified = createVerifiedCuratedDealValidation({
      validationId: "validation-1",
      dealId: "deal-1",
      validatedAtServerMs: 50,
      deal,
    });
    expect(verified.proof.finalStatus).toBe("WON");
    expect(verified.proof.acceptedMoveCount).toBe(81);
    expect(verified.validation.evidenceReference).toBe(
      `sha256:${verified.proof.transcriptHash}`,
    );
    const draft = createDraftCompetition({
      competitionId: "competition-1",
      name: "Noncash Ranked Test",
      dealId: "deal-1",
      dealCommitment: deal.commitment,
      dealGeneratorVersion: deal.generatorVersion,
      validation: verified.validation,
      opensAtServerMs: 200,
      closesAtServerMs: 300,
    });
    const published = publishCompetition(draft, 160);
    const active = activateCompetition(published, 200);
    const first = enterNoncashCompetition(active, {
      entryId: "entry-a",
      userId: "user-a",
      enteredAtServerMs: 210,
    });
    const second = enterNoncashCompetition(active, {
      entryId: "entry-b",
      userId: "user-b",
      enteredAtServerMs: 211,
    });

    expect(first.dealId).toBe(second.dealId);
    expect(first.dealCommitment).toBe(second.dealCommitment);
    expect(first.rulesetVersion).toBe(second.rulesetVersion);
    expect(first.entryCost).toBe(0);
    expect(first.valuablePrize).toBe(false);
    expect(() =>
      reviseDraftCompetition(active, {
        dealCommitment: createSeededKlondikeDeal("easier").commitment,
      }),
    ).toThrowError(/cannot be edited/i);
    expect(Object.isFrozen(active)).toBe(true);
    expect(() =>
      closeCompetitionAndRevealSeed(active, {
        seed,
        serverClosedAtMs: 299,
      }),
    ).toThrowError(/before the competition closes/i);

    const closed = closeCompetitionAndRevealSeed(active, {
      seed,
      serverClosedAtMs: 300,
    });
    expect(reproduceCompetitionDeal(closed).commitment).toBe(
      deal.commitment,
    );
  });

  it("refuses unverified deals and early seed reveals", () => {
    const deal = createSeededKlondikeDeal("not-yet-verified");
    const draft = createDraftCompetition({
      competitionId: "competition-2",
      name: "Unverified",
      dealId: "deal-2",
      dealCommitment: deal.commitment,
      validation: createDealValidationRecord({
        validationId: "validation-2",
        dealId: "deal-2",
        dealCommitment: deal.commitment,
        rulesetVersion: KLONDIKE_DRAW_THREE_RULESET,
        dealGeneratorVersion: deal.generatorVersion,
        status: "UNVALIDATED",
        solverName: "placeholder",
        solverVersion: "1",
        validatedAtServerMs: 50,
        evidenceReference: "pending://deal-2",
      }),
      opensAtServerMs: 200,
      closesAtServerMs: 300,
    });
    expect(() => publishCompetition(draft, 100)).toThrowError(
      /verified solvable/i,
    );

    const unsupportedClaim = createDraftCompetition({
      competitionId: "competition-claimed",
      name: "Unsupported solvability claim",
      dealId: "deal-claimed",
      dealCommitment: deal.commitment,
      dealGeneratorVersion: deal.generatorVersion,
      validation: createDealValidationRecord({
        validationId: "validation-claimed",
        dealId: "deal-claimed",
        dealCommitment: deal.commitment,
        rulesetVersion: KLONDIKE_DRAW_THREE_RULESET,
        dealGeneratorVersion: deal.generatorVersion,
        status: "VERIFIED_SOLVABLE",
        solverName: "unsupported-label",
        solverVersion: "1",
        validatedAtServerMs: 50,
        evidenceReference: `sha256:${"0".repeat(64)}`,
      }),
      opensAtServerMs: 200,
      closesAtServerMs: 300,
    });
    expect(() =>
      publishCompetition(unsupportedClaim, 100),
    ).toThrowError(/only curated deals with replay proof/i);
  });
});
