import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as readAdminAudit } from "@/app/api/admin/audit/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as cooldown } from "@/app/api/responsible-play/cooldown/route";
import { POST as selfExclude } from "@/app/api/responsible-play/self-exclusion/route";

import { getDemoStore, resetDemoStoreForTests } from "./demo-store";
import { resetDemoRateLimitsForTests } from "./http";

const origin = "http://localhost:3000";

function request(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  cookie?: string,
) {
  return new NextRequest(`${origin}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(method === "POST" ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function registration(email: string) {
  return register(
    request("/api/auth/register", "POST", {
      displayName: "Safety Reviewer",
      email,
      password: "correct-horse-battery-staple",
      acceptPlayCoinTerms: true,
    }),
  );
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie");
  if (!value) throw new Error("Expected a session cookie.");
  return value.split(";")[0];
}

beforeEach(() => {
  process.env.DEMO_MODE = "true";
  process.env.SESSION_SECRET =
    "auth-support-test-session-secret-at-least-32-characters";
  resetDemoStoreForTests();
  resetDemoRateLimitsForTests();
});

describe("safe-demo auth, support, and audit hardening", () => {
  it("serializes concurrent registration uniqueness after password hashing", async () => {
    const responses = await Promise.all([
      registration("race@example.test"),
      registration("race@example.test"),
    ]);

    expect(responses.map((response) => response.status).toSorted()).toEqual([
      201,
      409,
    ]);
    expect(getDemoStore().usersById.size).toBe(1);
    expect(getDemoStore().userIdsByEmail.size).toBe(1);
  });

  it("never lets cooldown or self-exclusion erase a suspension", async () => {
    const registered = await registration("restriction@example.test");
    const cookie = cookieFrom(registered);
    const user = [...getDemoStore().usersById.values()][0];
    user.status = "SUSPENDED";

    const cooldownResponse = await cooldown(
      request(
        "/api/responsible-play/cooldown",
        "POST",
        { hours: 24, confirm: true },
        cookie,
      ),
    );
    expect(cooldownResponse.status).toBe(403);
    expect(user.status).toBe("SUSPENDED");

    const exclusionResponse = await selfExclude(
      request(
        "/api/responsible-play/self-exclusion",
        "POST",
        {
          scope: "ALL_PRODUCTS",
          duration: "PERMANENT",
          confirm: true,
        },
        cookie,
      ),
    );
    expect(exclusionResponse.status).toBe(201);
    expect(user.status).toBe("SUSPENDED");
    expect(getDemoStore().selfExclusions).toHaveLength(1);

    user.status = "COOLDOWN";
    user.cooldownUntil = "malformed";
    const malformed = await cooldown(
      request(
        "/api/responsible-play/cooldown",
        "POST",
        { hours: 24, confirm: true },
        cookie,
      ),
    );
    expect(malformed.status).toBe(409);
    expect(user.cooldownUntil).toBe("malformed");
  });

  it("records authorized reads of the privileged audit surface", async () => {
    const registered = await registration("auditor@example.test");
    const cookie = cookieFrom(registered);
    const user = [...getDemoStore().usersById.values()][0];
    user.adminRoles.push("FINANCE_AUDITOR");

    const response = await readAdminAudit(
      request("/api/admin/audit", "GET", undefined, cookie),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events[0]).toMatchObject({
      eventType: "ADMIN_AUDIT_LOG_VIEWED",
      actorId: user.id,
    });
    expect(Object.isFrozen(getDemoStore().auditEvents)).toBe(true);
    expect(Object.isFrozen(getDemoStore().auditEvents.at(-1))).toBe(
      true,
    );
  });
});
