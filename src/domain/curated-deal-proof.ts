import {
  CURATED_SOLUTION_PROOF_VERSION,
  createDealValidationRecord,
  DealValidationRecord,
} from "./competition";
import { KlondikeDeal } from "./deal";
import {
  applyAuthoritativeMove,
  assertKlondikeCardConservation,
  createKlondikeGameState,
  hashKlondikeGameState,
  MoveEvent,
  MoveIntent,
  verifyMoveEventChain,
} from "./game-engine";
import {
  canonicalJson,
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
  sha256Hex,
} from "./shared";

export interface CuratedSolutionProof {
  readonly proofVersion: typeof CURATED_SOLUTION_PROOF_VERSION;
  readonly dealId: string;
  readonly dealCommitment: string;
  readonly acceptedMoveCount: 97;
  readonly finalStatus: "WON";
  readonly finalEventHash: string;
  readonly transcriptHash: string;
  readonly events: readonly Readonly<MoveEvent>[];
}

export function createCuratedSolutionIntents(): readonly MoveIntent[] {
  const intents: MoveIntent[] = [];
  const drainLane = (column: number, cards: number): void => {
    for (let index = 0; index < cards; index += 1) {
      intents.push({ type: "TABLEAU_TO_FOUNDATION", fromColumn: column });
      if (index < cards - 1) {
        intents.push({ type: "FLIP_TABLEAU", column });
      }
    }
  };

  // Four A–7 foundation lanes encoded by CURATED_SOLVABLE_V1.
  drainLane(6, 7);
  drainLane(5, 6);
  intents.push({ type: "TABLEAU_TO_FOUNDATION", fromColumn: 0 });
  drainLane(4, 5);
  intents.push({ type: "TABLEAU_TO_FOUNDATION", fromColumn: 1 });
  intents.push({ type: "FLIP_TABLEAU", column: 1 });
  intents.push({ type: "TABLEAU_TO_FOUNDATION", fromColumn: 1 });
  drainLane(3, 4);
  intents.push({ type: "TABLEAU_TO_FOUNDATION", fromColumn: 2 });
  intents.push({ type: "FLIP_TABLEAU", column: 2 });
  intents.push({ type: "TABLEAU_TO_FOUNDATION", fromColumn: 2 });
  intents.push({ type: "FLIP_TABLEAU", column: 2 });
  intents.push({ type: "TABLEAU_TO_FOUNDATION", fromColumn: 2 });

  // Ranks 8–K are in stock order and can each go straight to foundation.
  for (let stockCard = 0; stockCard < 24; stockCard += 1) {
    intents.push({ type: "DRAW_STOCK" });
    intents.push({ type: "WASTE_TO_FOUNDATION" });
  }

  if (intents.length !== 97) {
    throw new DomainError(
      "INVALID_CURATED_PROOF",
      "Curated proof must contain exactly 97 accepted moves",
    );
  }
  return deepFreeze(intents);
}

/**
 * Mechanically certifies only CURATED_SOLVABLE_V1 deals by replaying every
 * move through the same authoritative validator used for player sessions.
 */
export function replayCuratedSolvableDeal(input: {
  readonly dealId: string;
  readonly deal: Readonly<KlondikeDeal>;
  readonly validationStartedAtServerMs: number;
}): Readonly<CuratedSolutionProof> {
  const dealId = requireNonEmpty(input.dealId, "dealId");
  requireNonNegativeInteger(
    input.validationStartedAtServerMs,
    "validationStartedAtServerMs",
  );
  if (input.deal.generatorVersion !== "CURATED_SOLVABLE_V1") {
    throw new DomainError(
      "UNSUPPORTED_PROOF_GENERATOR",
      "Replay proof applies only to CURATED_SOLVABLE_V1 deals",
    );
  }

  let state = createKlondikeGameState({
    gameId: `curated-proof:${dealId}`,
    deal: input.deal,
  });
  const intents = createCuratedSolutionIntents();
  for (const [index, intent] of intents.entries()) {
    const sequence = index + 1;
    const result = applyAuthoritativeMove(
      state,
      {
        gameId: state.gameId,
        actionId: `curated-proof-${sequence}`,
        sequence,
        priorStateHash: hashKlondikeGameState(state),
        intent,
      },
      {
        serverReceivedAtMs:
          input.validationStartedAtServerMs + sequence,
      },
    );
    if (!result.accepted) {
      throw new DomainError(
        "CURATED_PROOF_REPLAY_FAILED",
        `Curated proof failed at move ${sequence}: ${result.message}`,
      );
    }
    state = result.state;
    assertKlondikeCardConservation(state);
  }

  if (
    state.status !== "WON" ||
    state.validMoveCount !== 97 ||
    !verifyMoveEventChain(state.events)
  ) {
    throw new DomainError(
      "CURATED_PROOF_REPLAY_FAILED",
      "Curated replay did not produce a verified win",
    );
  }

  const finalEventHash = state.events[state.events.length - 1].eventHash;
  const transcriptHash = sha256Hex(
    canonicalJson({
      protocol: CURATED_SOLUTION_PROOF_VERSION,
      dealId,
      dealCommitment: input.deal.commitment,
      eventHashes: state.events.map((event) => event.eventHash),
      finalStatus: state.status,
      acceptedMoveCount: state.validMoveCount,
    }),
  );

  return deepFreeze({
    proofVersion: CURATED_SOLUTION_PROOF_VERSION,
    dealId,
    dealCommitment: input.deal.commitment,
    acceptedMoveCount: 97,
    finalStatus: "WON",
    finalEventHash,
    transcriptHash,
    events: state.events,
  });
}

export function createVerifiedCuratedDealValidation(input: {
  readonly validationId: string;
  readonly dealId: string;
  readonly deal: Readonly<KlondikeDeal>;
  readonly validatedAtServerMs: number;
}): {
  readonly validation: Readonly<DealValidationRecord>;
  readonly proof: Readonly<CuratedSolutionProof>;
} {
  const proof = replayCuratedSolvableDeal({
    dealId: input.dealId,
    deal: input.deal,
    validationStartedAtServerMs: input.validatedAtServerMs,
  });
  const validation = createDealValidationRecord({
    validationId: input.validationId,
    dealId: input.dealId,
    dealCommitment: input.deal.commitment,
    rulesetVersion: input.deal.rulesetVersion,
    dealGeneratorVersion: input.deal.generatorVersion,
    status: "VERIFIED_SOLVABLE",
    solverName: CURATED_SOLUTION_PROOF_VERSION,
    solverVersion: "1",
    validatedAtServerMs: input.validatedAtServerMs + proof.acceptedMoveCount,
    evidenceReference: `sha256:${proof.transcriptHash}`,
  });

  return deepFreeze({ validation, proof });
}
