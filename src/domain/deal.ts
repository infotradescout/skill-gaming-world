import { createHash } from "node:crypto";

import {
  Card,
  createCanonicalDeck,
  createCard,
  Rank,
  Suit,
  SUITS,
} from "./cards";
import {
  canonicalJson,
  deepFreeze,
  DomainError,
  requireNonEmpty,
  sha256Hex,
} from "./shared";

export const KLONDIKE_DRAW_ONE_RULESET = "KLONDIKE_DRAW_ONE_V1" as const;
export type KlondikeRulesetVersion = typeof KLONDIKE_DRAW_ONE_RULESET;

export const DEAL_GENERATORS = [
  "SHA256_FISHER_YATES_V1",
  "CURATED_SOLVABLE_V1",
] as const;
export type DealGeneratorVersion = (typeof DEAL_GENERATORS)[number];

export interface KlondikeDeal {
  readonly rulesetVersion: KlondikeRulesetVersion;
  readonly generatorVersion: DealGeneratorVersion;
  readonly orderedDeck: readonly Readonly<Card>[];
  readonly commitment: string;
}

export interface PositionedCard {
  readonly card: Readonly<Card>;
  readonly faceUp: boolean;
}

export interface DealtKlondikeLayout {
  readonly tableau: readonly (readonly Readonly<PositionedCard>[])[];
  /**
   * The top of stock is the final array element. This keeps all game operations
   * append/pop based without changing the committed deck ordering.
   */
  readonly stock: readonly Readonly<Card>[];
}

function uint32Stream(seed: string): () => number {
  let counter = 0;
  let buffer = Buffer.alloc(0);
  let offset = 0;

  return () => {
    if (offset + 4 > buffer.length) {
      buffer = createHash("sha256")
        .update("MONETAIRE_DEAL_V1\0", "utf8")
        .update(seed, "utf8")
        .update("\0", "utf8")
        .update(String(counter), "utf8")
        .digest();
      counter += 1;
      offset = 0;
    }

    const value = buffer.readUInt32BE(offset);
    offset += 4;
    return value;
  };
}

/**
 * Samples uniformly from [0, maximumInclusive] without modulo bias.
 */
function boundedRandom(nextUint32: () => number, maximumInclusive: number): number {
  const range = maximumInclusive + 1;
  const uint32Size = 0x1_0000_0000;
  const rejectionLimit = uint32Size - (uint32Size % range);

  let value = nextUint32();
  while (value >= rejectionLimit) {
    value = nextUint32();
  }
  return value % range;
}

export function serializeDealForCommitment(input: {
  readonly seed: string;
  readonly rulesetVersion: KlondikeRulesetVersion;
  readonly generatorVersion: DealGeneratorVersion;
  readonly orderedCardIds: readonly string[];
}): string {
  return canonicalJson({
    protocol: "MONETAIRE_DEAL_COMMITMENT_V1",
    rulesetVersion: input.rulesetVersion,
    generatorVersion: input.generatorVersion,
    seed: input.seed,
    orderedCardIds: input.orderedCardIds,
  });
}

export function createDealCommitment(input: {
  readonly seed: string;
  readonly rulesetVersion?: KlondikeRulesetVersion;
  readonly generatorVersion?: DealGeneratorVersion;
  readonly orderedCardIds: readonly string[];
}): string {
  const seed = requireNonEmpty(input.seed, "seed");
  if (input.orderedCardIds.length !== 52) {
    throw new DomainError(
      "INVALID_DEAL",
      "A Klondike commitment requires exactly 52 cards",
    );
  }
  if (new Set(input.orderedCardIds).size !== 52) {
    throw new DomainError(
      "INVALID_DEAL",
      "A Klondike commitment requires 52 unique cards",
    );
  }

  return sha256Hex(
    serializeDealForCommitment({
      seed,
      rulesetVersion:
        input.rulesetVersion ?? KLONDIKE_DRAW_ONE_RULESET,
      generatorVersion:
        input.generatorVersion ?? "SHA256_FISHER_YATES_V1",
      orderedCardIds: input.orderedCardIds,
    }),
  );
}

export function createSeededKlondikeDeal(
  seedInput: string,
): Readonly<KlondikeDeal> {
  const seed = requireNonEmpty(seedInput, "seed");
  const cards = [...createCanonicalDeck()];
  const nextUint32 = uint32Stream(seed);

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = boundedRandom(nextUint32, index);
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  const commitment = createDealCommitment({
    seed,
    rulesetVersion: KLONDIKE_DRAW_ONE_RULESET,
    generatorVersion: "SHA256_FISHER_YATES_V1",
    orderedCardIds: cards.map((card) => card.id),
  });

  return deepFreeze({
    rulesetVersion: KLONDIKE_DRAW_ONE_RULESET,
    generatorVersion: "SHA256_FISHER_YATES_V1",
    orderedDeck: cards,
    commitment,
  });
}

export function verifyDealReveal(input: {
  readonly seed: string;
  readonly commitment: string;
  readonly rulesetVersion?: KlondikeRulesetVersion;
  readonly generatorVersion?: DealGeneratorVersion;
}): boolean {
  if (
    (input.rulesetVersion ?? KLONDIKE_DRAW_ONE_RULESET) !==
    KLONDIKE_DRAW_ONE_RULESET
  ) {
    return false;
  }
  if (
    input.generatorVersion !== undefined &&
    !DEAL_GENERATORS.includes(input.generatorVersion)
  ) {
    return false;
  }

  const deal =
    input.generatorVersion === "CURATED_SOLVABLE_V1"
      ? createCuratedSolvableKlondikeDeal(input.seed)
      : createSeededKlondikeDeal(input.seed);
  return deal.commitment === input.commitment;
}

function shuffledCopy<T>(
  values: readonly T[],
  nextUint32: () => number,
): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = boundedRandom(nextUint32, index);
    [result[index], result[swapIndex]] = [
      result[swapIndex],
      result[index],
    ];
  }
  return result;
}

function cardsForRanks(
  suit: Suit,
  ranks: readonly Rank[],
): readonly Readonly<Card>[] {
  return ranks.map((rank) => createCard(suit, rank));
}

/**
 * Versioned curated family with a mechanically replayable solution:
 *
 * - Tableau contains A–7 for every suit in four independent foundation lanes.
 * - Stock draw order contains ranks 8–K, one seeded suit permutation per rank.
 * - The seed permutes suit assignment and stock ordering while retaining the
 *   proven legal replay shape.
 *
 * This is not a general Klondike solver and does not certify arbitrary deals.
 */
export function createCuratedSolvableKlondikeDeal(
  seedInput: string,
): Readonly<KlondikeDeal> {
  const seed = requireNonEmpty(seedInput, "seed");
  const nextUint32 = uint32Stream(`CURATED_SOLVABLE_V1\0${seed}`);
  const [longLane, splitSixLane, splitFiveLane, splitFourLane] =
    shuffledCopy<Suit>(SUITS, nextUint32);

  const tableauColumns: readonly (readonly Readonly<Card>[])[] = [
    cardsForRanks(splitSixLane, ["SEVEN"]),
    cardsForRanks(splitFiveLane, ["SEVEN", "SIX"]),
    cardsForRanks(splitFourLane, ["SEVEN", "SIX", "FIVE"]),
    cardsForRanks(splitFourLane, ["FOUR", "THREE", "TWO", "ACE"]),
    cardsForRanks(splitFiveLane, ["FIVE", "FOUR", "THREE", "TWO", "ACE"]),
    cardsForRanks(splitSixLane, [
      "SIX",
      "FIVE",
      "FOUR",
      "THREE",
      "TWO",
      "ACE",
    ]),
    cardsForRanks(longLane, [
      "SEVEN",
      "SIX",
      "FIVE",
      "FOUR",
      "THREE",
      "TWO",
      "ACE",
    ]),
  ];

  const stockRanks: readonly Rank[] = [
    "EIGHT",
    "NINE",
    "TEN",
    "JACK",
    "QUEEN",
    "KING",
  ];
  const stockDrawOrder = stockRanks.flatMap((rank) =>
    shuffledCopy<Suit>(SUITS, nextUint32).map((suit) =>
      createCard(suit, rank),
    ),
  );
  // dealKlondikeLayout reverses the committed remainder into a pop-based stock.
  const orderedDeck = [
    ...tableauColumns.flat(),
    ...stockDrawOrder,
  ];
  const commitment = createDealCommitment({
    seed,
    rulesetVersion: KLONDIKE_DRAW_ONE_RULESET,
    generatorVersion: "CURATED_SOLVABLE_V1",
    orderedCardIds: orderedDeck.map((card) => card.id),
  });

  return deepFreeze({
    rulesetVersion: KLONDIKE_DRAW_ONE_RULESET,
    generatorVersion: "CURATED_SOLVABLE_V1",
    orderedDeck,
    commitment,
  });
}

export function dealKlondikeLayout(
  deal: Readonly<KlondikeDeal>,
): Readonly<DealtKlondikeLayout> {
  if (deal.rulesetVersion !== KLONDIKE_DRAW_ONE_RULESET) {
    throw new DomainError("UNSUPPORTED_RULESET", "Unsupported ruleset");
  }
  if (
    deal.orderedDeck.length !== 52 ||
    new Set(deal.orderedDeck.map((card) => card.id)).size !== 52
  ) {
    throw new DomainError("INVALID_DEAL", "Deal must contain 52 unique cards");
  }

  let cursor = 0;
  const tableau: PositionedCard[][] = [];

  for (let column = 0; column < 7; column += 1) {
    const pile: PositionedCard[] = [];
    for (let row = 0; row <= column; row += 1) {
      pile.push({
        card: deal.orderedDeck[cursor],
        faceUp: row === column,
      });
      cursor += 1;
    }
    tableau.push(pile);
  }

  const stock = deal.orderedDeck.slice(cursor).reverse();
  if (
    tableau.flat().length !== 28 ||
    stock.length !== 24 ||
    SUITS.length !== 4
  ) {
    throw new DomainError("INVALID_DEAL", "Klondike deal invariant failed");
  }

  return deepFreeze({ tableau, stock });
}
