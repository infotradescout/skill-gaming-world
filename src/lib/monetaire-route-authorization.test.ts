import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAppeal: vi.fn(),
  createCompetition: vi.fn(),
  createPractice: vi.fn(),
  createPersistentPractice: vi.fn(),
  enterPersistentCompetition: vi.fn(),
  persistentCompetitionSnapshot: vi.fn(),
  resumePersistent: vi.fn(),
  submitPersistent: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ appendRuntimeAuditEvent: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  currentRuntimeUser: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    email: "authorized-route@example.test",
    displayName: "Authorized Route",
    passwordHash: "unused",
    status: "ACTIVE",
    createdAt: new Date(0).toISOString(),
    acceptedPlayCoinTermsVersion: "V1",
    acceptedPlayCoinTermsAt: new Date(0).toISOString(),
    adminRoles: [],
  })),
}));
vi.mock("@/lib/configured-jurisdiction", () => ({
  authorizeMonetairePlay: mocks.authorize,
}));
vi.mock("@/lib/env", () => ({
  getRuntimeEnv: () => ({ DEMO_MODE: false }),
}));
vi.mock("@/lib/http", () => ({
  enforceRateLimit: vi.fn(async () => null),
  enforceSameOrigin: vi.fn(() => null),
  requestId: vi.fn(() => "authorization-test-request"),
  jsonError: (status: number, code: string, message: string, requestId: string) =>
    Response.json({ error: { code, message, requestId } }, { status }),
}));
vi.mock("@/lib/competition-catalog", () => ({
  CURATED_COMPETITION_ID: "curated-test-competition",
  publicCompetitionSnapshot: vi.fn(),
}));
vi.mock("@/lib/game-service", () => ({
  GameServiceError: class GameServiceError extends Error {},
  createCompetitionSession: mocks.createCompetition,
  createPracticeSession: mocks.createPractice,
  listActiveOwnedGameSessions: vi.fn(),
  publicGameSession: vi.fn((session) => session),
  resumeOwnedGameSession: vi.fn(),
  submitGameMove: vi.fn(),
}));
vi.mock("@/lib/persistent-game", () => ({
  createPersistentPracticeSession: mocks.createPersistentPractice,
  listActivePersistentSessions: vi.fn(),
  resumePersistentSession: mocks.resumePersistent,
  submitPersistentMove: mocks.submitPersistent,
}));
vi.mock("@/lib/persistent-competition", () => ({
  enterPersistentCompetition: mocks.enterPersistentCompetition,
  persistentCompetitionSnapshot: mocks.persistentCompetitionSnapshot,
}));
vi.mock("@/lib/persistent-support", () => ({
  createPersistentAppeal: mocks.createAppeal,
  listPersistentAppeals: vi.fn(),
}));

import { POST as submitAppeal } from "@/app/api/appeals/route";
import { POST as enterCompetition } from "@/app/api/competitions/[competitionId]/enter/route";
import { GET as getSession } from "@/app/api/game/sessions/[sessionId]/route";
import { POST as submitMove } from "@/app/api/game/sessions/[sessionId]/moves/route";
import { POST as startSession } from "@/app/api/game/sessions/route";

const configuredCompetitionId =
  "00000000-0000-4000-8000-000000004200";

function request(path: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Monetaire session-creation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      allowed: false,
      jurisdictionCode: "CA",
      reasonCode: "DEPLOYMENT_JURISDICTION_NOT_ALLOWED",
      jurisdictionDecisionId: "jurisdiction-decision-denied",
    });
  });

  it("denies both generic session creation and direct competition entry before mutation", async () => {
    const sessionResponse = await startSession(
      request("/api/game/sessions", { mode: "PRACTICE" }),
    );
    const competitionResponse = await enterCompetition(
      request(`/api/competitions/${configuredCompetitionId}/enter`),
      { params: Promise.resolve({ competitionId: configuredCompetitionId }) },
    );

    expect(sessionResponse.status).toBe(503);
    expect(competitionResponse.status).toBe(503);
    await expect(sessionResponse.json()).resolves.toMatchObject({
      error: { code: "JURISDICTION_ADAPTER_REQUIRED" },
    });
    await expect(competitionResponse.json()).resolves.toMatchObject({
      error: { code: "JURISDICTION_ADAPTER_REQUIRED" },
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
    expect(mocks.createPractice).not.toHaveBeenCalled();
    expect(mocks.createPersistentPractice).not.toHaveBeenCalled();
    expect(mocks.createCompetition).not.toHaveBeenCalled();
    expect(mocks.persistentCompetitionSnapshot).not.toHaveBeenCalled();
    expect(mocks.enterPersistentCompetition).not.toHaveBeenCalled();
  });

  it("passes the recorded configured decision id through both noncash entry routes", async () => {
    mocks.authorize.mockResolvedValue({
      allowed: true,
      jurisdictionCode: "US",
      reasonCode: "DEPLOYMENT_JURISDICTION_ALLOWLIST",
      jurisdictionDecisionId: "jurisdiction-decision-allowed",
    });
    mocks.persistentCompetitionSnapshot.mockResolvedValue({
      competitionId: configuredCompetitionId,
      status: "ACTIVE",
    });
    mocks.enterPersistentCompetition.mockResolvedValue({
      id: "configured-game-session",
      mode: "NONCASH_COMPETITION",
      competitionEntryId: "configured-entry",
      state: { dealCommitment: "a".repeat(64) },
    });

    const genericResponse = await startSession(
      request("/api/game/sessions", { mode: "NONCASH_COMPETITION" }),
    );
    const directResponse = await enterCompetition(
      request(`/api/competitions/${configuredCompetitionId}/enter`),
      { params: Promise.resolve({ competitionId: configuredCompetitionId }) },
    );

    expect(genericResponse.status).toBe(201);
    expect(directResponse.status).toBe(201);
    expect(mocks.enterPersistentCompetition).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "00000000-0000-4000-8000-000000000001" }),
      configuredCompetitionId,
      "jurisdiction-decision-allowed",
      {
        requestId: "authorization-test-request",
        eventType: "GAME_SESSION_CREATED",
      },
    );
    expect(mocks.enterPersistentCompetition).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "00000000-0000-4000-8000-000000000001" }),
      configuredCompetitionId,
      "jurisdiction-decision-allowed",
      {
        requestId: "authorization-test-request",
        eventType: "NONCASH_COMPETITION_ENTERED",
      },
    );
  });

  it("rejects malformed configured session ids before persistence", async () => {
    const invalidSessionId = "not-a-session-uuid";
    const invalidCompetitionResponse = await enterCompetition(
      request("/api/competitions/not-a-competition-uuid/enter"),
      {
        params: Promise.resolve({
          competitionId: "not-a-competition-uuid",
        }),
      },
    );
    const readResponse = await getSession(
      request(`/api/game/sessions/${invalidSessionId}`),
      { params: Promise.resolve({ sessionId: invalidSessionId }) },
    );
    const moveResponse = await submitMove(
      request(`/api/game/sessions/${invalidSessionId}/moves`),
      { params: Promise.resolve({ sessionId: invalidSessionId }) },
    );
    const appealResponse = await submitAppeal(
      request("/api/appeals", {
        gameSessionId: invalidSessionId,
        subject: "Review this session",
        statement:
          "Please review the authoritative move evidence for this session.",
      }),
    );

    expect(invalidCompetitionResponse.status).toBe(404);
    expect(readResponse.status).toBe(404);
    expect(moveResponse.status).toBe(404);
    expect(appealResponse.status).toBe(400);
    await expect(readResponse.json()).resolves.toMatchObject({
      error: { code: "SESSION_NOT_FOUND" },
    });
    await expect(moveResponse.json()).resolves.toMatchObject({
      error: { code: "SESSION_NOT_FOUND" },
    });
    expect(mocks.resumePersistent).not.toHaveBeenCalled();
    expect(mocks.submitPersistent).not.toHaveBeenCalled();
    expect(mocks.createAppeal).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it("rejects move sequences outside the PostgreSQL integer range", async () => {
    const sessionId = "00000000-0000-4000-8000-000000000099";
    const response = await submitMove(
      request(`/api/game/sessions/${sessionId}/moves`, {
        actionId: "oversized-sequence-action",
        sequence: 2_147_483_648,
        priorStateHash: "a".repeat(64),
        intent: { type: "DRAW_STOCK" },
      }),
      { params: Promise.resolve({ sessionId }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_MOVE_COMMAND" },
    });
    expect(mocks.submitPersistent).not.toHaveBeenCalled();
  });

  it("rejects PostgreSQL NUL characters before configured persistence", async () => {
    const sessionId = "00000000-0000-4000-8000-000000000099";
    const moveResponse = await submitMove(
      request(`/api/game/sessions/${sessionId}/moves`, {
        actionId: "nul-action-\u0000-invalid",
        sequence: 1,
        priorStateHash: "a".repeat(64),
        intent: { type: "DRAW_STOCK" },
      }),
      { params: Promise.resolve({ sessionId }) },
    );
    const appealResponse = await submitAppeal(
      request("/api/appeals", {
        gameSessionId: sessionId,
        subject: "Review \u0000 invalid evidence",
        statement:
          "Please review the authoritative move evidence for this session.",
      }),
    );

    expect(moveResponse.status).toBe(400);
    expect(appealResponse.status).toBe(400);
    expect(mocks.submitPersistent).not.toHaveBeenCalled();
    expect(mocks.createAppeal).not.toHaveBeenCalled();
  });
});
