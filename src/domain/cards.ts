import { deepFreeze, DomainError } from "./shared";

export const SUITS = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  "ACE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "JACK",
  "QUEEN",
  "KING",
] as const;
export type Rank = (typeof RANKS)[number];

export type CardColor = "BLACK" | "RED";

export interface Card {
  readonly id: string;
  readonly suit: Suit;
  readonly rank: Rank;
  readonly rankValue: number;
  readonly color: CardColor;
}

const SUIT_CODES: Readonly<Record<Suit, string>> = deepFreeze({
  CLUBS: "C",
  DIAMONDS: "D",
  HEARTS: "H",
  SPADES: "S",
});

const RANK_CODES: Readonly<Record<Rank, string>> = deepFreeze({
  ACE: "A",
  TWO: "2",
  THREE: "3",
  FOUR: "4",
  FIVE: "5",
  SIX: "6",
  SEVEN: "7",
  EIGHT: "8",
  NINE: "9",
  TEN: "10",
  JACK: "J",
  QUEEN: "Q",
  KING: "K",
});

export function cardColor(suit: Suit): CardColor {
  return suit === "DIAMONDS" || suit === "HEARTS" ? "RED" : "BLACK";
}

export function createCard(suit: Suit, rank: Rank): Readonly<Card> {
  const rankValue = RANKS.indexOf(rank) + 1;
  if (rankValue === 0 || !SUITS.includes(suit)) {
    throw new DomainError("INVALID_CARD", "Unknown card suit or rank");
  }

  return deepFreeze({
    id: `${RANK_CODES[rank]}${SUIT_CODES[suit]}`,
    suit,
    rank,
    rankValue,
    color: cardColor(suit),
  });
}

export function createCanonicalDeck(): readonly Readonly<Card>[] {
  return deepFreeze(
    SUITS.flatMap((suit) => RANKS.map((rank) => createCard(suit, rank))),
  );
}

export function canPlaceOnTableau(
  movingCard: Readonly<Card>,
  destinationTop: Readonly<Card> | undefined,
): boolean {
  if (destinationTop === undefined) {
    return movingCard.rank === "KING";
  }

  return (
    movingCard.color !== destinationTop.color &&
    movingCard.rankValue + 1 === destinationTop.rankValue
  );
}

export function canPlaceOnFoundation(
  movingCard: Readonly<Card>,
  foundationTop: Readonly<Card> | undefined,
): boolean {
  if (foundationTop === undefined) {
    return movingCard.rank === "ACE";
  }

  return (
    movingCard.suit === foundationTop.suit &&
    movingCard.rankValue === foundationTop.rankValue + 1
  );
}

export function isValidTableauRun(
  cards: readonly Readonly<Card>[],
): boolean {
  return cards.every((card, index) => {
    if (index === cards.length - 1) {
      return true;
    }
    return canPlaceOnTableau(cards[index + 1], card);
  });
}
