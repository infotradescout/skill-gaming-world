import {
  createCuratedSolvableKlondikeDeal,
  createSeededKlondikeDeal,
  DealGeneratorVersion,
  KlondikeDeal,
  KLONDIKE_DRAW_ONE_RULESET,
  verifyDealReveal,
} from "./deal";
import {
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
} from "./shared";

export const CURATED_SOLUTION_PROOF_VERSION =
  "CURATED_SOLVABLE_REPLAY_V1" as const;

export type CompetitionStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ACTIVE"
  | "CLOSED"
  | "CANCELLED";

export type DealValidationStatus =
  | "UNVALIDATED"
  | "VERIFIED_SOLVABLE"
  | "REJECTED";

export interface DealValidationRecord {
  readonly validationId: string;
  readonly dealId: string;
  readonly dealCommitment: string;
  readonly rulesetVersion: typeof KLONDIKE_DRAW_ONE_RULESET;
  readonly dealGeneratorVersion: DealGeneratorVersion;
  readonly status: DealValidationStatus;
  readonly solverName: string;
  readonly solverVersion: string;
  readonly validatedAtServerMs: number;
  readonly evidenceReference: string;
}

/**
 * A solver can be replaced without changing the published competition
 * contract. Only a persisted VERIFIED_SOLVABLE result may be published.
 */
export interface KlondikeDealSolver {
  readonly name: string;
  readonly version: string;
  validate(
    dealId: string,
    deal: Readonly<KlondikeDeal>,
  ): Promise<Readonly<DealValidationRecord>>;
}

export interface RankedCompetitionContract {
  readonly competitionId: string;
  readonly name: string;
  readonly mode: "NONCASH_RANKED";
  readonly status: CompetitionStatus;
  readonly rulesetVersion: typeof KLONDIKE_DRAW_ONE_RULESET;
  readonly dealId: string;
  readonly dealCommitment: string;
  readonly dealGeneratorVersion: DealGeneratorVersion;
  readonly validation: Readonly<DealValidationRecord>;
  readonly opensAtServerMs: number;
  readonly closesAtServerMs: number;
  readonly publishedAtServerMs: number | null;
  readonly activatedAtServerMs: number | null;
  readonly closedAtServerMs: number | null;
  readonly seedReveal: string | null;
  readonly contractVersion: 1;
}

export interface CompetitionEntry {
  readonly entryId: string;
  readonly competitionId: string;
  readonly userId: string;
  readonly dealId: string;
  readonly dealCommitment: string;
  readonly dealGeneratorVersion: DealGeneratorVersion;
  readonly rulesetVersion: typeof KLONDIKE_DRAW_ONE_RULESET;
  readonly enteredAtServerMs: number;
  readonly entryCost: 0;
  readonly valuablePrize: false;
}

export function createDealValidationRecord(
  input: DealValidationRecord,
): Readonly<DealValidationRecord> {
  requireNonEmpty(input.validationId, "validationId");
  requireNonEmpty(input.dealId, "dealId");
  if (!/^[a-f0-9]{64}$/.test(input.dealCommitment)) {
    throw new DomainError(
      "INVALID_DEAL_COMMITMENT",
      "Validation requires a lowercase SHA-256 deal commitment",
    );
  }
  requireNonEmpty(input.solverName, "solverName");
  requireNonEmpty(input.solverVersion, "solverVersion");
  requireNonEmpty(input.evidenceReference, "evidenceReference");
  requireNonNegativeInteger(
    input.validatedAtServerMs,
    "validatedAtServerMs",
  );
  return deepFreeze({ ...input });
}

export function createDraftCompetition(input: {
  readonly competitionId: string;
  readonly name: string;
  readonly dealId: string;
  readonly dealCommitment: string;
  readonly validation: Readonly<DealValidationRecord>;
  readonly dealGeneratorVersion?: DealGeneratorVersion;
  readonly opensAtServerMs: number;
  readonly closesAtServerMs: number;
}): Readonly<RankedCompetitionContract> {
  requireNonEmpty(input.competitionId, "competitionId");
  requireNonEmpty(input.name, "name");
  requireNonEmpty(input.dealId, "dealId");
  requireNonEmpty(input.dealCommitment, "dealCommitment");
  requireNonNegativeInteger(input.opensAtServerMs, "opensAtServerMs");
  requireNonNegativeInteger(input.closesAtServerMs, "closesAtServerMs");
  if (input.closesAtServerMs <= input.opensAtServerMs) {
    throw new DomainError(
      "INVALID_COMPETITION_WINDOW",
      "Competition close must be after open",
    );
  }
  if (
    input.validation.dealId !== input.dealId ||
    input.validation.dealCommitment !== input.dealCommitment
  ) {
    throw new DomainError(
      "VALIDATION_DEAL_MISMATCH",
      "Validation belongs to another deal",
    );
  }
  if (
    input.validation.dealGeneratorVersion !==
    (input.dealGeneratorVersion ?? "SHA256_FISHER_YATES_V1")
  ) {
    throw new DomainError(
      "VALIDATION_DEAL_MISMATCH",
      "Validation generator does not match the deal generator",
    );
  }

  return deepFreeze({
    competitionId: input.competitionId,
    name: input.name,
    mode: "NONCASH_RANKED",
    status: "DRAFT",
    rulesetVersion: KLONDIKE_DRAW_ONE_RULESET,
    dealGeneratorVersion:
      input.dealGeneratorVersion ?? "SHA256_FISHER_YATES_V1",
    dealId: input.dealId,
    dealCommitment: input.dealCommitment,
    validation: input.validation,
    opensAtServerMs: input.opensAtServerMs,
    closesAtServerMs: input.closesAtServerMs,
    publishedAtServerMs: null,
    activatedAtServerMs: null,
    closedAtServerMs: null,
    seedReveal: null,
    contractVersion: 1,
  });
}

export function reviseDraftCompetition(
  competition: Readonly<RankedCompetitionContract>,
  revision: {
    readonly name?: string;
    readonly dealId?: string;
    readonly dealCommitment?: string;
    readonly dealGeneratorVersion?: DealGeneratorVersion;
    readonly validation?: Readonly<DealValidationRecord>;
    readonly opensAtServerMs?: number;
    readonly closesAtServerMs?: number;
  },
): Readonly<RankedCompetitionContract> {
  if (competition.status !== "DRAFT") {
    throw new DomainError(
      "COMPETITION_CONTRACT_IMMUTABLE",
      "Published or active competition contracts cannot be edited",
    );
  }

  return createDraftCompetition({
    competitionId: competition.competitionId,
    name: revision.name ?? competition.name,
    dealId: revision.dealId ?? competition.dealId,
    dealCommitment:
      revision.dealCommitment ?? competition.dealCommitment,
    dealGeneratorVersion:
      revision.dealGeneratorVersion ?? competition.dealGeneratorVersion,
    validation: revision.validation ?? competition.validation,
    opensAtServerMs:
      revision.opensAtServerMs ?? competition.opensAtServerMs,
    closesAtServerMs:
      revision.closesAtServerMs ?? competition.closesAtServerMs,
  });
}

export function publishCompetition(
  competition: Readonly<RankedCompetitionContract>,
  serverPublishedAtMs: number,
): Readonly<RankedCompetitionContract> {
  requireNonNegativeInteger(serverPublishedAtMs, "serverPublishedAtMs");
  if (competition.status !== "DRAFT") {
    throw new DomainError(
      "INVALID_COMPETITION_TRANSITION",
      "Only a draft competition can be published",
    );
  }
  if (competition.validation.status !== "VERIFIED_SOLVABLE") {
    throw new DomainError(
      "DEAL_NOT_VERIFIED_SOLVABLE",
      "Ranked competition deal must be verified solvable",
    );
  }
  if (
    competition.dealGeneratorVersion !== "CURATED_SOLVABLE_V1" ||
    competition.validation.solverName !==
      CURATED_SOLUTION_PROOF_VERSION ||
    !/^sha256:[a-f0-9]{64}$/.test(
      competition.validation.evidenceReference,
    )
  ) {
    throw new DomainError(
      "RANKED_DEAL_PROOF_REQUIRED",
      "This release publishes only curated deals with replay proof",
    );
  }
  if (
    competition.validation.dealId !== competition.dealId ||
    competition.validation.dealCommitment !==
      competition.dealCommitment ||
    competition.validation.rulesetVersion !== competition.rulesetVersion ||
    competition.validation.dealGeneratorVersion !==
      competition.dealGeneratorVersion
  ) {
    throw new DomainError(
      "VALIDATION_DEAL_MISMATCH",
      "Deal validation does not match the contract",
    );
  }
  if (
    competition.validation.validatedAtServerMs >
    serverPublishedAtMs
  ) {
    throw new DomainError(
      "DEAL_VALIDATION_NOT_COMPLETE",
      "Deal validation must complete before publication",
    );
  }
  if (serverPublishedAtMs >= competition.opensAtServerMs) {
    throw new DomainError(
      "LATE_PUBLICATION",
      "Deal commitment must be published before competition opens",
    );
  }

  return deepFreeze({
    ...competition,
    status: "PUBLISHED",
    publishedAtServerMs: serverPublishedAtMs,
  });
}

export function activateCompetition(
  competition: Readonly<RankedCompetitionContract>,
  serverActivatedAtMs: number,
): Readonly<RankedCompetitionContract> {
  requireNonNegativeInteger(serverActivatedAtMs, "serverActivatedAtMs");
  if (competition.status !== "PUBLISHED") {
    throw new DomainError(
      "INVALID_COMPETITION_TRANSITION",
      "Only a published competition can become active",
    );
  }
  if (
    serverActivatedAtMs < competition.opensAtServerMs ||
    serverActivatedAtMs >= competition.closesAtServerMs
  ) {
    throw new DomainError(
      "OUTSIDE_COMPETITION_WINDOW",
      "Competition can only activate in its published window",
    );
  }

  return deepFreeze({
    ...competition,
    status: "ACTIVE",
    activatedAtServerMs: serverActivatedAtMs,
  });
}

export function closeCompetitionAndRevealSeed(
  competition: Readonly<RankedCompetitionContract>,
  input: {
    readonly seed: string;
    readonly serverClosedAtMs: number;
  },
): Readonly<RankedCompetitionContract> {
  requireNonNegativeInteger(input.serverClosedAtMs, "serverClosedAtMs");
  if (competition.status !== "ACTIVE") {
    throw new DomainError(
      "INVALID_COMPETITION_TRANSITION",
      "Only an active competition can close",
    );
  }
  if (input.serverClosedAtMs < competition.closesAtServerMs) {
    throw new DomainError(
      "EARLY_SEED_REVEAL",
      "Seed cannot be revealed before the competition closes",
    );
  }
  if (
    !verifyDealReveal({
      seed: input.seed,
      commitment: competition.dealCommitment,
      rulesetVersion: competition.rulesetVersion,
      generatorVersion: competition.dealGeneratorVersion,
    })
  ) {
    throw new DomainError(
      "DEAL_REVEAL_MISMATCH",
      "Revealed seed does not match the published commitment",
    );
  }

  return deepFreeze({
    ...competition,
    status: "CLOSED",
    closedAtServerMs: input.serverClosedAtMs,
    seedReveal: input.seed,
  });
}

export function enterNoncashCompetition(
  competition: Readonly<RankedCompetitionContract>,
  input: {
    readonly entryId: string;
    readonly userId: string;
    readonly enteredAtServerMs: number;
  },
): Readonly<CompetitionEntry> {
  requireNonNegativeInteger(input.enteredAtServerMs, "enteredAtServerMs");
  if (
    competition.status !== "ACTIVE" ||
    input.enteredAtServerMs < competition.opensAtServerMs ||
    input.enteredAtServerMs >= competition.closesAtServerMs
  ) {
    throw new DomainError(
      "COMPETITION_NOT_OPEN",
      "Competition is not open for entry",
    );
  }

  return deepFreeze({
    entryId: requireNonEmpty(input.entryId, "entryId"),
    competitionId: competition.competitionId,
    userId: requireNonEmpty(input.userId, "userId"),
    dealId: competition.dealId,
    dealCommitment: competition.dealCommitment,
    dealGeneratorVersion: competition.dealGeneratorVersion,
    rulesetVersion: competition.rulesetVersion,
    enteredAtServerMs: input.enteredAtServerMs,
    entryCost: 0,
    valuablePrize: false,
  });
}

export function reproduceCompetitionDeal(
  competition: Readonly<RankedCompetitionContract>,
): Readonly<KlondikeDeal> {
  if (competition.status !== "CLOSED" || competition.seedReveal === null) {
    throw new DomainError(
      "SEED_NOT_REVEALED",
      "Competition seed is unavailable until close",
    );
  }
  const deal =
    competition.dealGeneratorVersion === "CURATED_SOLVABLE_V1"
      ? createCuratedSolvableKlondikeDeal(competition.seedReveal)
      : createSeededKlondikeDeal(competition.seedReveal);
  if (deal.commitment !== competition.dealCommitment) {
    throw new DomainError(
      "DEAL_REVEAL_MISMATCH",
      "Reproduced deal does not match the competition commitment",
    );
  }
  return deal;
}
