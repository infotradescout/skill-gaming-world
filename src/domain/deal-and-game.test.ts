import { describe, expect, it } from "vitest";

import {
  canPlaceOnFoundation,
  canPlaceOnTableau,
  createCanonicalDeck,
} from "./cards";
import {
  createSeededKlondikeDeal,
  dealKlondikeLayout,
  verifyDealReveal,
} from "./deal";
import {
  applyAuthoritativeMove,
  assertKlondikeCardConservation,
  createKlondikeGameState,
  hashKlondikeGameState,
  verifyMoveEventChain,
} from "./game-engine";

describe("deterministic Klondike Draw-1 deal", () => {
  it("reproduces the same ordered deck and SHA-256 commitment", () => {
    const first = createSeededKlondikeDeal(
      "9a9ae87e94d1644b967114f36fc60ce0",
    );
    const second = createSeededKlondikeDeal(
      "9a9ae87e94d1644b967114f36fc60ce0",
    );
    const different = createSeededKlondikeDeal(
      "ce143213ec5cab9b19141187103d25d0",
    );

    expect(first.orderedDeck.map((card) => card.id)).toEqual(
      second.orderedDeck.map((card) => card.id),
    );
    expect(first.commitment).toBe(second.commitment);
    expect(first.commitment).toMatch(/^[a-f0-9]{64}$/);
    expect(different.commitment).not.toBe(first.commitment);
    expect(
      verifyDealReveal({
        seed: "9a9ae87e94d1644b967114f36fc60ce0",
        commitment: first.commitment,
      }),
    ).toBe(true);
    expect(
      verifyDealReveal({
        seed: "wrong-seed",
        commitment: first.commitment,
      }),
    ).toBe(false);
  });

  it("deals seven standard tableau columns and a 24-card stock", () => {
    const layout = dealKlondikeLayout(
      createSeededKlondikeDeal("layout-test-seed"),
    );

    expect(layout.tableau.map((pile) => pile.length)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(layout.stock).toHaveLength(24);
    for (const pile of layout.tableau) {
      expect(pile.slice(0, -1).every((card) => !card.faceUp)).toBe(true);
      expect(pile[pile.length - 1].faceUp).toBe(true);
    }
    expect(
      new Set([
        ...layout.tableau.flat().map(({ card }) => card.id),
        ...layout.stock.map((card) => card.id),
      ]).size,
    ).toBe(52);
  });

  it("enforces canonical foundation and tableau stacking rules", () => {
    const cards = createCanonicalDeck();
    const aceClubs = cards.find((card) => card.id === "AC")!;
    const twoClubs = cards.find((card) => card.id === "2C")!;
    const twoHearts = cards.find((card) => card.id === "2H")!;
    const threeClubs = cards.find((card) => card.id === "3C")!;
    const kingSpades = cards.find((card) => card.id === "KS")!;

    expect(canPlaceOnFoundation(aceClubs, undefined)).toBe(true);
    expect(canPlaceOnFoundation(twoClubs, aceClubs)).toBe(true);
    expect(canPlaceOnFoundation(twoHearts, aceClubs)).toBe(false);
    expect(canPlaceOnTableau(twoHearts, threeClubs)).toBe(true);
    expect(canPlaceOnTableau(twoClubs, threeClubs)).toBe(false);
    expect(canPlaceOnTableau(kingSpades, undefined)).toBe(true);
  });
});

describe("server-authoritative move processing", () => {
  it("accepts a legal draw and appends a hash-chained event", () => {
    const game = createKlondikeGameState({
      gameId: "game-1",
      deal: createSeededKlondikeDeal("game-seed"),
    });

    const result = applyAuthoritativeMove(
      game,
      {
        gameId: "game-1",
        actionId: "action-1",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(game),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 10_000 },
    );

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected legal draw");
    }
    expect(result.state.stock).toHaveLength(23);
    expect(result.state.waste).toHaveLength(1);
    expect(result.state.validMoveCount).toBe(1);
    expect(result.state.lastSequence).toBe(1);
    expect(result.event.serverReceivedAtMs).toBe(10_000);
    expect(result.event.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.event.stateHashBefore).toBe(hashKlondikeGameState(game));
    expect(result.event.stateHashAfter).toBe(
      hashKlondikeGameState(result.state),
    );
    expect(result.idempotentReplay).toBe(false);
    expect(verifyMoveEventChain(result.state.events)).toBe(true);
    expect(assertKlondikeCardConservation(result.state)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
  });

  it("returns exact retries and rejects changed, stale, replayed, and out-of-order commands", () => {
    const game = createKlondikeGameState({
      gameId: "game-2",
      deal: createSeededKlondikeDeal("game-seed-2"),
    });

    const illegal = applyAuthoritativeMove(
      game,
      {
        gameId: "game-2",
        actionId: "illegal-empty-waste",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(game),
        intent: { type: "WASTE_TO_FOUNDATION" },
      },
      { serverReceivedAtMs: 100 },
    );
    expect(illegal.accepted).toBe(false);
    if (illegal.accepted) {
      throw new Error("expected illegal move rejection");
    }
    expect(illegal.code).toBe("ILLEGAL_MOVE");
    expect(illegal.state).toBe(game);
    expect(game.lastSequence).toBe(0);

    const accepted = applyAuthoritativeMove(
      game,
      {
        gameId: "game-2",
        actionId: "draw-1",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(game),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 101 },
    );
    if (!accepted.accepted) {
      throw new Error("expected legal draw");
    }

    const exactRetry = applyAuthoritativeMove(
      accepted.state,
      {
        gameId: "game-2",
        actionId: "draw-1",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(game),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 102 },
    );
    expect(exactRetry.accepted).toBe(true);
    if (!exactRetry.accepted) {
      throw new Error("expected exact retry");
    }
    expect(exactRetry.idempotentReplay).toBe(true);
    expect(exactRetry.event).toEqual(accepted.event);
    expect(exactRetry.outcome).toEqual(accepted.outcome);
    expect(exactRetry.state).toBe(accepted.state);

    const laterMove = applyAuthoritativeMove(
      accepted.state,
      {
        gameId: "game-2",
        actionId: "draw-2",
        sequence: 2,
        priorStateHash: hashKlondikeGameState(accepted.state),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 103 },
    );
    if (!laterMove.accepted) {
      throw new Error("expected later legal draw");
    }
    const lateRetry = applyAuthoritativeMove(
      laterMove.state,
      {
        gameId: "game-2",
        actionId: "draw-1",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(game),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 104 },
    );
    expect(lateRetry.accepted).toBe(true);
    if (!lateRetry.accepted) {
      throw new Error("expected late exact retry");
    }
    expect(lateRetry.idempotentReplay).toBe(true);
    expect(lateRetry.outcome).toEqual(accepted.outcome);
    expect(lateRetry.state).toBe(laterMove.state);
    expect(hashKlondikeGameState(lateRetry.state)).toBe(
      hashKlondikeGameState(laterMove.state),
    );
    expect(lateRetry.outcome.acceptedStateHash).not.toBe(
      hashKlondikeGameState(lateRetry.state),
    );

    const changedRetry = applyAuthoritativeMove(
      accepted.state,
      {
        gameId: "game-2",
        actionId: "draw-1",
        sequence: 2,
        priorStateHash: hashKlondikeGameState(accepted.state),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 102 },
    );
    expect(changedRetry.accepted).toBe(false);
    if (changedRetry.accepted) {
      throw new Error("expected idempotency conflict");
    }
    expect(changedRetry.code).toBe("IDEMPOTENCY_CONFLICT");

    const stale = applyAuthoritativeMove(
      accepted.state,
      {
        gameId: "game-2",
        actionId: "stale-prior-state",
        sequence: 2,
        priorStateHash: hashKlondikeGameState(game),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 102 },
    );
    expect(stale.accepted).toBe(false);
    if (stale.accepted) {
      throw new Error("expected stale-state rejection");
    }
    expect(stale.code).toBe("STATE_HASH_MISMATCH");

    const replay = applyAuthoritativeMove(
      accepted.state,
      {
        gameId: "game-2",
        actionId: "new-action-replayed-sequence",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(accepted.state),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 102 },
    );
    expect(replay.accepted).toBe(false);
    if (replay.accepted) {
      throw new Error("expected replay rejection");
    }
    expect(replay.code).toBe("REPLAYED_SEQUENCE");

    const outOfOrder = applyAuthoritativeMove(
      accepted.state,
      {
        gameId: "game-2",
        actionId: "new-action-skipped-sequence",
        sequence: 3,
        priorStateHash: hashKlondikeGameState(accepted.state),
        intent: { type: "DRAW_STOCK" },
      },
      { serverReceivedAtMs: 102 },
    );
    expect(outOfOrder.accepted).toBe(false);
    if (outOfOrder.accepted) {
      throw new Error("expected sequence rejection");
    }
    expect(outOfOrder.code).toBe("OUT_OF_ORDER_SEQUENCE");
  });

  it("returns the immutable original outcome for an exact terminal retry", () => {
    const game = createKlondikeGameState({
      gameId: "terminal-retry",
      deal: createSeededKlondikeDeal("terminal-retry"),
    });
    const command = {
      gameId: game.gameId,
      actionId: "terminal-abandon",
      sequence: 1,
      priorStateHash: hashKlondikeGameState(game),
      intent: { type: "ABANDON" as const },
    };
    const first = applyAuthoritativeMove(game, command, {
      serverReceivedAtMs: 500,
    });
    expect(first.accepted).toBe(true);
    if (!first.accepted) throw new Error("expected terminal move");
    expect(first.state.status).toBe("ABANDONED");

    const retry = applyAuthoritativeMove(first.state, command, {
      serverReceivedAtMs: 501,
    });
    expect(retry.accepted).toBe(true);
    if (!retry.accepted) throw new Error("expected terminal retry");
    expect(retry.idempotentReplay).toBe(true);
    expect(retry.outcome).toEqual(first.outcome);
    expect(retry.state).toBe(first.state);
  });

  it("ignores client-supplied clock-shaped data", () => {
    const game = createKlondikeGameState({
      gameId: "game-3",
      deal: createSeededKlondikeDeal("game-seed-3"),
    });
    const forgedCommand = {
      gameId: "game-3",
      actionId: "draw",
      sequence: 1,
      priorStateHash: hashKlondikeGameState(game),
      intent: { type: "DRAW_STOCK" as const },
      clientTimeMs: -999_999_999,
      clientScore: 1_000_000,
    };

    const result = applyAuthoritativeMove(game, forgedCommand, {
      serverReceivedAtMs: 50_000,
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected legal draw");
    }
    expect(result.event.serverReceivedAtMs).toBe(50_000);
    expect(result.state.validMoveCount).toBe(1);
    expect(result.event).not.toHaveProperty("clientTimeMs");
    expect(result.event).not.toHaveProperty("clientScore");
  });

  it("does not allow stacking onto an exposed face-down card", () => {
    const game = createKlondikeGameState({
      gameId: "game-face-down-destination",
      deal: createSeededKlondikeDeal("face-down-destination"),
    });
    const cards = createCanonicalDeck();
    const twoHearts = cards.find((card) => card.id === "2H")!;
    const threeClubs = cards.find((card) => card.id === "3C")!;
    const serverState = {
      ...game,
      stock: [],
      waste: [twoHearts],
      tableau: [
        [{ card: threeClubs, faceUp: false }],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };

    const result = applyAuthoritativeMove(
      serverState,
      {
        gameId: serverState.gameId,
        actionId: "cannot-cover-face-down",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(serverState),
        intent: { type: "WASTE_TO_TABLEAU", toColumn: 0 },
      },
      { serverReceivedAtMs: 1 },
    );
    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error("expected face-down destination rejection");
    }
    expect(result.code).toBe("ILLEGAL_MOVE");
  });

  it("conserves all 52 unique cards when waste moves to foundation", () => {
    const game = createKlondikeGameState({
      gameId: "waste-foundation-conservation",
      deal: createSeededKlondikeDeal("waste-foundation-conservation"),
    });
    const deck = createCanonicalDeck();
    const aceHearts = deck.find((card) => card.id === "AH")!;
    const serverState = {
      ...game,
      tableau: [[], [], [], [], [], [], []],
      stock: deck.filter((card) => card.id !== aceHearts.id),
      waste: [aceHearts],
      foundations: {
        CLUBS: [],
        DIAMONDS: [],
        HEARTS: [],
        SPADES: [],
      },
    };

    const result = applyAuthoritativeMove(
      serverState,
      {
        gameId: serverState.gameId,
        actionId: "waste-foundation-move",
        sequence: 1,
        priorStateHash: hashKlondikeGameState(serverState),
        intent: { type: "WASTE_TO_FOUNDATION" },
      },
      { serverReceivedAtMs: 1 },
    );
    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected waste-to-foundation move");
    }

    const cardIds = [
      ...result.state.tableau.flatMap((pile) =>
        pile.map((positioned) => positioned.card.id),
      ),
      ...result.state.stock.map((card) => card.id),
      ...result.state.waste.map((card) => card.id),
      ...Object.values(result.state.foundations).flat().map((card) => card.id),
    ];
    expect(cardIds).toHaveLength(52);
    expect(new Set(cardIds).size).toBe(52);
    expect(result.state.waste).toHaveLength(0);
    expect(result.state.foundations.HEARTS).toEqual([aceHearts]);
    expect(assertKlondikeCardConservation(result.state)).toBe(true);
  });
});
