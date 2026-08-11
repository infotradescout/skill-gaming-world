import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/db/client";

import type { DemoUser } from "./demo-store";
import { runtimeEligibilitySnapshot } from "./runtime-eligibility";

const accessSnapshot = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(),
}));
vi.mock("@/lib/persistent-player-access", () => ({
  persistentPlayerAccessSnapshot: accessSnapshot,
}));

const environmentKeys = [
  "DEMO_MODE",
  "DATABASE_URL",
  "SESSION_SECRET",
  "COMPETITION_SEED_ENCRYPTION_KEY",
  "PREVIEW_OWNER_EMAIL",
  "MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION",
  "MONETAIRE_PLAY_JURISDICTIONS",
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof environmentKeys)[number], string | undefined>;
const serverAtMs = Date.UTC(2026, 6, 26, 12);

function configuredUser(overrides: Partial<DemoUser> = {}): DemoUser {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "owner@example.test",
    displayName: "Owner",
    passwordHash: "not-used",
    status: "ACTIVE",
    createdAt: new Date(serverAtMs - 1_000).toISOString(),
    acceptedPlayCoinTermsVersion: "PLAY_COIN_TERMS_V1_2026_07_26",
    acceptedPlayCoinTermsAt: new Date(serverAtMs - 1_000).toISOString(),
    adminRoles: [],
    ...overrides,
  };
}

function mockExclusions(records: unknown[]) {
  accessSnapshot.mockImplementation(async (_transaction, user) => ({
    user,
    exclusions: records.map((record) => {
      const value = record as {
        id: string;
        userId: string;
        scope: "ALL_PRODUCTS" | "SKILL_GAMING_WORLD" | "CASINO";
        startsAt: Date;
        endsAt?: Date;
        permanent: boolean;
      };
      return {
        ...value,
        startsAt: value.startsAt.toISOString(),
        endsAt: value.endsAt?.toISOString(),
        removalPolicy: "COMPLIANCE_REVIEW_ONLY" as const,
      };
    }),
    serverAtMs,
  }));
  const transaction = vi.fn(async (callback) => callback({}));
  vi.mocked(getDatabase).mockReturnValue({ transaction } as never);
  return { transaction };
}

beforeEach(() => {
  process.env.DEMO_MODE = "false";
  process.env.DATABASE_URL =
    "postgresql://configured:configured@127.0.0.1:5432/configured";
  process.env.SESSION_SECRET =
    "configured-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "configured-ranked-seed-key-at-least-32-characters";
  process.env.PREVIEW_OWNER_EMAIL = "owner@example.test";
  process.env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION = "US";
  process.env.MONETAIRE_PLAY_JURISDICTIONS = "US";
  vi.mocked(getDatabase).mockReset();
  accessSnapshot.mockReset();
});

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("configured eligibility", () => {
  it("uses persistent self-exclusions and labels the configured environment", async () => {
    const query = mockExclusions([
      {
        id: "00000000-0000-0000-0000-000000000101",
        userId: "00000000-0000-0000-0000-000000000001",
        scope: "ALL_PRODUCTS",
        startsAt: new Date(serverAtMs - 1_000),
        endsAt: new Date(serverAtMs + 10_000),
        permanent: false,
      },
    ]);

    const snapshot = await runtimeEligibilitySnapshot(
      configuredUser({ status: "SELF_EXCLUDED" }),
      serverAtMs,
    );

    expect(query.transaction).toHaveBeenCalledOnce();
    expect(accessSnapshot).toHaveBeenCalledOnce();
    expect(snapshot.environment).toBe("configured");
    expect(snapshot.monetairePlay.environment).toBe("configured");
    expect(snapshot.monetairePlay.decision).toBe("DENY");
    expect(snapshot.monetairePlay.reasonCodes).toContain("SELF_EXCLUDED");
  });

  it.each([
    [undefined, "US"],
    ["CA", "US"],
  ] as const)(
    "denies when deployment jurisdiction %s is outside %s",
    async (deploymentJurisdiction, allowedJurisdictions) => {
      if (deploymentJurisdiction === undefined) {
        delete process.env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION;
      } else {
        process.env.MONETAIRE_PLAY_DEPLOYMENT_JURISDICTION =
          deploymentJurisdiction;
      }
      process.env.MONETAIRE_PLAY_JURISDICTIONS = allowedJurisdictions;
      mockExclusions([]);

      const snapshot = await runtimeEligibilitySnapshot(
        configuredUser(),
        serverAtMs,
      );

      expect(snapshot.monetairePlay.decision).toBe("DENY");
      expect(snapshot.monetairePlay.reasonCodes).toContain(
        "DEPLOYMENT_JURISDICTION_NOT_ALLOWED",
      );
    },
  );

  it("does not leave an expired configured cooldown blocked", async () => {
    mockExclusions([]);

    const snapshot = await runtimeEligibilitySnapshot(
      configuredUser({
        status: "COOLDOWN",
        cooldownUntil: new Date(serverAtMs - 1).toISOString(),
      }),
      serverAtMs,
    );

    expect(snapshot.accountStatus).toBe("ACTIVE");
    expect(snapshot.monetairePlay.accountStatus).toBe("ACTIVE");
    expect(snapshot.monetairePlay.decision).toBe("ALLOW");
    expect(snapshot.monetairePlay.reasonCodes).toEqual([]);
  });
});
