export type Suit = "CLUBS" | "DIAMONDS" | "HEARTS" | "SPADES";
export type Rank =
  | "ACE"
  | "TWO"
  | "THREE"
  | "FOUR"
  | "FIVE"
  | "SIX"
  | "SEVEN"
  | "EIGHT"
  | "NINE"
  | "TEN"
  | "JACK"
  | "QUEEN"
  | "KING";

export type ServerCard = {
  id: string;
  suit: Suit;
  rank: Rank;
};

export type PositionedCard =
  | (ServerCard & { faceUp: true })
  | { id: null; suit: null; rank: null; faceUp: false };

export type ServerGameSession = {
  id: string;
  mode: "PRACTICE" | "NONCASH_COMPETITION";
  rulesetVersion: string;
  dealGeneratorVersion: string;
  dealCommitment: string;
  stateHash: string;
  status: "ACTIVE" | "WON" | "ABANDONED";
  sequence: number;
  validMoveCount: number;
  verifiedActivePlayMs: number;
  serverObservedAtMs?: number;
  activityClockStatus?: "RUNNING" | "PAUSED" | "FINALIZED";
  stock: { remaining: number };
  waste: { count: number; top: ServerCard | null };
  tableau: PositionedCard[][];
  foundations: Record<Suit, { count: number; top: ServerCard | null }>;
  serverAuthoritative: true;
};

export type MoveIntent =
  | { type: "DRAW_STOCK" }
  | { type: "RECYCLE_WASTE" }
  | { type: "FLIP_TABLEAU"; column: number }
  | { type: "WASTE_TO_TABLEAU"; toColumn: number }
  | { type: "WASTE_TO_FOUNDATION" }
  | {
      type: "TABLEAU_TO_TABLEAU";
      fromColumn: number;
      startIndex: number;
      toColumn: number;
    }
  | { type: "TABLEAU_TO_FOUNDATION"; fromColumn: number }
  | { type: "FOUNDATION_TO_TABLEAU"; suit: Suit; toColumn: number }
  | { type: "ABANDON" };

const SUIT_NAMES = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"] as const;
const RANK_NAMES = ["ACE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "JACK", "QUEEN", "KING"] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function publicCard(value: unknown): value is ServerCard {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 &&
    SUIT_NAMES.includes(value.suit as Suit) && RANK_NAMES.includes(value.rank as Rank);
}

/** Validate the public response before it can replace a confirmed board. */
export function isServerGameSession(value: unknown): value is ServerGameSession {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || value.id.length > 200 ||
      !["PRACTICE", "NONCASH_COMPETITION"].includes(value.mode as string) ||
      !["ACTIVE", "WON", "ABANDONED"].includes(value.status as string) ||
      typeof value.stateHash !== "string" || !/^[a-f0-9]{64}$/.test(value.stateHash) ||
      !integer(value.sequence, 2_147_483_647) || !integer(value.validMoveCount) ||
      !integer(value.verifiedActivePlayMs) || value.serverAuthoritative !== true) return false;
  for (const field of ["rulesetVersion", "dealGeneratorVersion", "dealCommitment"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0) return false;
  }
  if (value.serverObservedAtMs !== undefined && !integer(value.serverObservedAtMs)) return false;
  if (value.activityClockStatus !== undefined &&
      !["RUNNING", "PAUSED", "FINALIZED"].includes(value.activityClockStatus as string)) return false;
  if (!isRecord(value.stock) || !integer(value.stock.remaining, 52) ||
      !isRecord(value.waste) || !integer(value.waste.count, 52) ||
      (value.waste.count === 0 ? value.waste.top !== null : !publicCard(value.waste.top))) return false;
  if (!Array.isArray(value.tableau) || value.tableau.length !== 7 || !value.tableau.every(
    (pile: unknown) => Array.isArray(pile) && pile.length <= 52 && pile.every(
      (card: unknown) => isRecord(card) && (card.faceUp === true ? publicCard(card) :
        card.faceUp === false && card.id === null && card.suit === null && card.rank === null),
    ),
  )) return false;
  if (!isRecord(value.foundations)) return false;
  let foundationCount = 0;
  for (const suit of SUIT_NAMES) {
    const pile = value.foundations[suit];
    if (!isRecord(pile) || !integer(pile.count, 13) ||
        (pile.count === 0 ? pile.top !== null : !publicCard(pile.top) || pile.top.suit !== suit)) return false;
    foundationCount += pile.count;
  }
  // A malformed partial response must not enable controls against an incomplete hand.
  return value.stock.remaining + value.waste.count + foundationCount +
    value.tableau.reduce((total: number, pile: unknown[]) => total + pile.length, 0) === 52;
}

export function canAdoptGameSnapshot(current: ServerGameSession, next: ServerGameSession): boolean {
  if (current.id !== next.id || current.mode !== next.mode ||
      current.rulesetVersion !== next.rulesetVersion ||
      current.dealGeneratorVersion !== next.dealGeneratorVersion ||
      current.dealCommitment !== next.dealCommitment || next.sequence < current.sequence) return false;
  if (current.status !== "ACTIVE" && (next.status !== current.status ||
      next.sequence !== current.sequence || next.stateHash !== current.stateHash ||
      next.verifiedActivePlayMs !== current.verifiedActivePlayMs)) return false;
  if (next.sequence === current.sequence &&
      (next.stateHash !== current.stateHash || next.status !== current.status)) return false;
  if (next.sequence === current.sequence && current.serverObservedAtMs !== undefined &&
      (next.serverObservedAtMs === undefined || next.serverObservedAtMs < current.serverObservedAtMs)) return false;
  return true;
}

/** Stored commands are untrusted browser data; preserve only the supported shape. */
export function isMoveIntent(value: unknown): value is MoveIntent {
  if (!isRecord(value)) return false;
  const column = (key: string) => integer(value[key], 6);
  switch (value.type) {
    case "DRAW_STOCK": case "RECYCLE_WASTE": case "WASTE_TO_FOUNDATION": case "ABANDON":
      return Object.keys(value).length === 1;
    case "FLIP_TABLEAU": return column("column") && Object.keys(value).length === 2;
    case "WASTE_TO_TABLEAU": return column("toColumn") && Object.keys(value).length === 2;
    case "TABLEAU_TO_FOUNDATION": return column("fromColumn") && Object.keys(value).length === 2;
    case "TABLEAU_TO_TABLEAU":
      return column("fromColumn") && column("toColumn") && integer(value.startIndex, 51) && Object.keys(value).length === 4;
    case "FOUNDATION_TO_TABLEAU":
      return SUIT_NAMES.includes(value.suit as Suit) && column("toColumn") && Object.keys(value).length === 3;
    default: return false;
  }
}
