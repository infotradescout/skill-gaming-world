import {
  canPlaceOnFoundation,
  canPlaceOnTableau,
  Card,
  isValidTableauRun,
  Suit,
  SUITS,
} from "./cards";
import {
  dealKlondikeLayout,
  KlondikeDeal,
  KLONDIKE_DRAW_ONE_RULESET,
  PositionedCard,
} from "./deal";
import {
  canonicalJson,
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
  sha256Hex,
} from "./shared";

export type GameStatus = "ACTIVE" | "WON" | "ABANDONED";

export type MoveIntent =
  | { readonly type: "DRAW_STOCK" }
  | { readonly type: "RECYCLE_WASTE" }
  | {
      readonly type: "FLIP_TABLEAU";
      readonly column: number;
    }
  | {
      readonly type: "WASTE_TO_TABLEAU";
      readonly toColumn: number;
    }
  | {
      readonly type: "WASTE_TO_FOUNDATION";
    }
  | {
      readonly type: "TABLEAU_TO_TABLEAU";
      readonly fromColumn: number;
      readonly startIndex: number;
      readonly toColumn: number;
    }
  | {
      readonly type: "TABLEAU_TO_FOUNDATION";
      readonly fromColumn: number;
    }
  | {
      readonly type: "FOUNDATION_TO_TABLEAU";
      readonly suit: Suit;
      readonly toColumn: number;
    }
  | { readonly type: "ABANDON" };

export interface MoveCommand {
  readonly gameId: string;
  readonly actionId: string;
  readonly sequence: number;
  readonly priorStateHash: string;
  readonly intent: MoveIntent;
}

export interface ServerMoveAuthority {
  /**
   * Supplied by the server boundary, never read from the move command.
   */
  readonly serverReceivedAtMs: number;
}

export interface MoveEvent {
  readonly gameId: string;
  readonly actionId: string;
  readonly sequence: number;
  readonly intent: MoveIntent;
  readonly requestHash: string;
  readonly stateHashBefore: string;
  readonly stateHashAfter: string;
  readonly serverReceivedAtMs: number;
  readonly validMoveNumber: number | null;
  readonly previousEventHash: string;
  readonly eventHash: string;
}

export interface KlondikeGameState {
  readonly gameId: string;
  readonly rulesetVersion: typeof KLONDIKE_DRAW_ONE_RULESET;
  readonly dealGeneratorVersion: Readonly<KlondikeDeal>["generatorVersion"];
  readonly dealCommitment: string;
  readonly status: GameStatus;
  readonly tableau: readonly (readonly Readonly<PositionedCard>[])[];
  readonly stock: readonly Readonly<Card>[];
  readonly waste: readonly Readonly<Card>[];
  readonly foundations: Readonly<Record<Suit, readonly Readonly<Card>[]>>;
  readonly lastSequence: number;
  readonly validMoveCount: number;
  readonly events: readonly Readonly<MoveEvent>[];
  readonly processedActionIds: readonly string[];
}

export type MoveRejectionCode =
  | "GAME_ID_MISMATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "STATE_HASH_MISMATCH"
  | "REPLAYED_SEQUENCE"
  | "OUT_OF_ORDER_SEQUENCE"
  | "GAME_NOT_ACTIVE"
  | "INVALID_AUTHORITY_TIME"
  | "CARD_CONSERVATION_FAILURE"
  | "ILLEGAL_MOVE";

export interface AcceptedMove {
  readonly accepted: true;
  /**
   * Current authoritative state. On an idempotent retry this may be newer than
   * the immutable original outcome when later commands were already accepted.
   */
  readonly state: Readonly<KlondikeGameState>;
  readonly event: Readonly<MoveEvent>;
  readonly outcome: Readonly<AcceptedMoveOutcome>;
  readonly idempotentReplay: boolean;
}

export interface AcceptedMoveOutcome {
  readonly event: Readonly<MoveEvent>;
  readonly acceptedSequence: number;
  readonly acceptedStateHash: string;
  readonly requestHash: string;
}

export interface RejectedMove {
  readonly accepted: false;
  readonly state: Readonly<KlondikeGameState>;
  readonly code: MoveRejectionCode;
  readonly message: string;
  readonly requestHash: string;
  readonly stateHashBefore: string;
}

export type MoveResult = AcceptedMove | RejectedMove;

const EVENT_GENESIS_HASH = sha256Hex("MONETAIRE_MOVE_EVENT_GENESIS_V2");

function emptyFoundations(): Record<Suit, readonly Readonly<Card>[]> {
  return {
    CLUBS: [],
    DIAMONDS: [],
    HEARTS: [],
    SPADES: [],
  };
}

export function createKlondikeGameState(input: {
  readonly gameId: string;
  readonly deal: Readonly<KlondikeDeal>;
}): Readonly<KlondikeGameState> {
  const gameId = requireNonEmpty(input.gameId, "gameId");
  const layout = dealKlondikeLayout(input.deal);

  const state: Readonly<KlondikeGameState> = deepFreeze({
    gameId,
    rulesetVersion: KLONDIKE_DRAW_ONE_RULESET,
    dealGeneratorVersion: input.deal.generatorVersion,
    dealCommitment: input.deal.commitment,
    status: "ACTIVE",
    tableau: layout.tableau,
    stock: layout.stock,
    waste: [],
    foundations: emptyFoundations(),
    lastSequence: 0,
    validMoveCount: 0,
    events: [],
    processedActionIds: [],
  });
  assertKlondikeCardConservation(state);
  return state;
}

function reject(
  state: Readonly<KlondikeGameState>,
  code: MoveRejectionCode,
  message: string,
  requestHash: string,
  stateHashBefore: string,
): RejectedMove {
  return deepFreeze({
    accepted: false,
    state,
    code,
    message,
    requestHash,
    stateHashBefore,
  });
}

function requireColumn(
  state: Readonly<KlondikeGameState>,
  column: number,
): readonly Readonly<PositionedCard>[] {
  if (
    !Number.isSafeInteger(column) ||
    column < 0 ||
    column >= state.tableau.length
  ) {
    throw new DomainError("ILLEGAL_MOVE", "Tableau column is out of range");
  }
  return state.tableau[column];
}

function requireSuit(suit: Suit): Suit {
  if (!SUITS.includes(suit)) {
    throw new DomainError("ILLEGAL_MOVE", "Foundation suit is invalid");
  }
  return suit;
}

interface MutablePosition {
  tableau: PositionedCard[][];
  stock: Readonly<Card>[];
  waste: Readonly<Card>[];
  foundations: Record<Suit, Readonly<Card>[]>;
  status: GameStatus;
}

type CardPosition = Pick<
  KlondikeGameState,
  "tableau" | "stock" | "waste" | "foundations"
>;

/**
 * Enforces the strongest low-level game invariant: every position contains
 * exactly one copy of each of the 52 cards. Accepted moves may only relocate or
 * reveal cards; they can never create or discard one.
 */
export function assertKlondikeCardConservation(
  position: Readonly<CardPosition>,
): true {
  const cardIds = [
    ...position.tableau.flatMap((pile) =>
      pile.map((positioned) => positioned.card.id),
    ),
    ...position.stock.map((card) => card.id),
    ...position.waste.map((card) => card.id),
    ...SUITS.flatMap((suit) =>
      position.foundations[suit].map((card) => card.id),
    ),
  ];
  if (cardIds.length !== 52 || new Set(cardIds).size !== 52) {
    throw new DomainError(
      "CARD_CONSERVATION_FAILURE",
      "Klondike state must conserve exactly 52 unique cards",
    );
  }
  return true;
}

/**
 * Hashes the complete authoritative position and scoring cursor without
 * including the event collection that attests to it. This avoids a circular
 * dependency while still binding every command to one exact server state.
 */
export function hashKlondikeGameState(
  state: Readonly<KlondikeGameState>,
): string {
  return sha256Hex(
    canonicalJson({
      protocol: "MONETAIRE_GAME_STATE_V1",
      gameId: state.gameId,
      rulesetVersion: state.rulesetVersion,
      dealGeneratorVersion: state.dealGeneratorVersion,
      dealCommitment: state.dealCommitment,
      status: state.status,
      tableau: state.tableau.map((pile) =>
        pile.map((positioned) => ({
          cardId: positioned.card.id,
          faceUp: positioned.faceUp,
        })),
      ),
      stock: state.stock.map((card) => card.id),
      waste: state.waste.map((card) => card.id),
      foundations: Object.fromEntries(
        SUITS.map((suit) => [
          suit,
          state.foundations[suit].map((card) => card.id),
        ]),
      ),
      lastSequence: state.lastSequence,
      validMoveCount: state.validMoveCount,
    }),
  );
}

/**
 * The server computes this digest from the normalized command. A client cannot
 * supply or override it.
 */
export function hashMoveRequest(
  command: Readonly<MoveCommand>,
): string {
  return sha256Hex(
    canonicalJson({
      protocol: "MONETAIRE_MOVE_REQUEST_V1",
      gameId: command.gameId,
      actionId: command.actionId,
      sequence: command.sequence,
      priorStateHash: command.priorStateHash,
      intent: command.intent,
    }),
  );
}

function copyPosition(state: Readonly<KlondikeGameState>): MutablePosition {
  return {
    tableau: state.tableau.map((pile) =>
      pile.map((positioned) => ({
        card: positioned.card,
        faceUp: positioned.faceUp,
      })),
    ),
    stock: [...state.stock],
    waste: [...state.waste],
    foundations: {
      CLUBS: [...state.foundations.CLUBS],
      DIAMONDS: [...state.foundations.DIAMONDS],
      HEARTS: [...state.foundations.HEARTS],
      SPADES: [...state.foundations.SPADES],
    },
    status: state.status,
  };
}

function topCard<T>(pile: readonly T[]): T | undefined {
  return pile[pile.length - 1];
}

function applyLegalIntent(
  state: Readonly<KlondikeGameState>,
  intent: MoveIntent,
): { readonly position: MutablePosition; readonly countsForScore: boolean } {
  const next = copyPosition(state);

  switch (intent.type) {
    case "DRAW_STOCK": {
      if (next.stock.length === 0) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Stock is empty; recycle the waste first",
        );
      }
      const card = next.stock.pop();
      if (card === undefined) {
        throw new DomainError("ILLEGAL_MOVE", "Stock is empty");
      }
      next.waste.push(card);
      break;
    }

    case "RECYCLE_WASTE": {
      if (next.stock.length > 0 || next.waste.length === 0) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Waste can only be recycled when stock is empty and waste is not",
        );
      }
      next.stock = [...next.waste].reverse();
      next.waste = [];
      break;
    }

    case "FLIP_TABLEAU": {
      const pile = requireColumn(state, intent.column);
      const top = topCard(pile);
      if (top === undefined || top.faceUp) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Only an exposed face-down tableau card can be flipped",
        );
      }
      next.tableau[intent.column][pile.length - 1] = {
        card: top.card,
        faceUp: true,
      };
      break;
    }

    case "WASTE_TO_TABLEAU": {
      const destination = requireColumn(state, intent.toColumn);
      const movingCard = topCard(next.waste);
      const destinationTop = topCard(destination);
      if (
        movingCard === undefined ||
        (destinationTop !== undefined && !destinationTop.faceUp) ||
        !canPlaceOnTableau(movingCard, destinationTop?.card)
      ) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Waste card cannot be placed on that tableau column",
        );
      }
      next.waste.pop();
      next.tableau[intent.toColumn].push({ card: movingCard, faceUp: true });
      break;
    }

    case "WASTE_TO_FOUNDATION": {
      const movingCard = topCard(next.waste);
      if (movingCard === undefined) {
        throw new DomainError("ILLEGAL_MOVE", "Waste is empty");
      }
      const destination = next.foundations[movingCard.suit];
      if (!canPlaceOnFoundation(movingCard, topCard(destination))) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Waste card cannot be placed on its foundation",
        );
      }
      next.waste.pop();
      destination.push(movingCard);
      break;
    }

    case "TABLEAU_TO_TABLEAU": {
      const source = requireColumn(state, intent.fromColumn);
      const destination = requireColumn(state, intent.toColumn);
      if (intent.fromColumn === intent.toColumn) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Source and destination columns must differ",
        );
      }
      if (
        !Number.isSafeInteger(intent.startIndex) ||
        intent.startIndex < 0 ||
        intent.startIndex >= source.length
      ) {
        throw new DomainError("ILLEGAL_MOVE", "Start index is out of range");
      }

      const positionedRun = source.slice(intent.startIndex);
      if (
        positionedRun.length === 0 ||
        positionedRun.some((positioned) => !positioned.faceUp) ||
        !isValidTableauRun(positionedRun.map((positioned) => positioned.card))
      ) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Only a complete face-up descending alternating run can move",
        );
      }

      const destinationTop = topCard(destination);
      if (
        (destinationTop !== undefined && !destinationTop.faceUp) ||
        !canPlaceOnTableau(
          positionedRun[0].card,
          destinationTop?.card,
        )
      ) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Tableau run cannot be placed on that destination",
        );
      }

      next.tableau[intent.fromColumn] = next.tableau[
        intent.fromColumn
      ].slice(0, intent.startIndex);
      next.tableau[intent.toColumn].push(...positionedRun);
      break;
    }

    case "TABLEAU_TO_FOUNDATION": {
      const source = requireColumn(state, intent.fromColumn);
      const positioned = topCard(source);
      if (positioned === undefined || !positioned.faceUp) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Only an exposed tableau card can move to a foundation",
        );
      }
      const destination = next.foundations[positioned.card.suit];
      if (!canPlaceOnFoundation(positioned.card, topCard(destination))) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Tableau card cannot be placed on its foundation",
        );
      }
      next.tableau[intent.fromColumn].pop();
      destination.push(positioned.card);
      break;
    }

    case "FOUNDATION_TO_TABLEAU": {
      const suit = requireSuit(intent.suit);
      const destination = requireColumn(state, intent.toColumn);
      const foundation = next.foundations[suit];
      const movingCard = topCard(foundation);
      const destinationTop = topCard(destination);
      if (
        movingCard === undefined ||
        (destinationTop !== undefined && !destinationTop.faceUp) ||
        !canPlaceOnTableau(movingCard, destinationTop?.card)
      ) {
        throw new DomainError(
          "ILLEGAL_MOVE",
          "Foundation card cannot be placed on that tableau column",
        );
      }
      foundation.pop();
      next.tableau[intent.toColumn].push({ card: movingCard, faceUp: true });
      break;
    }

    case "ABANDON": {
      next.status = "ABANDONED";
      return { position: next, countsForScore: false };
    }

    default: {
      throw new DomainError("ILLEGAL_MOVE", "Move type is not supported");
    }
  }

  const foundationCount = SUITS.reduce(
    (total, suit) => total + next.foundations[suit].length,
    0,
  );
  if (foundationCount === 52) {
    next.status = "WON";
  }

  return { position: next, countsForScore: true };
}

function createMoveEvent(input: {
  readonly state: Readonly<KlondikeGameState>;
  readonly command: Readonly<MoveCommand>;
  readonly requestHash: string;
  readonly stateHashBefore: string;
  readonly stateHashAfter: string;
  readonly serverReceivedAtMs: number;
  readonly validMoveNumber: number | null;
}): Readonly<MoveEvent> {
  const previousEventHash =
    topCard(input.state.events)?.eventHash ?? EVENT_GENESIS_HASH;
  const eventPayload = {
    protocol: "MONETAIRE_MOVE_EVENT_V2",
    gameId: input.state.gameId,
    actionId: input.command.actionId,
    sequence: input.command.sequence,
    intent: input.command.intent,
    requestHash: input.requestHash,
    stateHashBefore: input.stateHashBefore,
    stateHashAfter: input.stateHashAfter,
    serverReceivedAtMs: input.serverReceivedAtMs,
    validMoveNumber: input.validMoveNumber,
    previousEventHash,
  };

  return deepFreeze({
    gameId: input.state.gameId,
    actionId: input.command.actionId,
    sequence: input.command.sequence,
    intent: input.command.intent,
    requestHash: input.requestHash,
    stateHashBefore: input.stateHashBefore,
    stateHashAfter: input.stateHashAfter,
    serverReceivedAtMs: input.serverReceivedAtMs,
    validMoveNumber: input.validMoveNumber,
    previousEventHash,
    eventHash: sha256Hex(canonicalJson(eventPayload)),
  });
}

function acceptedMoveOutcome(
  event: Readonly<MoveEvent>,
): Readonly<AcceptedMoveOutcome> {
  return deepFreeze({
    event,
    acceptedSequence: event.sequence,
    acceptedStateHash: event.stateHashAfter,
    requestHash: event.requestHash,
  });
}

/**
 * Applies a client intent to server-held state. The command intentionally has
 * no clock or score fields; those values come from the server authority and
 * accepted state transition.
 */
export function applyAuthoritativeMove(
  state: Readonly<KlondikeGameState>,
  command: Readonly<MoveCommand>,
  authority: Readonly<ServerMoveAuthority>,
): MoveResult {
  const stateHashBefore = hashKlondikeGameState(state);
  const unnormalizedRequestHash = hashMoveRequest(command);
  if (command.gameId !== state.gameId) {
    return reject(
      state,
      "GAME_ID_MISMATCH",
      "Move belongs to another game",
      unnormalizedRequestHash,
      stateHashBefore,
    );
  }

  let actionId: string;
  try {
    actionId = requireNonEmpty(command.actionId, "actionId");
  } catch {
    return reject(
      state,
      "ILLEGAL_MOVE",
      "actionId is required",
      unnormalizedRequestHash,
      stateHashBefore,
    );
  }
  const normalizedCommand = { ...command, actionId };
  const requestHash = hashMoveRequest(normalizedCommand);
  if (!/^[a-f0-9]{64}$/.test(command.priorStateHash)) {
    return reject(
      state,
      "ILLEGAL_MOVE",
      "priorStateHash must be a lowercase SHA-256 digest",
      requestHash,
      stateHashBefore,
    );
  }

  const priorAcceptedEvent = state.events.find(
    (event) => event.actionId === actionId,
  );
  if (priorAcceptedEvent) {
    if (priorAcceptedEvent.requestHash === requestHash) {
      return deepFreeze({
        accepted: true,
        state,
        event: priorAcceptedEvent,
        outcome: acceptedMoveOutcome(priorAcceptedEvent),
        idempotentReplay: true,
      });
    }
    return reject(
      state,
      "IDEMPOTENCY_CONFLICT",
      "This actionId belongs to a different move request",
      requestHash,
      stateHashBefore,
    );
  }
  if (state.processedActionIds.includes(actionId)) {
    return reject(
      state,
      "IDEMPOTENCY_CONFLICT",
      "This actionId has already been processed",
      requestHash,
      stateHashBefore,
    );
  }

  if (command.priorStateHash !== stateHashBefore) {
    return reject(
      state,
      "STATE_HASH_MISMATCH",
      "Move was based on a stale or different authoritative state",
      requestHash,
      stateHashBefore,
    );
  }

  const priorServerTime =
    state.events[state.events.length - 1]?.serverReceivedAtMs;
  if (
    priorServerTime !== undefined &&
    authority.serverReceivedAtMs < priorServerTime
  ) {
    return reject(
      state,
      "INVALID_AUTHORITY_TIME",
      "Server move time cannot precede the prior accepted event",
      requestHash,
      stateHashBefore,
    );
  }

  if (!Number.isSafeInteger(command.sequence) || command.sequence <= 0) {
    return reject(
      state,
      "OUT_OF_ORDER_SEQUENCE",
      "Sequence must be a positive integer",
      requestHash,
      stateHashBefore,
    );
  }
  if (command.sequence <= state.lastSequence) {
    return reject(
      state,
      "REPLAYED_SEQUENCE",
      "Sequence was already processed",
      requestHash,
      stateHashBefore,
    );
  }
  if (command.sequence !== state.lastSequence + 1) {
    return reject(
      state,
      "OUT_OF_ORDER_SEQUENCE",
      "Move sequence must be exactly the next sequence",
      requestHash,
      stateHashBefore,
    );
  }
  if (state.status !== "ACTIVE") {
    return reject(
      state,
      "GAME_NOT_ACTIVE",
      "Game is not active",
      requestHash,
      stateHashBefore,
    );
  }

  try {
    requireNonNegativeInteger(
      authority.serverReceivedAtMs,
      "serverReceivedAtMs",
    );
  } catch {
    return reject(
      state,
      "INVALID_AUTHORITY_TIME",
      "Server authority time is invalid",
      requestHash,
      stateHashBefore,
    );
  }

  let transition: ReturnType<typeof applyLegalIntent>;
  try {
    transition = applyLegalIntent(state, command.intent);
    assertKlondikeCardConservation(transition.position);
  } catch (error) {
    const conservationFailure =
      error instanceof DomainError &&
      error.code === "CARD_CONSERVATION_FAILURE";
    return reject(
      state,
      conservationFailure ? "CARD_CONSERVATION_FAILURE" : "ILLEGAL_MOVE",
      error instanceof Error ? error.message : "Illegal move",
      requestHash,
      stateHashBefore,
    );
  }

  const validMoveCount =
    state.validMoveCount + (transition.countsForScore ? 1 : 0);
  const nextStateWithoutEvent = {
    ...state,
    status: transition.position.status,
    tableau: transition.position.tableau,
    stock: transition.position.stock,
    waste: transition.position.waste,
    foundations: transition.position.foundations,
    lastSequence: command.sequence,
    validMoveCount,
    processedActionIds: [...state.processedActionIds, actionId],
  };
  const stateHashAfter = hashKlondikeGameState(nextStateWithoutEvent);
  const event = createMoveEvent({
    state,
    command: normalizedCommand,
    requestHash,
    stateHashBefore,
    stateHashAfter,
    serverReceivedAtMs: authority.serverReceivedAtMs,
    validMoveNumber: transition.countsForScore ? validMoveCount : null,
  });

  const nextState = deepFreeze({
    ...nextStateWithoutEvent,
    events: [...state.events, event],
  });
  if (hashKlondikeGameState(nextState) !== stateHashAfter) {
    throw new DomainError(
      "STATE_HASH_MISMATCH",
      "Accepted state hash does not match the authoritative transition",
    );
  }

  return deepFreeze({
    accepted: true,
    state: nextState,
    event,
    outcome: acceptedMoveOutcome(event),
    idempotentReplay: false,
  });
}

export function verifyMoveEventChain(
  events: readonly Readonly<MoveEvent>[],
): boolean {
  let previousEventHash = EVENT_GENESIS_HASH;
  let previousStateHashAfter: string | undefined;

  for (const event of events) {
    if (event.previousEventHash !== previousEventHash) {
      return false;
    }
    if (
      !/^[a-f0-9]{64}$/.test(event.requestHash) ||
      !/^[a-f0-9]{64}$/.test(event.stateHashBefore) ||
      !/^[a-f0-9]{64}$/.test(event.stateHashAfter) ||
      (previousStateHashAfter !== undefined &&
        event.stateHashBefore !== previousStateHashAfter)
    ) {
      return false;
    }
    const expectedRequestHash = hashMoveRequest({
      gameId: event.gameId,
      actionId: event.actionId,
      sequence: event.sequence,
      priorStateHash: event.stateHashBefore,
      intent: event.intent,
    });
    if (event.requestHash !== expectedRequestHash) {
      return false;
    }
    const expectedHash = sha256Hex(
      canonicalJson({
        protocol: "MONETAIRE_MOVE_EVENT_V2",
        gameId: event.gameId,
        actionId: event.actionId,
        sequence: event.sequence,
        intent: event.intent,
        requestHash: event.requestHash,
        stateHashBefore: event.stateHashBefore,
        stateHashAfter: event.stateHashAfter,
        serverReceivedAtMs: event.serverReceivedAtMs,
        validMoveNumber: event.validMoveNumber,
        previousEventHash: event.previousEventHash,
      }),
    );
    if (event.eventHash !== expectedHash) {
      return false;
    }
    previousEventHash = event.eventHash;
    previousStateHashAfter = event.stateHashAfter;
  }

  return true;
}
