import { describe, expect, it } from "vitest";

import type { RuntimeEnv } from "./env";
import {
  initialOperationGateSnapshot,
  LEGAL_GATE_KEYS,
} from "./operation-gates";

function environment(
  overrides: Partial<RuntimeEnv> = {},
): RuntimeEnv {
  return {
    NODE_ENV: "test",
    DEMO_MODE: true,
    DATABASE_URL: undefined,
    SESSION_SECRET: "test-session-secret-at-least-32-characters",
    COMPETITION_SEED_ENCRYPTION_KEY: undefined,
    PREVIEW_OWNER_EMAIL: undefined,
    FEATURE_MONETAIRE_PRIZE: false,
    FEATURE_SOCIAL_CASINO: false,
    FEATURE_REAL_MONEY_CASINO: false,
    FEATURE_PRODUCTION_PAYMENTS: false,
    MONETAIRE_PLAY_JURISDICTIONS: ["US"],
    MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION: "",
    ...overrides,
  };
}

describe("initial legal operation gates", () => {
  it("enumerates every documented gate", () => {
    const snapshot = initialOperationGateSnapshot(environment());
    expect(Object.keys(snapshot).toSorted()).toEqual(
      [...LEGAL_GATE_KEYS].toSorted(),
    );
  });

  it("keeps every prize, social casino, and real-money operation denied", () => {
    const snapshot = initialOperationGateSnapshot(
      environment({
        FEATURE_MONETAIRE_PRIZE: true,
        FEATURE_SOCIAL_CASINO: true,
        FEATURE_REAL_MONEY_CASINO: true,
        FEATURE_PRODUCTION_PAYMENTS: true,
      }),
    );

    for (const key of LEGAL_GATE_KEYS) {
      if (
        key.startsWith("prize.") ||
        key.startsWith("casino.") ||
        key.startsWith("social_casino.") ||
        key === "mode.monetaire_prize" ||
        key === "mode.social_casino" ||
        key === "mode.real_money_casino" ||
        key === "play_coin.package.production"
      ) {
        expect(snapshot[key].decision, key).toBe("DENY");
      }
    }
  });

  it("only allows the sandbox package adapter in explicit demo mode", () => {
    expect(
      initialOperationGateSnapshot(environment())["play_coin.package.sandbox"]
        .decision,
    ).toBe("ALLOW");
    expect(
      initialOperationGateSnapshot(environment({ DEMO_MODE: false }))[
        "play_coin.package.sandbox"
      ].decision,
    ).toBe("DENY");
  });

  it("requires a request-specific jurisdiction decision outside demo mode", () => {
    expect(
      initialOperationGateSnapshot(environment({ DEMO_MODE: false }))[
        "mode.monetaire_play"
      ],
    ).toMatchObject({
      decision: "DENY",
      reason: "REQUIRES_REQUEST_JURISDICTION_DECISION",
    });
  });
});
