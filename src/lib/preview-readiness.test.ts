import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/db/client";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as health } from "@/app/api/health/route";

import { getRuntimeEnv, isPreviewOwnerEmail } from "./env";

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

function configurePreview() {
  process.env.DEMO_MODE = "false";
  process.env.DATABASE_URL =
    "postgresql://configured:configured@127.0.0.1:5432/configured";
  process.env.SESSION_SECRET =
    "configured-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "configured-ranked-seed-key-at-least-32-characters";
  process.env.PREVIEW_OWNER_EMAIL = " Owner@Example.COM ";
  process.env.FEATURE_MONETAIRE_PRIZE = "false";
  process.env.FEATURE_SOCIAL_CASINO = "false";
  process.env.FEATURE_REAL_MONEY_CASINO = "false";
  process.env.FEATURE_PRODUCTION_PAYMENTS = "false";
  process.env.MONETAIRE_PLAY_JURISDICTIONS = "US";
  process.env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION = "US";
}

function registrationRequest(email: string) {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      displayName: "Private Preview",
      email,
      password: "correct-horse-battery-staple",
      acceptPlayCoinTerms: true,
    }),
  });
}

beforeEach(() => {
  configurePreview();
  vi.mocked(getDatabase).mockReset();
});

afterEach(() => {
  for (const key of managedEnvironmentKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("configured private preview boundaries", () => {
  it("normalizes the configured owner email and compares it exactly", () => {
    const env = getRuntimeEnv();

    expect(env.PREVIEW_OWNER_EMAIL).toBe("owner@example.com");
    expect(isPreviewOwnerEmail(env, "owner@example.com")).toBe(true);
    expect(isPreviewOwnerEmail(env, "other@example.com")).toBe(false);
  });

  it("fails environment validation when the configured owner is missing", () => {
    delete process.env.PREVIEW_OWNER_EMAIL;

    expect(() => getRuntimeEnv()).toThrow(
      "PREVIEW_OWNER_EMAIL is required outside demo mode",
    );
  });

  it("denies non-owner registration before any database access", async () => {
    const response = await register(
      registrationRequest("other@example.com"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PREVIEW_OWNER_ONLY" },
    });
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("fails readiness closed when owner configuration is missing", async () => {
    delete process.env.PREVIEW_OWNER_EMAIL;

    const response = await health();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not-ready",
      dependencies: {
        configuration: "unavailable",
        schema: "unavailable",
        previewOwner: "unavailable",
      },
      operations: { monetairePlay: false },
    });
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("requires all core tables and seven journaled migrations", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        { coreTableCount: 10, journalTableCount: 1 },
      ])
      .mockResolvedValueOnce([{ migrationCount: 6 }]);
    vi.mocked(getDatabase).mockReturnValue({ execute } as never);

    const response = await health();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not-ready",
      dependencies: {
        database: "ready",
        schema: "unavailable",
      },
      operations: { monetairePlay: false },
    });
  });

  it("reports ready only after the reviewed schema is fully journaled", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        { coreTableCount: 10, journalTableCount: 1 },
      ])
      .mockResolvedValueOnce([{ migrationCount: 7 }]);
    vi.mocked(getDatabase).mockReturnValue({ execute } as never);

    const response = await health();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      dependencies: {
        configuration: "ready",
        database: "ready",
        schema: "ready",
        jurisdiction: "ready",
        previewOwner: "ready",
      },
      operations: {
        monetairePlay: true,
        monetairePrize: false,
        socialCasino: false,
        realMoneyCasino: false,
        productionPayments: false,
      },
    });
  });
});
