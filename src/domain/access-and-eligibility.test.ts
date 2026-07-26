import { describe, expect, it } from "vitest";

import {
  changeFeatureGateAsAdmin,
  createInitialFeatureGates,
  createJurisdictionRuleSet,
  decideProductAccess,
  JurisdictionModeRule,
} from "./access-policy";
import { createAdminAuditLog } from "./admin-audit";
import {
  CASINO_CHECKS,
  CheckResult,
  createIndependentEligibilityState,
  isCasinoEligible,
  isSkillPrizeEligible,
  recordCasinoEligibilityDecision,
  recordSkillPrizeEligibilityDecision,
  SKILL_PRIZE_CHECKS,
} from "./eligibility";
import { ProductMode } from "./product-modes";
import { createSelfExclusion } from "./responsible-play";

function passingChecks<T extends string>(
  checks: readonly T[],
): Record<T, CheckResult> {
  return Object.fromEntries(
    checks.map((check) => [check, "PASS"]),
  ) as Record<T, CheckResult>;
}

function modeRules(): Record<ProductMode, JurisdictionModeRule> {
  return {
    MONETAIRE_PLAY: {
      mode: "MONETAIRE_PLAY",
      enabled: true,
      minimumAge: 18,
    },
    MONETAIRE_PRIZE: {
      mode: "MONETAIRE_PRIZE",
      enabled: true,
      minimumAge: 21,
    },
    SOCIAL_CASINO: {
      mode: "SOCIAL_CASINO",
      enabled: true,
      minimumAge: 21,
    },
    REAL_MONEY_CASINO: {
      mode: "REAL_MONEY_CASINO",
      enabled: true,
      minimumAge: 21,
    },
  };
}

function accessFixture() {
  const eligibility = createIndependentEligibilityState("user-1");
  const jurisdictionRules = createJurisdictionRuleSet({
    version: "rules-v1",
    rules: [
      {
        jurisdictionCode: "US-TEST",
        active: true,
        modes: modeRules(),
        prohibitedResidenceCodes: [],
      },
    ],
  });
  return {
    decisionId: "decision-1",
    userId: "user-1",
    mode: "MONETAIRE_PLAY" as ProductMode,
    decidedAtServerMs: 10_000,
    identityStatus: "AUTHENTICATED" as const,
    ageStatus: "VERIFIED" as const,
    ageYears: 30,
    physicalLocation: {
      userId: "user-1",
      status: "VERIFIED" as const,
      source: "APPROVED_SERVER_GEOLOCATION_PROVIDER" as const,
      jurisdictionCode: "US-TEST",
      observedAtServerMs: 9_900,
    },
    maximumLocationAgeMs: 60_000,
    declaredResidenceCode: "US-TEST",
    requestedJurisdictionRulesVersion: "rules-v1",
    jurisdictionRules,
    featureGates: createInitialFeatureGates({
      gateVersion: "rules-v1",
      configuredAtServerMs: 1,
    }),
    eligibility,
    accountRestrictions: [],
    selfExclusions: [],
    rulesAcceptance: {
      userId: "user-1",
      accepted: true,
      productMode: "MONETAIRE_PLAY" as ProductMode,
      jurisdictionRulesVersion: "rules-v1",
      termsVersion: "play-terms-v1",
    },
  };
}

describe("independent eligibility", () => {
  it("does not let Skill Prize approval grant Casino approval", () => {
    const initial = createIndependentEligibilityState("user-1");
    const skillApproved = recordSkillPrizeEligibilityDecision(initial, {
      decisionId: "skill-decision",
      status: "APPROVED",
      rulesVersion: "skill-v1",
      decidedAtServerMs: 1_000,
      expiresAtServerMs: 10_000,
      checks: passingChecks(SKILL_PRIZE_CHECKS),
    });

    expect(isSkillPrizeEligible(skillApproved, 2_000)).toBe(true);
    expect(isCasinoEligible(skillApproved, 2_000)).toBe(false);
    expect(skillApproved.casino).toBe(initial.casino);

    const bothApproved = recordCasinoEligibilityDecision(skillApproved, {
      decisionId: "casino-decision",
      status: "APPROVED",
      rulesVersion: "casino-v1",
      decidedAtServerMs: 1_100,
      expiresAtServerMs: 10_000,
      checks: passingChecks(CASINO_CHECKS),
    });
    expect(isCasinoEligible(bothApproved, 2_000)).toBe(true);
    expect(bothApproved.skillPrize).toBe(skillApproved.skillPrize);
  });

  it("refuses approval when any required check is incomplete", () => {
    const checks = passingChecks(SKILL_PRIZE_CHECKS);
    checks.SANCTIONS = "NOT_CHECKED";
    expect(() =>
      recordSkillPrizeEligibilityDecision(
        createIndependentEligibilityState("user"),
        {
          decisionId: "bad-approval",
          status: "APPROVED",
          rulesVersion: "v1",
          decidedAtServerMs: 1,
          expiresAtServerMs: null,
          checks,
        },
      ),
    ).toThrowError(/every eligibility check/i);
  });
});

describe("fail-closed access policy", () => {
  it("allows configured Monetaire Play only with complete server evidence", () => {
    const decision = decideProductAccess(accessFixture());
    expect(decision.allowed).toBe(true);
    expect(decision.denialCodes).toEqual([]);
  });

  it("does not accept a client-declared location as geolocation proof", () => {
    const fixture = accessFixture();
    const decision = decideProductAccess({
      ...fixture,
      physicalLocation: {
        ...fixture.physicalLocation,
        source: "CLIENT_DECLARATION",
      },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.denialCodes).toContain(
      "LOCATION_NOT_SERVER_VERIFIED",
    );
  });

  it("fails closed for stale evidence and unconfigured jurisdictions", () => {
    const fixture = accessFixture();
    const stale = decideProductAccess({
      ...fixture,
      physicalLocation: {
        ...fixture.physicalLocation,
        observedAtServerMs: 1,
      },
      maximumLocationAgeMs: 100,
    });
    expect(stale.allowed).toBe(false);
    expect(stale.denialCodes).toContain(
      "LOCATION_NOT_SERVER_VERIFIED",
    );

    const unknown = decideProductAccess({
      ...fixture,
      physicalLocation: {
        ...fixture.physicalLocation,
        jurisdictionCode: "US-UNKNOWN",
      },
    });
    expect(unknown.allowed).toBe(false);
    expect(unknown.denialCodes).toContain(
      "JURISDICTION_NOT_CONFIGURED",
    );
    expect(unknown.denialCodes).toContain(
      "MODE_NOT_ALLOWED_IN_JURISDICTION",
    );
  });

  it("keeps Prize and Casino modes on compiled and feature holds", () => {
    const fixture = accessFixture();
    for (const mode of [
      "MONETAIRE_PRIZE",
      "SOCIAL_CASINO",
      "REAL_MONEY_CASINO",
    ] as const) {
      const forgedGates = {
        ...fixture.featureGates,
        [mode]: {
          ...fixture.featureGates[mode],
          enabled: true,
        },
      };
      const decision = decideProductAccess({
        ...fixture,
        decisionId: `decision-${mode}`,
        mode,
        identityStatus: "VERIFIED",
        featureGates: forgedGates,
        rulesAcceptance: {
          ...fixture.rulesAcceptance,
          productMode: mode,
        },
      });
      expect(decision.allowed).toBe(false);
      expect(decision.denialCodes).toContain("RELEASE_HOLD");
    }
  });

  it("blocks a self-excluded user in the recorded scope", () => {
    const fixture = accessFixture();
    const exclusion = createSelfExclusion({
      exclusionId: "exclude-1",
      userId: "user-1",
      scope: "ALL_PRODUCTS",
      startsAtServerMs: 9_000,
      endsAtServerMs: null,
      recordedBy: { type: "USER", userId: "user-1" },
      reason: "User requested indefinite exclusion",
    });
    const decision = decideProductAccess({
      ...fixture,
      selfExclusions: [exclusion],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.denialCodes).toContain("SELF_EXCLUDED");
    expect(() =>
      createSelfExclusion({
        exclusionId: "support-exclude",
        userId: "user-1",
        scope: "ALL_PRODUCTS",
        startsAtServerMs: 9_000,
        endsAtServerMs: null,
        recordedBy: {
          type: "ADMIN",
          actorId: "support-1",
          role: "SUPPORT",
        },
        reason: "Support cannot control exclusion",
      }),
    ).toThrowError(/ordinary support/i);
  });

  it("does not let an administrator enable a held mode", () => {
    const fixture = accessFixture();
    expect(() =>
      changeFeatureGateAsAdmin({
        gates: fixture.featureGates,
        auditLog: createAdminAuditLog(),
        mode: "REAL_MONEY_CASINO",
        enabled: true,
        gateVersion: "rules-v1",
        auditId: "gate-audit",
        actor: { actorId: "admin", role: "SUPER_ADMIN" },
        serverRecordedAtMs: 10,
        reason: "Attempted held-mode activation",
      }),
    ).toThrowError(/cannot enable/i);
  });
});
