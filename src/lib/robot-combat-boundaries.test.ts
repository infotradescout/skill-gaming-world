import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getGameTitleByKey } from "@/domain/game-titles";
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

const HELD_LEGAL_OPERATIONS = LEGAL_GATE_KEYS.filter(
  (key) =>
    key.startsWith("prize.") ||
    key.startsWith("casino.") ||
    key.startsWith("social_casino.") ||
    key === "mode.monetaire_prize" ||
    key === "mode.social_casino" ||
    key === "mode.real_money_casino" ||
    key === "play_coin.package.production",
);

describe("SGW Robot Combat Free and Legal Play containment", () => {
  it("registers the title as Free, no-value, and not-applicable legal offering", () => {
    expect(getGameTitleByKey("SGW_ROBOT_COMBAT")).toMatchObject({
      side: "FREE",
      valueClass: "NO_VALUE",
      legalOfferingClass: "NOT_APPLICABLE",
      matchPlayAvailable: false,
    });
  });

  it("does not add robot-combat prize, wager, payout, or casino API routes", () => {
    const appRoot = resolve(process.cwd(), "src", "app");
    const robotCombatRouteFiles = [
      "app/robot-combat/page.tsx",
      "(marketing)/robot-combat/page.tsx",
    ];
    for (const relativePath of robotCombatRouteFiles) {
      const source = readFileSync(resolve(appRoot, relativePath), "utf8");
      expect(source).not.toMatch(/\/api\/(prize|casino|wager|payout|deposit|withdraw)/);
      expect(source.toLowerCase()).not.toMatch(
        /activate legal play|legal play enabled|enable legal play|start match|enter match/,
      );
      expect(source.toLowerCase()).not.toContain("battlebots");
    }
  });

  it("keeps every held Legal Play operation denied after catalog registration", () => {
    const snapshot = initialOperationGateSnapshot(
      environment({
        FEATURE_MONETAIRE_PRIZE: true,
        FEATURE_SOCIAL_CASINO: true,
        FEATURE_REAL_MONEY_CASINO: true,
        FEATURE_PRODUCTION_PAYMENTS: true,
      }),
    );

    for (const key of HELD_LEGAL_OPERATIONS) {
      expect(snapshot[key].decision, key).toBe("DENY");
    }
  });
});
