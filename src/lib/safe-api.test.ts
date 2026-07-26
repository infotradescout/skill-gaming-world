import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { assertPlayCoinLedgerIntegrity } from "@/domain";
import { GET as getEligibility } from "@/app/api/eligibility/route";
import { POST as startSession } from "@/app/api/game/sessions/route";
import { GET as getPlayCoins } from "@/app/api/play-coins/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as sandboxPurchase } from "@/app/api/play-coins/sandbox-purchase/route";
import { POST as selfExclude } from "@/app/api/responsible-play/self-exclusion/route";

import { getDemoStore, resetDemoStoreForTests } from "./demo-store";
import { resetDemoRateLimitsForTests } from "./http";

const origin = "http://localhost:3000";

function post(path: string, body: Record<string, unknown>, cookie?: string) {
  return new NextRequest(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("Expected a session cookie.");
  return header.split(";")[0];
}

async function registerPlayer() {
  const response = await register(
    post("/api/auth/register", {
      displayName: "Test Player",
      email: "player@example.test",
      password: "correct-horse-battery-staple",
      acceptPlayCoinTerms: true,
    }),
  );
  expect(response.status).toBe(201);
  return cookieFrom(response);
}

beforeEach(() => {
  process.env.DEMO_MODE = "true";
  process.env.SESSION_SECRET =
    "unit-test-session-secret-at-least-32-characters";
  process.env.FEATURE_MONETAIRE_PRIZE = "false";
  process.env.FEATURE_SOCIAL_CASINO = "false";
  process.env.FEATURE_REAL_MONEY_CASINO = "false";
  process.env.FEATURE_PRODUCTION_PAYMENTS = "false";
  resetDemoStoreForTests();
  resetDemoRateLimitsForTests();
});

describe("safe local API boundaries", () => {
  it("registers a player and rejects a duplicate account", async () => {
    const first = await register(
      post("/api/auth/register", {
        displayName: "Test Player",
        email: "duplicate@example.test",
        password: "correct-horse-battery-staple",
        acceptPlayCoinTerms: true,
      }),
    );
    const second = await register(
      post("/api/auth/register", {
        displayName: "Other Name",
        email: "duplicate@example.test",
        password: "another-correct-horse-password",
        acceptPlayCoinTerms: true,
      }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it("simulates a Play Coin package without a real charge and is idempotent", async () => {
    const cookie = await registerPlayer();
    const body = {
      packageKey: "PRACTICE_1000",
      idempotencyKey: "sandbox-test-key-0001",
      acknowledgeSandboxOnly: true,
    };

    const first = await sandboxPurchase(
      post("/api/play-coins/sandbox-purchase", body, cookie),
    );
    const duplicate = await sandboxPurchase(
      post("/api/play-coins/sandbox-purchase", body, cookie),
    );
    const firstBody = await first.json();
    const duplicateBody = await duplicate.json();

    expect(first.status).toBe(201);
    expect(firstBody.entry.chargedRealMoney).toBe(false);
    expect(firstBody.entry.balanceAfterMinor).toBe(1_000);
    expect(firstBody.entry.transactionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(duplicate.status).toBe(200);
    expect(duplicateBody.duplicate).toBe(true);
    expect(duplicateBody.entry.transactionId).toBe(
      firstBody.entry.transactionId,
    );
    expect(getDemoStore().playCoinLedger.transactions).toHaveLength(1);
    expect(
      getDemoStore().playCoinLedger.transactions[0].lines,
    ).toHaveLength(2);
    expect(
      getDemoStore().playCoinLedger.transactions[0].sourceReference,
    ).toBe(
      [...getDemoStore().sandboxIdempotencyRecords.values()][0]
        .requestHash,
    );
    expect(
      assertPlayCoinLedgerIntegrity(getDemoStore().playCoinLedger),
    ).toBe(true);

    const changedRetry = await sandboxPurchase(
      post(
        "/api/play-coins/sandbox-purchase",
        { ...body, packageKey: "PRACTICE_2500" },
        cookie,
      ),
    );
    const changedRetryBody = await changedRetry.json();
    expect(changedRetry.status).toBe(409);
    expect(changedRetryBody.error.code).toBe(
      "IDEMPOTENCY_KEY_REUSED",
    );
    expect(getDemoStore().playCoinLedger.transactions).toHaveLength(1);

    const history = await getPlayCoins(
      new NextRequest(`${origin}/api/play-coins`, {
        headers: { cookie },
      }),
    );
    const historyBody = await history.json();
    expect(historyBody.balanceMinor).toBe(1_000);
    expect(historyBody.balanceDerivedFromDoubleEntryLines).toBe(true);
    expect(historyBody.entries).toHaveLength(1);
  });

  it("keeps prize and casino eligibility independently denied", async () => {
    const cookie = await registerPlayer();
    const response = await getEligibility(
      new NextRequest(`${origin}/api/eligibility`, {
        headers: { cookie },
      }),
    );
    const body = await response.json();

    expect(body.monetairePlay.decision).toBe("ALLOW");
    expect(body.skillPrizeVerification.decision).toBe("DENY");
    expect(body.casinoVerification.decision).toBe("DENY");
    expect(body.decisionsAreIndependent).toBe(true);
  });

  it("blocks Monetaire Play after all-product self-exclusion", async () => {
    const cookie = await registerPlayer();
    const exclusion = await selfExclude(
      post(
        "/api/responsible-play/self-exclusion",
        {
          scope: "ALL_PRODUCTS",
          duration: "90_DAYS",
          confirm: true,
        },
        cookie,
      ),
    );
    expect(exclusion.status).toBe(201);

    const response = await getEligibility(
      new NextRequest(`${origin}/api/eligibility`, {
        headers: { cookie },
      }),
    );
    const body = await response.json();
    expect(body.monetairePlay.decision).toBe("DENY");
    expect(body.monetairePlay.reasonCodes).toContain("SELF_EXCLUDED");
  });

  it("keeps Casino-only exclusion scoped away from Monetaire", async () => {
    const cookie = await registerPlayer();
    const exclusion = await selfExclude(
      post(
        "/api/responsible-play/self-exclusion",
        {
          scope: "CASINO",
          duration: "90_DAYS",
          confirm: true,
        },
        cookie,
      ),
    );
    expect(exclusion.status).toBe(201);

    const eligibility = await getEligibility(
      new NextRequest(`${origin}/api/eligibility`, {
        headers: { cookie },
      }),
    );
    const body = await eligibility.json();
    expect(body.monetairePlay.decision).toBe("ALLOW");
    expect(body.casinoVerification.reasonCodes).toContain(
      "SELF_EXCLUDED",
    );

    const game = await startSession(
      post("/api/game/sessions", { mode: "PRACTICE" }, cookie),
    );
    expect(game.status).toBe(201);
  });

  it("allows Monetaire after a recorded cooldown expires", async () => {
    const cookie = await registerPlayer();
    const user = [...getDemoStore().usersById.values()][0];
    user.status = "COOLDOWN";
    user.cooldownUntil = new Date(Date.now() - 1_000).toISOString();

    const eligibility = await getEligibility(
      new NextRequest(`${origin}/api/eligibility`, {
        headers: { cookie },
      }),
    );
    expect((await eligibility.json()).monetairePlay.decision).toBe(
      "ALLOW",
    );
    const game = await startSession(
      post("/api/game/sessions", { mode: "PRACTICE" }, cookie),
    );
    expect(game.status).toBe(201);
  });

  it("contains no deposit, payout, redemption, or real-money wager route", () => {
    for (const route of ["deposit", "payout", "redeem", "wager"]) {
      expect(
        existsSync(resolve(process.cwd(), "src", "app", "api", route)),
      ).toBe(false);
    }
  });
});
