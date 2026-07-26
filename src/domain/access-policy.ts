import {
  AdminActor,
  AdminAuditLog,
  appendAdminAuditEvent,
} from "./admin-audit";
import {
  IndependentEligibilityState,
  isCasinoEligible,
  isSkillPrizeEligible,
} from "./eligibility";
import { PRODUCT_MODES, ProductMode } from "./product-modes";
import {
  AccountRestriction,
  hasActiveAccountRestriction,
  isSelfExcludedFromMode,
  SelfExclusion,
} from "./responsible-play";
import {
  deepFreeze,
  DomainError,
  requireNonEmpty,
  requireNonNegativeInteger,
} from "./shared";

export interface FeatureGate {
  readonly mode: ProductMode;
  readonly enabled: boolean;
  readonly gateVersion: string;
  readonly updatedAtServerMs: number;
}

export type FeatureGateSnapshot = Readonly<
  Record<ProductMode, Readonly<FeatureGate>>
>;

export interface JurisdictionModeRule {
  readonly mode: ProductMode;
  readonly enabled: boolean;
  readonly minimumAge: number;
}

export interface JurisdictionRule {
  readonly jurisdictionCode: string;
  readonly active: boolean;
  readonly modes: Readonly<Record<ProductMode, JurisdictionModeRule>>;
  readonly prohibitedResidenceCodes: readonly string[];
}

export interface JurisdictionRuleSet {
  readonly version: string;
  readonly rules: readonly Readonly<JurisdictionRule>[];
}

export interface PhysicalLocationEvidence {
  readonly userId: string;
  readonly status: "VERIFIED" | "UNVERIFIED" | "FAILED";
  readonly source:
    | "APPROVED_SERVER_GEOLOCATION_PROVIDER"
    | "CLIENT_DECLARATION";
  readonly jurisdictionCode: string | null;
  readonly observedAtServerMs: number;
}

export interface RulesAcceptance {
  readonly userId: string;
  readonly accepted: boolean;
  readonly productMode: ProductMode;
  readonly jurisdictionRulesVersion: string;
  readonly termsVersion: string;
}

export type AccessDenialCode =
  | "RELEASE_HOLD"
  | "FEATURE_DISABLED"
  | "RULES_VERSION_MISMATCH"
  | "LOCATION_NOT_SERVER_VERIFIED"
  | "JURISDICTION_NOT_CONFIGURED"
  | "MODE_NOT_ALLOWED_IN_JURISDICTION"
  | "RESIDENCE_NOT_ALLOWED"
  | "IDENTITY_NOT_SUFFICIENT"
  | "AGE_NOT_VERIFIED"
  | "AGE_BELOW_MINIMUM"
  | "SKILL_PRIZE_NOT_ELIGIBLE"
  | "CASINO_NOT_ELIGIBLE"
  | "ACCOUNT_RESTRICTED"
  | "SELF_EXCLUDED"
  | "RULES_NOT_ACCEPTED";

export interface ProductAccessDecision {
  readonly decisionId: string;
  readonly userId: string;
  readonly mode: ProductMode;
  readonly allowed: boolean;
  readonly denialCodes: readonly AccessDenialCode[];
  readonly jurisdictionRulesVersion: string;
  readonly physicalJurisdictionCode: string | null;
  readonly decidedAtServerMs: number;
}

const CURRENT_RELEASE_ENABLED_MODES: readonly ProductMode[] = deepFreeze([
  "MONETAIRE_PLAY",
]);

export function createInitialFeatureGates(input: {
  readonly gateVersion: string;
  readonly configuredAtServerMs: number;
}): FeatureGateSnapshot {
  const gateVersion = requireNonEmpty(input.gateVersion, "gateVersion");
  requireNonNegativeInteger(
    input.configuredAtServerMs,
    "configuredAtServerMs",
  );

  return deepFreeze(
    Object.fromEntries(
      PRODUCT_MODES.map((mode) => [
        mode,
        {
          mode,
          enabled: mode === "MONETAIRE_PLAY",
          gateVersion,
          updatedAtServerMs: input.configuredAtServerMs,
        },
      ]),
    ) as Record<ProductMode, FeatureGate>,
  );
}

/**
 * This release can disable any mode but cannot enable a legally held mode.
 * A later reviewed release must deliberately change the compiled hold.
 */
export function changeFeatureGateAsAdmin(input: {
  readonly gates: FeatureGateSnapshot;
  readonly auditLog: Readonly<AdminAuditLog>;
  readonly mode: ProductMode;
  readonly enabled: boolean;
  readonly gateVersion: string;
  readonly auditId: string;
  readonly actor: Readonly<AdminActor>;
  readonly serverRecordedAtMs: number;
  readonly reason: string;
}): {
  readonly gates: FeatureGateSnapshot;
  readonly auditLog: Readonly<AdminAuditLog>;
} {
  if (
    input.enabled &&
    !CURRENT_RELEASE_ENABLED_MODES.includes(input.mode)
  ) {
    throw new DomainError(
      "MODE_ON_LEGAL_HOLD",
      "This release cannot enable Prize or Casino modes",
    );
  }
  const before = input.gates[input.mode];
  if (before === undefined) {
    throw new DomainError(
      "FEATURE_GATE_MISSING",
      "Missing feature gate fails closed",
    );
  }
  const after = deepFreeze({
    mode: input.mode,
    enabled: input.enabled,
    gateVersion: requireNonEmpty(input.gateVersion, "gateVersion"),
    updatedAtServerMs: input.serverRecordedAtMs,
  });
  const audit = appendAdminAuditEvent(input.auditLog, {
    auditId: input.auditId,
    actionType: "FEATURE_GATE_CHANGE",
    actor: input.actor,
    serverRecordedAtMs: input.serverRecordedAtMs,
    reason: input.reason,
    subjectType: "FEATURE_GATE",
    subjectId: input.mode,
    beforeState: before,
    afterState: after,
  });

  return deepFreeze({
    gates: { ...input.gates, [input.mode]: after },
    auditLog: audit.log,
  });
}

export function createJurisdictionRuleSet(input: {
  readonly version: string;
  readonly rules: readonly Readonly<JurisdictionRule>[];
}): Readonly<JurisdictionRuleSet> {
  const version = requireNonEmpty(input.version, "version");
  const seen = new Set<string>();

  for (const rule of input.rules) {
    const jurisdictionCode = requireNonEmpty(
      rule.jurisdictionCode,
      "jurisdictionCode",
    ).toUpperCase();
    if (seen.has(jurisdictionCode)) {
      throw new DomainError(
        "DUPLICATE_JURISDICTION_RULE",
        "Jurisdiction rules must be unique",
      );
    }
    seen.add(jurisdictionCode);
    for (const mode of PRODUCT_MODES) {
      const modeRule = rule.modes[mode];
      if (
        modeRule === undefined ||
        modeRule.mode !== mode ||
        !Number.isSafeInteger(modeRule.minimumAge) ||
        modeRule.minimumAge < 0
      ) {
        throw new DomainError(
          "INVALID_JURISDICTION_RULE",
          `Jurisdiction rule is incomplete for ${mode}`,
        );
      }
    }
  }

  return deepFreeze({
    version,
    rules: input.rules.map((rule) => ({
      ...rule,
      jurisdictionCode: rule.jurisdictionCode.toUpperCase(),
      prohibitedResidenceCodes: rule.prohibitedResidenceCodes.map((code) =>
        code.toUpperCase(),
      ),
    })),
  });
}

function addDenial(
  denials: AccessDenialCode[],
  denial: AccessDenialCode,
): void {
  if (!denials.includes(denial)) {
    denials.push(denial);
  }
}

/**
 * Single server-side decision point for every product session. Missing,
 * client-declared, stale, disabled, restricted, or unverified inputs deny.
 */
export function decideProductAccess(input: {
  readonly decisionId: string;
  readonly userId: string;
  readonly mode: ProductMode;
  readonly decidedAtServerMs: number;
  readonly identityStatus:
    | "UNVERIFIED"
    | "AUTHENTICATED"
    | "VERIFIED";
  readonly ageStatus: "UNVERIFIED" | "VERIFIED";
  readonly ageYears: number | null;
  readonly physicalLocation: Readonly<PhysicalLocationEvidence>;
  readonly maximumLocationAgeMs: number;
  readonly declaredResidenceCode: string;
  readonly requestedJurisdictionRulesVersion: string;
  readonly jurisdictionRules: Readonly<JurisdictionRuleSet>;
  readonly featureGates: FeatureGateSnapshot;
  readonly eligibility: Readonly<IndependentEligibilityState>;
  readonly accountRestrictions: readonly Readonly<AccountRestriction>[];
  readonly selfExclusions: readonly Readonly<SelfExclusion>[];
  readonly rulesAcceptance: Readonly<RulesAcceptance>;
}): Readonly<ProductAccessDecision> {
  const decisionId = requireNonEmpty(input.decisionId, "decisionId");
  const userId = requireNonEmpty(input.userId, "userId");
  requireNonNegativeInteger(
    input.decidedAtServerMs,
    "decidedAtServerMs",
  );
  const denials: AccessDenialCode[] = [];
  const maximumLocationAgeValid =
    Number.isSafeInteger(input.maximumLocationAgeMs) &&
    input.maximumLocationAgeMs > 0;

  if (!CURRENT_RELEASE_ENABLED_MODES.includes(input.mode)) {
    addDenial(denials, "RELEASE_HOLD");
  }

  const gate = input.featureGates?.[input.mode];
  if (gate === undefined || !gate.enabled) {
    addDenial(denials, "FEATURE_DISABLED");
  }

  if (
    input.requestedJurisdictionRulesVersion !==
    input.jurisdictionRules?.version
  ) {
    addDenial(denials, "RULES_VERSION_MISMATCH");
  }

  const serverVerifiedLocation =
    input.physicalLocation?.status === "VERIFIED" &&
    input.physicalLocation.userId === userId &&
    input.physicalLocation.source ===
      "APPROVED_SERVER_GEOLOCATION_PROVIDER" &&
    typeof input.physicalLocation.jurisdictionCode === "string" &&
    input.physicalLocation.jurisdictionCode.length > 0 &&
    input.physicalLocation.observedAtServerMs <= input.decidedAtServerMs &&
    maximumLocationAgeValid &&
    input.decidedAtServerMs -
      input.physicalLocation.observedAtServerMs <=
      input.maximumLocationAgeMs;
  if (!serverVerifiedLocation) {
    addDenial(denials, "LOCATION_NOT_SERVER_VERIFIED");
  }

  const physicalCode = serverVerifiedLocation
    ? input.physicalLocation.jurisdictionCode!.toUpperCase()
    : null;
  const jurisdictionRule =
    physicalCode === null
      ? undefined
      : input.jurisdictionRules?.rules.find(
          (rule) =>
            rule.active && rule.jurisdictionCode === physicalCode,
        );
  if (jurisdictionRule === undefined) {
    addDenial(denials, "JURISDICTION_NOT_CONFIGURED");
  }

  const modeRule = jurisdictionRule?.modes[input.mode];
  if (modeRule === undefined || !modeRule.enabled) {
    addDenial(denials, "MODE_NOT_ALLOWED_IN_JURISDICTION");
  }

  const residence = input.declaredResidenceCode?.trim().toUpperCase();
  if (
    residence === undefined ||
    residence.length === 0 ||
    jurisdictionRule?.prohibitedResidenceCodes.includes(residence)
  ) {
    addDenial(denials, "RESIDENCE_NOT_ALLOWED");
  }

  const identitySufficient =
    input.mode === "MONETAIRE_PLAY"
      ? input.identityStatus === "AUTHENTICATED" ||
        input.identityStatus === "VERIFIED"
      : input.identityStatus === "VERIFIED";
  if (!identitySufficient) {
    addDenial(denials, "IDENTITY_NOT_SUFFICIENT");
  }

  if (
    input.ageStatus !== "VERIFIED" ||
    input.ageYears === null ||
    !Number.isSafeInteger(input.ageYears)
  ) {
    addDenial(denials, "AGE_NOT_VERIFIED");
  } else if (
    modeRule === undefined ||
    input.ageYears < modeRule.minimumAge
  ) {
    addDenial(denials, "AGE_BELOW_MINIMUM");
  }

  if (
    input.mode === "MONETAIRE_PRIZE" &&
    (input.eligibility?.userId !== userId ||
      !isSkillPrizeEligible(input.eligibility, input.decidedAtServerMs))
  ) {
    addDenial(denials, "SKILL_PRIZE_NOT_ELIGIBLE");
  }
  if (
    input.mode === "REAL_MONEY_CASINO" &&
    (input.eligibility?.userId !== userId ||
      !isCasinoEligible(input.eligibility, input.decidedAtServerMs))
  ) {
    addDenial(denials, "CASINO_NOT_ELIGIBLE");
  }

  if (
    hasActiveAccountRestriction(
      input.accountRestrictions,
      input.decidedAtServerMs,
    )
  ) {
    addDenial(denials, "ACCOUNT_RESTRICTED");
  }
  if (
    isSelfExcludedFromMode(
      input.selfExclusions.filter(
        (exclusion) => exclusion.userId === userId,
      ),
      input.mode,
      input.decidedAtServerMs,
    )
  ) {
    addDenial(denials, "SELF_EXCLUDED");
  }

  if (
    !input.rulesAcceptance?.accepted ||
    input.rulesAcceptance.userId !== userId ||
    input.rulesAcceptance.productMode !== input.mode ||
    input.rulesAcceptance.jurisdictionRulesVersion !==
      input.jurisdictionRules.version ||
    input.rulesAcceptance.termsVersion.trim().length === 0
  ) {
    addDenial(denials, "RULES_NOT_ACCEPTED");
  }

  return deepFreeze({
    decisionId,
    userId,
    mode: input.mode,
    allowed: denials.length === 0,
    denialCodes: denials,
    jurisdictionRulesVersion: input.jurisdictionRules.version,
    physicalJurisdictionCode: physicalCode,
    decidedAtServerMs: input.decidedAtServerMs,
  });
}
