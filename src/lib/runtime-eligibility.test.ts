import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/db/client";

import type { DemoUser } from "./demo-store";
import { runtimeEligibilitySnapshot } from "./runtime-eligibility";

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(),
}));

const environmentKeys = [
  "DEMO_MODE",
  "DATABASE_URL",
  "SESSION_SECRET",
  "COMPETITION_SEED_ENCRYPTION_KEY",
  "PREVIEW_OWNER_EMAIL",
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
  const where = vi.fn().mockResolvedValue(records);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  vi.mocked(getDatabase).mockReturnValue({ select } as never);
  return { select, from, where };
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
  vi.mocked(getDatabase).mockReset();
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

    expect(query.select).toHaveBeenCalledOnce();
    expect(snapshot.environment).toBe("configured");
    expect(snapshot.monetairePlay.environment).toBe("configured");
    expect(snapshot.monetairePlay.decision).toBe("DENY");
    expect(snapshot.monetairePlay.reasonCodes).toContain("SELF_EXCLUDED");
  });

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
