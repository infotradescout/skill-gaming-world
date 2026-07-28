import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/db/client";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";

import { resetDemoStoreForTests } from "./demo-store";
import { resetDemoRateLimitsForTests } from "./http";

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(),
}));

const managedEnvironmentKeys = [
  "DEMO_MODE",
  "DATABASE_URL",
  "SESSION_SECRET",
  "COMPETITION_SEED_ENCRYPTION_KEY",
  "PREVIEW_OWNER_EMAIL",
  "FEATURE_MONETAIRE_PRIZE",
  "FEATURE_SOCIAL_CASINO",
  "FEATURE_REAL_MONEY_CASINO",
  "FEATURE_PRODUCTION_PAYMENTS",
  "MONETAIRE_PLAY_JURISDICTIONS",
  "MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION",
] as const;

const originalEnvironment = Object.fromEntries(
  managedEnvironmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof managedEnvironmentKeys)[number], string | undefined>;

const origin = "http://localhost:3000";
const password = "correct-horse-battery-staple";

function configureBaseEnvironment(demoMode: boolean) {
  process.env.DEMO_MODE = demoMode ? "true" : "false";
  process.env.DATABASE_URL =
    "postgresql://configured:configured@127.0.0.1:5432/configured";
  process.env.SESSION_SECRET =
    "configured-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "configured-ranked-seed-key-at-least-32-characters";
  process.env.PREVIEW_OWNER_EMAIL = "owner@example.com";
  process.env.FEATURE_MONETAIRE_PRIZE = "false";
  process.env.FEATURE_SOCIAL_CASINO = "false";
  process.env.FEATURE_REAL_MONEY_CASINO = "false";
  process.env.FEATURE_PRODUCTION_PAYMENTS = "false";
  process.env.MONETAIRE_PLAY_JURISDICTIONS = "US";
  process.env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION = "US";
}

function authRequest(
  path: "/api/auth/login" | "/api/auth/register",
  body: Record<string, unknown>,
) {
  return new NextRequest(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getDatabase).mockReset();
  resetDemoStoreForTests();
  resetDemoRateLimitsForTests();
});

afterEach(() => {
  for (const key of managedEnvironmentKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("private-preview login ownership", () => {
  it("does not restrict safe-demo registration or login to the preview owner", async () => {
    configureBaseEnvironment(true);
    const email = "safe-demo-player@example.test";

    const registration = await register(
      authRequest("/api/auth/register", {
        displayName: "Safe Demo Player",
        email,
        password,
        acceptPlayCoinTerms: true,
      }),
    );
    expect(registration.status).toBe(201);

    const response = await login(
      authRequest("/api/auth/login", {
        email,
        password,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      environment: "safe-demo",
      user: { email },
    });
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
