import { beforeEach, describe, expect, it } from "vitest";

import {
  KLONDIKE_DRAW_THREE_RULESET,
  OFFICIAL_SCORE_VERSION,
  type CompetitionEntry,
  type OfficialScore,
} from "@/domain";

import {
  CURRENT_RANK_COMPETITION_STATUSES,
  configuredAchievementEvidence,
  currentRankForEntry,
  sessionHistoryEvidence,
} from "./persistent-projections";
import {
  getDemoStore,
  resetDemoStoreForTests,
  type DemoUser,
} from "./demo-store";
import { createPracticeSession } from "./game-service";
import {
  demoCurrentRank,
  demoPlayerProjection,
} from "./runtime-player-projection";

function user(id: string): DemoUser {
  return {
    id,
    email: `${id}@example.test`,
    displayName: id,
    passwordHash: "unused",
    status: "ACTIVE",
    createdAt: new Date(0).toISOString(),
    acceptedPlayCoinTermsVersion: "V1",
    acceptedPlayCoinTermsAt: new Date(0).toISOString(),
    adminRoles: [],
  };
}

function entry(
  entryId: string,
  userId: string,
  enteredAtServerMs: number,
): CompetitionEntry {
  return {
    entryId,
    competitionId: "competition-1",
    userId,
    dealId: "deal-1",
    dealCommitment: "a".repeat(64),
    dealGeneratorVersion: "CURATED_SOLVABLE_V1",
    rulesetVersion: KLONDIKE_DRAW_THREE_RULESET,
    enteredAtServerMs,
    entryCost: 0,
    valuablePrize: false,
  };
}

function score(
  scoreId: string,
  entryId: string,
  validMoves: number,
): OfficialScore {
  return {
    scoreId,
    entryId,
    gameId: `game-${scoreId}`,
    scoreVersion: OFFICIAL_SCORE_VERSION,
    completed: true,
    validMoves,
    verifiedActivePlayMs: 1_000,
    gameStatus: "WON",
    finalizedAtServerMs: 2_000,
  };
}

beforeEach(() => {
  process.env.DEMO_MODE = "true";
  resetDemoStoreForTests();
});

describe("player projections", () => {
  it("isolates account history to the authenticated user id", () => {
    const ownSession = createPracticeSession(user("player-a"));
    createPracticeSession(user("player-b"));

    const projection = demoPlayerProjection("player-a");

    expect(projection.recentSessions.map((session) => session.id)).toEqual([
      ownSession.id,
    ]);
    expect(
      projection.playCoinEntries.every((item) => item.userId === "player-a"),
    ).toBe(true);
  });

  it("does not attach another account's score or move evidence to recent sessions", () => {
    const evidence = sessionHistoryEvidence(
      [{ id: "owned-session" }],
      [
        {
          sessionId: "owned-session",
          completed: true,
          validMoveCount: 81,
          verifiedActivePlayMs: 12_000,
        },
        {
          sessionId: "foreign-session",
          completed: true,
          validMoveCount: 1,
          verifiedActivePlayMs: 1,
        },
      ],
      [
        { sessionId: "owned-session", accepted: true },
        { sessionId: "owned-session", accepted: false },
        { sessionId: "foreign-session", accepted: true },
        { sessionId: "foreign-session", accepted: false },
      ],
    );

    expect(Object.keys(evidence)).toEqual(["owned-session"]);
    expect(evidence["owned-session"]).toEqual({
      scoreCompleted: true,
      scoreValidMoveCount: 81,
      scoreVerifiedActivePlayMs: 12_000,
      acceptedMoveCount: 1,
      rejectedMoveCount: 1,
    });
    expect(evidence["foreign-session"]).toBeUndefined();
  });

  it("projects a real numeric tied rank for the user's scored entry", () => {
    const store = getDemoStore();
    store.competitionEntries = [
      entry("entry-best", "player-best", 1),
      entry("entry-a", "player-a", 2),
      entry("entry-b", "player-b", 3),
    ];
    store.officialScores = [
      score("score-best", "entry-best", 70),
      score("score-a", "entry-a", 81),
      score("score-b", "entry-b", 81),
    ];

    expect(demoCurrentRank("player-a")).toEqual({
      competitionId: "competition-1",
      entryId: "entry-a",
      rank: 2,
      tied: true,
    });
    expect(
      currentRankForEntry("competition-1", "entry-a", [
        { entryId: "entry-best", rank: 1, tied: false },
        { entryId: "entry-a", rank: 2, tied: true },
      ]),
    ).toMatchObject({ rank: 2, tied: true });
  });

  it("defines current rank only for a live publication lifecycle", () => {
    expect(CURRENT_RANK_COMPETITION_STATUSES).toEqual(["PUBLISHED", "OPEN"]);
    expect(CURRENT_RANK_COMPETITION_STATUSES).not.toContain("CLOSED");
    expect(CURRENT_RANK_COMPETITION_STATUSES).not.toContain("SETTLED");
  });

  it("requires an all-accepted configured move record and stores evidence ids", () => {
    const evidence = configuredAchievementEvidence(
      [
        { sessionId: "practice-session", scoreId: "practice-score", mode: "PRACTICE" },
        {
          sessionId: "ranked-session",
          scoreId: "ranked-score",
          mode: "NONCASH_COMPETITION",
        },
      ],
      [
        { id: "practice-move-1", sessionId: "practice-session", accepted: true },
        { id: "practice-rejection-1", sessionId: "practice-session", accepted: false },
        { id: "ranked-move-1", sessionId: "ranked-session", accepted: true },
      ],
    );

    expect(evidence.FIRST_FOUNDATION).toMatchObject({
      gameSessionId: "practice-session",
      scoreId: "practice-score",
    });
    expect(evidence.MEASURED_FINISH).toMatchObject({
      gameSessionId: "ranked-session",
      scoreId: "ranked-score",
    });
    expect(evidence.CLEAN_SEQUENCE).toEqual({
      source: "AUTHORITATIVE_GAME_SCORE_V2",
      gameSessionId: "ranked-session",
      scoreId: "ranked-score",
      moveEventIds: ["ranked-move-1"],
      rejectedMoveEventIds: [],
    });

    expect(
      configuredAchievementEvidence(
        [{ sessionId: "only", scoreId: "score", mode: "PRACTICE" }],
        [{ id: "rejected", sessionId: "only", accepted: false }],
      ).CLEAN_SEQUENCE,
    ).toBeUndefined();

    expect(
      configuredAchievementEvidence(
        [
          {
            sessionId: "terminal",
            scoreId: "terminal-score",
            mode: "PRACTICE",
            terminalAtServerMs: 100,
          },
        ],
        [
          {
            id: "accepted-before-terminal",
            sessionId: "terminal",
            accepted: true,
            serverReceivedAtServerMs: 99,
          },
          {
            id: "rejected-after-terminal",
            sessionId: "terminal",
            accepted: false,
            serverReceivedAtServerMs: 101,
          },
        ],
      ).CLEAN_SEQUENCE,
    ).toMatchObject({
      moveEventIds: ["accepted-before-terminal"],
      rejectedMoveEventIds: [],
    });
  });
});
