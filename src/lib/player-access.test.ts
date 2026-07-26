import { describe, expect, it } from "vitest";

import type { DemoSelfExclusion, DemoUser } from "./demo-store";
import { evaluateDemoPlayerAccess } from "./player-access";

const now = Date.UTC(2026, 6, 26);

function user(
  overrides: Partial<DemoUser> = {},
): DemoUser {
  return {
    id: "user-1",
    email: "player@example.test",
    displayName: "Player",
    passwordHash: "unused-in-policy-test",
    status: "ACTIVE",
    createdAt: new Date(now - 10_000).toISOString(),
    acceptedPlayCoinTermsVersion: "PLAY_COIN_TERMS_V1_2026_07_26",
    acceptedPlayCoinTermsAt: new Date(now - 10_000).toISOString(),
    adminRoles: [],
    ...overrides,
  };
}

function exclusion(
  overrides: Partial<DemoSelfExclusion> = {},
): DemoSelfExclusion {
  return {
    id: "exclusion-1",
    userId: "user-1",
    scope: "ALL_PRODUCTS",
    startsAt: new Date(now - 1_000).toISOString(),
    endsAt: new Date(now + 10_000).toISOString(),
    permanent: false,
    removalPolicy: "COMPLIANCE_REVIEW_ONLY",
    ...overrides,
  };
}

describe("central demo player restriction policy", () => {
  it("does not let Casino-only exclusion block Monetaire", () => {
    const exclusions = [exclusion({ scope: "CASINO" })];

    expect(
      evaluateDemoPlayerAccess({
        user: user(),
        mode: "MONETAIRE_PLAY",
        exclusions,
        serverAtMs: now,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateDemoPlayerAccess({
        user: user(),
        mode: "REAL_MONEY_CASINO",
        exclusions,
        serverAtMs: now,
      }).reasonCodes,
    ).toContain("SELF_EXCLUDED");
  });

  it("allows an expired cooldown but blocks active or malformed cooldowns", () => {
    expect(
      evaluateDemoPlayerAccess({
        user: user({
          status: "COOLDOWN",
          cooldownUntil: new Date(now - 1).toISOString(),
        }),
        mode: "MONETAIRE_PLAY",
        exclusions: [],
        serverAtMs: now,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateDemoPlayerAccess({
        user: user({
          status: "COOLDOWN",
          cooldownUntil: new Date(now + 1).toISOString(),
        }),
        mode: "MONETAIRE_PLAY",
        exclusions: [],
        serverAtMs: now,
      }).reasonCodes,
    ).toContain("ACCOUNT_COOLDOWN");
    expect(
      evaluateDemoPlayerAccess({
        user: user({ status: "COOLDOWN", cooldownUntil: undefined }),
        mode: "MONETAIRE_PLAY",
        exclusions: [],
        serverAtMs: now,
      }).reasonCodes,
    ).toContain("ACCOUNT_COOLDOWN");
  });

  it("includes account status and fails closed for incomplete restriction state", () => {
    const closed = evaluateDemoPlayerAccess({
      user: user({ status: "CLOSED" }),
      mode: "MONETAIRE_PLAY",
      exclusions: [],
      serverAtMs: now,
    });
    expect(closed.accountStatus).toBe("CLOSED");
    expect(closed.reasonCodes).toContain("ACCOUNT_CLOSED");

    const incomplete = evaluateDemoPlayerAccess({
      user: user({ status: "SELF_EXCLUDED" }),
      mode: "MONETAIRE_PLAY",
      exclusions: [],
      serverAtMs: now,
    });
    expect(incomplete.allowed).toBe(false);
    expect(incomplete.reasonCodes).toContain(
      "RESTRICTION_STATE_INCOMPLETE",
    );
  });

  it("ignores expired and future exclusions", () => {
    const exclusions = [
      exclusion({ endsAt: new Date(now - 1).toISOString() }),
      exclusion({
        id: "future",
        startsAt: new Date(now + 1).toISOString(),
      }),
    ];
    expect(
      evaluateDemoPlayerAccess({
        user: user({ status: "SELF_EXCLUDED" }),
        mode: "MONETAIRE_PLAY",
        exclusions,
        serverAtMs: now,
      }).allowed,
    ).toBe(true);
  });
});
