import type { RuntimeEnv } from "./env";

export const LEGAL_GATE_KEYS = [
  "mode.monetaire_play",
  "play_coin.earn",
  "play_coin.package.sandbox",
  "play_coin.package.production",
  "mode.monetaire_prize",
  "prize.entry.free",
  "prize.entry.paid",
  "prize.award.valuable",
  "prize.payout",
  "mode.social_casino",
  "social_casino.game_execution",
  "mode.real_money_casino",
  "casino.deposit",
  "casino.wager",
  "casino.withdrawal",
  "casino.game_execution",
] as const;

export type LegalGateKey = (typeof LEGAL_GATE_KEYS)[number];
export type LegalGateDecision = "ALLOW" | "DENY";

export interface LegalGateEvaluation {
  key: LegalGateKey;
  decision: LegalGateDecision;
  reason: string;
  environment: "safe-demo" | "configured";
}

const HARD_HOLD_REASONS: Partial<Record<LegalGateKey, string>> = {
  "play_coin.package.production":
    "MERCHANT_LEGAL_AND_EXPLICIT_AUTHORIZATION_HOLD",
  "mode.monetaire_prize": "LEGAL_AND_COMPLIANCE_HOLD",
  "prize.entry.free": "LEGAL_AND_COMPETITION_RULES_HOLD",
  "prize.entry.paid": "HARD_LEGAL_HOLD",
  "prize.award.valuable": "HARD_LEGAL_AND_FUNDING_HOLD",
  "prize.payout": "NO_ROUTE_HARD_HOLD",
  "mode.social_casino": "PRODUCT_LEGAL_AND_DISTRIBUTION_HOLD",
  "social_casino.game_execution": "NO_ROUTE_HARD_HOLD",
  "mode.real_money_casino": "LICENSING_AND_MARKET_ACCESS_HOLD",
  "casino.deposit": "NO_ROUTE_HARD_HOLD",
  "casino.wager": "NO_ROUTE_HARD_HOLD",
  "casino.withdrawal": "NO_ROUTE_HARD_HOLD",
  "casino.game_execution": "NO_ROUTE_HARD_HOLD",
};

/**
 * Initial operation gates are compiled fail-closed. Environment variables may
 * request review state, but cannot activate a held cash/prize/casino operation.
 */
export function evaluateInitialOperationGate(
  key: LegalGateKey,
  env: RuntimeEnv,
): LegalGateEvaluation {
  const environment = env.DEMO_MODE ? "safe-demo" : "configured";

  if (key === "mode.monetaire_play") {
    return {
      key,
      decision: env.DEMO_MODE ? "ALLOW" : "DENY",
      reason: env.DEMO_MODE
        ? "SAFE_DEMO_MONETAIRE_PLAY"
        : "REQUIRES_REQUEST_JURISDICTION_DECISION",
      environment,
    };
  }

  if (key === "play_coin.earn") {
    return {
      key,
      decision: "ALLOW",
      reason: "NONREDEEMABLE_PLAY_POLICY_ONLY",
      environment,
    };
  }

  if (key === "play_coin.package.sandbox") {
    return {
      key,
      decision: env.DEMO_MODE ? "ALLOW" : "DENY",
      reason: env.DEMO_MODE
        ? "EXPLICIT_LOCAL_SANDBOX"
        : "SANDBOX_NOT_AVAILABLE_IN_CONFIGURED_ENVIRONMENT",
      environment,
    };
  }

  return {
    key,
    decision: "DENY",
    reason: HARD_HOLD_REASONS[key] ?? "MISSING_AUTHORIZATION_FAILS_CLOSED",
    environment,
  };
}

export function initialOperationGateSnapshot(env: RuntimeEnv) {
  return Object.fromEntries(
    LEGAL_GATE_KEYS.map((key) => [
      key,
      evaluateInitialOperationGate(key, env),
    ]),
  ) as Record<LegalGateKey, LegalGateEvaluation>;
}
