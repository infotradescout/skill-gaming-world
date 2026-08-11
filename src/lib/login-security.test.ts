import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendAudit: vi.fn(),
  createRegistration: vi.fn(),
  createSession: vi.fn(),
  findUser: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  appendRuntimeAuditEvent: mocks.appendAudit,
}));
vi.mock("@/lib/auth", () => ({
  createDemoUserId: vi.fn(),
  createRuntimeSession: mocks.createSession,
  publicUser: vi.fn((user) => user),
  setSessionCookie: vi.fn(),
}));
vi.mock("@/lib/demo-store", () => ({
  getDemoStore: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  getRuntimeEnv: () => ({ DEMO_MODE: false }),
}));
vi.mock("@/lib/http", () => ({
  enforceRateLimit: vi.fn(async () => null),
  enforceSameOrigin: vi.fn(() => null),
  jsonError: (status: number, code: string, message: string, requestId: string) =>
    Response.json({ error: { code, message, requestId } }, { status }),
  requestId: vi.fn(() => "login-security-request"),
}));
vi.mock("@/lib/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock("@/lib/persistent-auth", () => ({
  PersistentAuthenticationError: class PersistentAuthenticationError extends Error {
    readonly code = "ACCOUNT_BLOCKED";
  },
  createPersistentRegistration: mocks.createRegistration,
  persistentUserByEmail: mocks.findUser,
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";

function request() {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: "unknown@example.test",
      password: "submitted-password",
    }),
  });
}

function registrationRequest(displayName: string) {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      displayName,
      email: "new-account@example.test",
      password: "valid-registration-password",
      acceptPlayCoinTerms: true,
    }),
  });
}

const activeUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "unknown@example.test",
  displayName: "Login Security",
  passwordHash: `scrypt$${"11".repeat(16)}$${"22".repeat(64)}`,
  status: "ACTIVE" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  acceptedPlayCoinTermsVersion: "V1",
  acceptedPlayCoinTermsAt: "2026-01-01T00:00:00.000Z",
  adminRoles: [],
};

describe("configured login security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(false);
    mocks.appendAudit.mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue({
      token: "configured-token",
      expiresAt: new Date("2026-08-10T00:00:00.000Z"),
    });
  });

  it("runs the password KDF for an unknown email and preserves 401 if failure auditing is unavailable", async () => {
    mocks.appendAudit.mockRejectedValue(new Error("AUDIT_UNAVAILABLE"));

    const response = await login(request());

    expect(response.status).toBe(401);
    expect(mocks.verifyPassword).toHaveBeenCalledOnce();
    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "submitted-password",
      expect.stringMatching(/^scrypt\$0{32}\$0{128}$/),
    );
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ACCOUNT_LOGIN_FAILED",
        afterState: { environment: "configured" },
      }),
    );
  });

  it("rejects a PostgreSQL NUL display name before hashing or persistence", async () => {
    const response = await register(
      registrationRequest("Invalid \u0000 Display Name"),
    );

    expect(response.status).toBe(400);
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.createRegistration).not.toHaveBeenCalled();
  });

  it("creates a configured session and its neutral audit in one persistent transaction boundary", async () => {
    mocks.findUser.mockResolvedValue(activeUser);
    mocks.verifyPassword.mockResolvedValue(true);

    const response = await login(request());

    expect(response.status).toBe(200);
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledWith(
      activeUser.id,
      expect.objectContaining({
        eventType: "ACCOUNT_LOGIN",
        reason: "Successful account login.",
        requestId: "login-security-request",
        afterState: { environment: "configured" },
      }),
    );
  });

  it("preserves a blocked account response if no-mutation audit recording fails", async () => {
    mocks.findUser.mockResolvedValue({ ...activeUser, status: "SUSPENDED" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.appendAudit.mockRejectedValue(new Error("AUDIT_UNAVAILABLE"));

    const response = await login(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ACCOUNT_BLOCKED" },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
