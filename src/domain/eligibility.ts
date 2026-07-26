import {
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
} from "./shared";

export type EligibilityStatus =
  | "NOT_EVALUATED"
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "EXPIRED";

export type CheckResult = "PASS" | "FAIL" | "NOT_CHECKED";

export const SKILL_PRIZE_CHECKS = [
  "IDENTITY",
  "AGE_21_PLUS",
  "PHYSICAL_LOCATION",
  "JURISDICTION",
  "DUPLICATE_ACCOUNT",
  "PAYMENT_OWNERSHIP_WHEN_REQUIRED",
  "SANCTIONS",
  "TAX_INFORMATION",
  "CONTEST_RULES_ACCEPTED",
] as const;
export type SkillPrizeCheck = (typeof SKILL_PRIZE_CHECKS)[number];

export const CASINO_CHECKS = [
  "IDENTITY",
  "AGE_21_PLUS",
  "PRECISE_GEOLOCATION",
  "LICENSED_JURISDICTION",
  "AML",
  "SELF_EXCLUSION",
  "RESPONSIBLE_GAMING_CONTROLS",
  "LIMITS",
  "SOURCE_OF_FUNDS_WHEN_TRIGGERED",
  "CASINO_TERMS_ACCEPTED",
] as const;
export type CasinoCheck = (typeof CASINO_CHECKS)[number];

export interface SkillPrizeEligibilityDecision {
  readonly decisionType: "SKILL_PRIZE_VERIFICATION";
  readonly userId: string;
  readonly decisionId: string | null;
  readonly status: EligibilityStatus;
  readonly rulesVersion: string | null;
  readonly decidedAtServerMs: number | null;
  readonly expiresAtServerMs: number | null;
  readonly checks: Readonly<Record<SkillPrizeCheck, CheckResult>>;
}

export interface CasinoEligibilityDecision {
  readonly decisionType: "CASINO_VERIFICATION";
  readonly userId: string;
  readonly decisionId: string | null;
  readonly status: EligibilityStatus;
  readonly rulesVersion: string | null;
  readonly decidedAtServerMs: number | null;
  readonly expiresAtServerMs: number | null;
  readonly checks: Readonly<Record<CasinoCheck, CheckResult>>;
}

export interface IndependentEligibilityState {
  readonly userId: string;
  readonly skillPrize: Readonly<SkillPrizeEligibilityDecision>;
  readonly casino: Readonly<CasinoEligibilityDecision>;
}

function initialSkillChecks(): Record<SkillPrizeCheck, CheckResult> {
  return Object.fromEntries(
    SKILL_PRIZE_CHECKS.map((check) => [check, "NOT_CHECKED"]),
  ) as Record<SkillPrizeCheck, CheckResult>;
}

function initialCasinoChecks(): Record<CasinoCheck, CheckResult> {
  return Object.fromEntries(
    CASINO_CHECKS.map((check) => [check, "NOT_CHECKED"]),
  ) as Record<CasinoCheck, CheckResult>;
}

export function createIndependentEligibilityState(
  userIdInput: string,
): Readonly<IndependentEligibilityState> {
  const userId = requireNonEmpty(userIdInput, "userId");
  return deepFreeze({
    userId,
    skillPrize: {
      decisionType: "SKILL_PRIZE_VERIFICATION",
      userId,
      decisionId: null,
      status: "NOT_EVALUATED",
      rulesVersion: null,
      decidedAtServerMs: null,
      expiresAtServerMs: null,
      checks: initialSkillChecks(),
    },
    casino: {
      decisionType: "CASINO_VERIFICATION",
      userId,
      decisionId: null,
      status: "NOT_EVALUATED",
      rulesVersion: null,
      decidedAtServerMs: null,
      expiresAtServerMs: null,
      checks: initialCasinoChecks(),
    },
  });
}

function validateDecisionTiming(
  decidedAtServerMs: number,
  expiresAtServerMs: number | null,
): void {
  requireNonNegativeInteger(decidedAtServerMs, "decidedAtServerMs");
  if (expiresAtServerMs !== null) {
    requireNonNegativeInteger(expiresAtServerMs, "expiresAtServerMs");
    if (expiresAtServerMs <= decidedAtServerMs) {
      throw new DomainError(
        "INVALID_ELIGIBILITY_EXPIRY",
        "Eligibility expiry must be after decision time",
      );
    }
  }
}

function approvedOnlyWhenAllPass<TCheck extends string>(
  status: EligibilityStatus,
  checks: Readonly<Record<TCheck, CheckResult>>,
  requiredChecks: readonly TCheck[],
): void {
  if (
    status === "APPROVED" &&
    requiredChecks.some((check) => checks[check] !== "PASS")
  ) {
    throw new DomainError(
      "INCOMPLETE_ELIGIBILITY_CHECKS",
      "Approval requires every eligibility check to pass",
    );
  }
}

export function recordSkillPrizeEligibilityDecision(
  state: Readonly<IndependentEligibilityState>,
  input: {
    readonly decisionId: string;
    readonly status: Exclude<EligibilityStatus, "NOT_EVALUATED">;
    readonly rulesVersion: string;
    readonly decidedAtServerMs: number;
    readonly expiresAtServerMs: number | null;
    readonly checks: Readonly<Record<SkillPrizeCheck, CheckResult>>;
  },
): Readonly<IndependentEligibilityState> {
  validateDecisionTiming(input.decidedAtServerMs, input.expiresAtServerMs);
  approvedOnlyWhenAllPass(
    input.status,
    input.checks,
    SKILL_PRIZE_CHECKS,
  );
  const skillPrize = deepFreeze({
    decisionType: "SKILL_PRIZE_VERIFICATION" as const,
    userId: state.userId,
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    status: input.status,
    rulesVersion: requireNonEmpty(input.rulesVersion, "rulesVersion"),
    decidedAtServerMs: input.decidedAtServerMs,
    expiresAtServerMs: input.expiresAtServerMs,
    checks: { ...input.checks },
  });

  // The Casino decision is deliberately copied unchanged.
  return deepFreeze({ ...state, skillPrize });
}

export function recordCasinoEligibilityDecision(
  state: Readonly<IndependentEligibilityState>,
  input: {
    readonly decisionId: string;
    readonly status: Exclude<EligibilityStatus, "NOT_EVALUATED">;
    readonly rulesVersion: string;
    readonly decidedAtServerMs: number;
    readonly expiresAtServerMs: number | null;
    readonly checks: Readonly<Record<CasinoCheck, CheckResult>>;
  },
): Readonly<IndependentEligibilityState> {
  validateDecisionTiming(input.decidedAtServerMs, input.expiresAtServerMs);
  approvedOnlyWhenAllPass(input.status, input.checks, CASINO_CHECKS);
  const casino = deepFreeze({
    decisionType: "CASINO_VERIFICATION" as const,
    userId: state.userId,
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    status: input.status,
    rulesVersion: requireNonEmpty(input.rulesVersion, "rulesVersion"),
    decidedAtServerMs: input.decidedAtServerMs,
    expiresAtServerMs: input.expiresAtServerMs,
    checks: { ...input.checks },
  });

  // The Skill Prize decision is deliberately copied unchanged.
  return deepFreeze({ ...state, casino });
}

function currentlyApproved(
  decision: {
    readonly status: EligibilityStatus;
    readonly expiresAtServerMs: number | null;
    readonly checks: Readonly<Record<string, CheckResult>>;
  },
  serverAtMs: number,
  requiredChecks: readonly string[],
): boolean {
  requireNonNegativeInteger(serverAtMs, "serverAtMs");
  return (
    decision.status === "APPROVED" &&
    requiredChecks.every((check) => decision.checks[check] === "PASS") &&
    (decision.expiresAtServerMs === null ||
      serverAtMs < decision.expiresAtServerMs)
  );
}

export function isSkillPrizeEligible(
  state: Readonly<IndependentEligibilityState>,
  serverAtMs: number,
): boolean {
  return (
    state.skillPrize.userId === state.userId &&
    currentlyApproved(
      state.skillPrize,
      serverAtMs,
      SKILL_PRIZE_CHECKS,
    )
  );
}

export function isCasinoEligible(
  state: Readonly<IndependentEligibilityState>,
  serverAtMs: number,
): boolean {
  return (
    state.casino.userId === state.userId &&
    currentlyApproved(state.casino, serverAtMs, CASINO_CHECKS)
  );
}
