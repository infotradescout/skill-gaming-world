import {
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as enterCompetition } from "@/app/api/competitions/[competitionId]/enter/route";
import { POST as startSession } from "@/app/api/game/sessions/route";
import { POST as sandboxPurchase } from "@/app/api/play-coins/sandbox-purchase/route";

import { CURATED_COMPETITION_ID } from "./competition-catalog";
import { getDemoStore, resetDemoStoreForTests } from "./demo-store";
import { resetDemoRateLimitsForTests } from "./http";

const origin = "http://localhost:3000";

function post(
  path: string,
  body: Record<string, unknown>,
  cookie?: string,
) {
  return new NextRequest(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-forwarded-for": "198.51.100.77",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) {
    throw new Error("Expected a session cookie");
  }
  return header.split(";")[0];
}

function configureSafeDemo(): void {
  process.env.DEMO_MODE = "true";
  process.env.SESSION_SECRET =
    "configured-boundary-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "configured-boundary-seed-key-at-least-32-characters";
  process.env.FEATURE_MONETAIRE_PRIZE = "false";
  process.env.FEATURE_SOCIAL_CASINO = "false";
  process.env.FEATURE_REAL_MONEY_CASINO = "false";
  process.env.FEATURE_PRODUCTION_PAYMENTS = "false";
}

function configureNonDemo(): void {
  process.env.DEMO_MODE = "false";
  process.env.DATABASE_URL =
    "postgresql://test:test@localhost:5432/skill_gaming_world_test";
  // Even requested feature flags cannot activate held operations.
  process.env.FEATURE_MONETAIRE_PRIZE = "true";
  process.env.FEATURE_SOCIAL_CASINO = "true";
  process.env.FEATURE_REAL_MONEY_CASINO = "true";
  process.env.FEATURE_PRODUCTION_PAYMENTS = "true";
}

beforeEach(() => {
  configureSafeDemo();
  resetDemoStoreForTests();
  resetDemoRateLimitsForTests();
});

afterEach(() => {
  configureSafeDemo();
  delete process.env.DATABASE_URL;
});

describe("configured-environment fail-closed boundaries", () => {
  it("denies demo auth, game, competition, and sandbox writes", async () => {
    const registered = await register(
      post("/api/auth/register", {
        displayName: "Configured Boundary Player",
        email: "configured-boundary@example.test",
        password: "correct-horse-battery-staple",
        acceptPlayCoinTerms: true,
      }),
    );
    expect(registered.status).toBe(201);
    const cookie = cookieFrom(registered);
    const store = getDemoStore();
    const before = {
      users: store.usersById.size,
      sessions: store.sessionsByTokenHash.size,
      games: store.gameSessionsById.size,
      entries: store.competitionEntries.length,
      ledgerTransactions: store.playCoinLedger.transactions.length,
    };

    configureNonDemo();

    const registration = await register(
      post("/api/auth/register", {
        displayName: "Must Not Register",
        email: "blocked@example.test",
        password: "correct-horse-battery-staple",
        acceptPlayCoinTerms: true,
      }),
    );
    const loginResponse = await login(
      post("/api/auth/login", {
        email: "configured-boundary@example.test",
        password: "correct-horse-battery-staple",
      }),
    );
    const game = await startSession(
      post("/api/game/sessions", { mode: "PRACTICE" }, cookie),
    );
    const competition = await enterCompetition(
      post(
        `/api/competitions/${CURATED_COMPETITION_ID}/enter`,
        {},
        cookie,
      ),
      {
        params: Promise.resolve({
          competitionId: CURATED_COMPETITION_ID,
        }),
      },
    );
    const sandbox = await sandboxPurchase(
      post(
        "/api/play-coins/sandbox-purchase",
        {
          packageKey: "PRACTICE_1000",
          idempotencyKey: "configured-denial-key",
          acknowledgeSandboxOnly: true,
        },
        cookie,
      ),
    );

    expect(registration.status).toBe(503);
    expect((await registration.json()).error.code).toBe(
      "RATE_LIMIT_ADAPTER_REQUIRED",
    );
    expect(loginResponse.status).toBe(503);
    expect((await loginResponse.json()).error.code).toBe(
      "RATE_LIMIT_ADAPTER_REQUIRED",
    );
    expect(game.status).toBe(503);
    expect((await game.json()).error.code).toBe(
      "RATE_LIMIT_ADAPTER_REQUIRED",
    );
    expect(competition.status).toBe(503);
    expect((await competition.json()).error.code).toBe(
      "RATE_LIMIT_ADAPTER_REQUIRED",
    );
    expect(sandbox.status).toBe(503);
    expect((await sandbox.json()).error.code).toBe(
      "RATE_LIMIT_ADAPTER_REQUIRED",
    );
    expect({
      users: store.usersById.size,
      sessions: store.sessionsByTokenHash.size,
      games: store.gameSessionsById.size,
      entries: store.competitionEntries.length,
      ledgerTransactions: store.playCoinLedger.transactions.length,
    }).toEqual(before);
  });
});

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return routeFiles(path);
    }
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  });
}

describe("held-operation route inventory", () => {
  it("has no unreviewed writable API route", () => {
    const apiRoot = resolve(process.cwd(), "src", "app", "api");
    const writableRoutes = routeFiles(apiRoot)
      .filter((path) =>
        /export\s+(?:(?:async\s+)?function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map((path) =>
        relative(apiRoot, path)
          .replaceAll("\\", "/")
          .replace(/\/route\.ts$/, ""),
      )
      .toSorted();

    expect(writableRoutes).toEqual(
      [
        "account/close",
        "appeals",
        "auth/login",
        "auth/logout",
        "auth/register",
        "competitions/[competitionId]/enter",
        "game/sessions",
        "game/sessions/[sessionId]/moves",
        "play-coins/sandbox-purchase",
        "responsible-play/cooldown",
        "responsible-play/self-exclusion",
      ].toSorted(),
    );

    const heldFragments = [
      "casino",
      "cash",
      "deposit",
      "payout",
      "prize",
      "redeem",
      "redemption",
      "social-casino",
      "transfer",
      "wager",
      "withdraw",
    ];
    for (const route of writableRoutes) {
      expect(
        heldFragments.some((fragment) => route.includes(fragment)),
        route,
      ).toBe(false);
    }
  });
});
