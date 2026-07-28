import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createCuratedSolutionIntents } from "@/domain";

import { POST as submitAppeal } from "@/app/api/appeals/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as getCompetitionLeaderboard } from "@/app/api/competitions/[competitionId]/leaderboard/route";
import { POST as enterCompetition } from "@/app/api/competitions/[competitionId]/enter/route";
import { POST as submitMove } from "@/app/api/game/sessions/[sessionId]/moves/route";
import { GET as getSession } from "@/app/api/game/sessions/[sessionId]/route";
import {
  GET as listSessions,
  POST as startSession,
} from "@/app/api/game/sessions/route";
import { POST as selfExclude } from "@/app/api/responsible-play/self-exclusion/route";

import {
  CURATED_COMPETITION_ID,
  getCuratedCompetitionBundle,
  resetCompetitionCatalogForTests,
} from "./competition-catalog";
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

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("Expected session cookie.");
  return header.split(";")[0];
}

async function playerCookie(email = "game-player@example.test") {
  const response = await register(
    request("/api/auth/register", "POST", {
      displayName: "Game Player",
      email,
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
    "game-test-session-secret-at-least-32-characters";
  process.env.COMPETITION_SEED_ENCRYPTION_KEY =
    "game-test-ranked-seed-key-at-least-32-characters";
  process.env.FEATURE_MONETAIRE_PRIZE = "false";
  process.env.FEATURE_SOCIAL_CASINO = "false";
  process.env.FEATURE_REAL_MONEY_CASINO = "false";
  process.env.FEATURE_PRODUCTION_PAYMENTS = "false";
  resetDemoStoreForTests();
  resetCompetitionCatalogForTests();
  resetDemoRateLimitsForTests();
});

describe("server-authoritative game APIs", () => {
  it("creates, resumes, and validates a practice session", async () => {
    const cookie = await playerCookie();
    const started = await startSession(
      request("/api/game/sessions", "POST", { mode: "PRACTICE" }, cookie),
    );
    const startedBody = await started.json();
    expect(started.status).toBe(201);
    expect(startedBody.session.serverAuthoritative).toBe(true);
    expect(startedBody.session.sequence).toBe(0);
    expect(startedBody.session.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(startedBody.session.dealGeneratorVersion).toBe(
      "CURATED_SOLVABLE_V1",
    );
    const sessionId = startedBody.session.id as string;

    const moved = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        {
          actionId: "practice-action-0001",
          sequence: 1,
          priorStateHash: startedBody.session.stateHash,
          intent: { type: "DRAW_STOCK" },
          clientTimeMs: 1,
          claimedScore: 999_999,
          requestHash: "0".repeat(64),
        },
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    const movedBody = await moved.json();
    expect(moved.status).toBe(200);
    expect(movedBody.accepted).toBe(true);
    expect(movedBody.currentSession.sequence).toBe(1);
    expect(movedBody.currentSession.validMoveCount).toBe(1);
    expect(movedBody.currentSession.stateHash).toBe(
      movedBody.outcome.acceptedStateHash,
    );
    expect(movedBody.outcome.event.stateHashBefore).toBe(
      startedBody.session.stateHash,
    );
    expect(movedBody.outcome.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(movedBody.outcome.requestHash).not.toBe("0".repeat(64));

    const resumed = await getSession(
      request(`/api/game/sessions/${sessionId}`, "GET", undefined, cookie),
      { params: Promise.resolve({ sessionId }) },
    );
    const resumedBody = await resumed.json();
    expect(resumed.status).toBe(200);
    expect(resumedBody.session.id).toBe(sessionId);
    expect(resumedBody.session.sequence).toBe(1);

    const active = await listSessions(
      request("/api/game/sessions", "GET", undefined, cookie),
    );
    const activeBody = await active.json();
    expect(active.status).toBe(200);
    expect(activeBody.sessions).toHaveLength(1);
    expect(activeBody.sessions[0]).toMatchObject({
      id: sessionId,
      mode: "PRACTICE",
      status: "ACTIVE",
      sequence: 1,
    });
  });

  it("returns exact retries and records changed, stale, and out-of-order attempts", async () => {
    const cookie = await playerCookie();
    const started = await startSession(
      request("/api/game/sessions", "POST", { mode: "PRACTICE" }, cookie),
    );
    const startedBody = await started.json();
    const sessionId = startedBody.session.id as string;

    const firstBody = {
      actionId: "practice-action-0001",
      sequence: 1,
      priorStateHash: startedBody.session.stateHash,
      intent: { type: "DRAW_STOCK" },
    };
    const first = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        firstBody,
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    const firstResponse = await first.json();
    expect(first.status).toBe(200);
    expect(firstResponse.idempotentReplay).toBe(false);

    const exactRetry = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        firstBody,
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    const exactRetryBody = await exactRetry.json();
    expect(exactRetry.status).toBe(200);
    expect(exactRetryBody.idempotentReplay).toBe(true);
    expect(exactRetryBody.outcome).toEqual(firstResponse.outcome);
    expect(exactRetryBody.currentSession.sequence).toBe(1);

    const changedRetry = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        {
          ...firstBody,
          sequence: 2,
          priorStateHash: firstResponse.currentSession.stateHash,
        },
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    expect(changedRetry.status).toBe(409);
    expect((await changedRetry.json()).rejection.code).toBe(
      "IDEMPOTENCY_CONFLICT",
    );

    const stale = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        {
          actionId: "practice-action-stale",
          sequence: 2,
          priorStateHash: startedBody.session.stateHash,
          intent: { type: "DRAW_STOCK" },
        },
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).rejection.code).toBe(
      "STATE_HASH_MISMATCH",
    );

    const outOfOrder = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        {
          actionId: "practice-action-0003",
          sequence: 3,
          priorStateHash: firstResponse.currentSession.stateHash,
          intent: { type: "DRAW_STOCK" },
        },
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    expect(outOfOrder.status).toBe(409);
    expect((await outOfOrder.json()).rejection.code).toBe(
      "OUT_OF_ORDER_SEQUENCE",
    );
    expect(getDemoStore().rejectedGameCommandAttempts).toHaveLength(3);
    expect(
      getDemoStore().rejectedGameCommandAttempts.map(
        (attempt) => attempt.rejectionCode,
      ),
    ).toEqual([
      "IDEMPOTENCY_CONFLICT",
      "STATE_HASH_MISMATCH",
      "OUT_OF_ORDER_SEQUENCE",
    ]);
    expect(
      getDemoStore().rejectedGameCommandAttempts.every(
        (attempt) =>
          /^[a-f0-9]{64}$/.test(attempt.requestHash) &&
          /^[a-f0-9]{64}$/.test(attempt.stateHashAtRejection),
      ),
    ).toBe(true);
    expect(Object.isFrozen(getDemoStore().rejectedGameCommandAttempts[0])).toBe(
      true,
    );
    expect(Object.isFrozen(getDemoStore().rejectedGameCommandAttempts)).toBe(
      true,
    );
  });

  it("separates an original retry outcome from the newer current session", async () => {
    const cookie = await playerCookie("late-retry@example.test");
    const started = await startSession(
      request("/api/game/sessions", "POST", { mode: "PRACTICE" }, cookie),
    );
    const startedBody = await started.json();
    const sessionId = startedBody.session.id as string;
    const firstCommand = {
      actionId: "late-retry-action-0001",
      sequence: 1,
      priorStateHash: startedBody.session.stateHash,
      intent: { type: "DRAW_STOCK" },
    };
    const first = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        firstCommand,
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    const firstBody = await first.json();
    expect(first.status).toBe(200);

    const second = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        {
          actionId: "late-retry-action-0002",
          sequence: 2,
          priorStateHash: firstBody.currentSession.stateHash,
          intent: { type: "DRAW_STOCK" },
        },
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    const secondBody = await second.json();
    expect(second.status).toBe(200);

    const retry = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        firstCommand,
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    const retryBody = await retry.json();
    expect(retry.status).toBe(200);
    expect(retryBody.idempotentReplay).toBe(true);
    expect(retryBody.outcome).toEqual(firstBody.outcome);
    expect(retryBody.currentSession.sequence).toBe(2);
    expect(retryBody.currentSession.stateHash).toBe(
      secondBody.currentSession.stateHash,
    );
    expect(retryBody.currentSession.validMoveCount).toBe(
      secondBody.currentSession.validMoveCount,
    );
    expect(retryBody.outcome.acceptedSequence).toBe(1);
    expect(retryBody.outcome.acceptedStateHash).not.toBe(
      retryBody.currentSession.stateHash,
    );
  });

  it("accepts an exact retry of a terminal move without duplicate terminal audit", async () => {
    const cookie = await playerCookie("terminal-retry@example.test");
    const started = await startSession(
      request("/api/game/sessions", "POST", { mode: "PRACTICE" }, cookie),
    );
    const startedBody = await started.json();
    const sessionId = startedBody.session.id as string;
    const command = {
      actionId: "terminal-retry-action-0001",
      sequence: 1,
      priorStateHash: startedBody.session.stateHash,
      intent: { type: "ABANDON" },
    };
    const first = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        command,
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.currentSession.status).toBe("ABANDONED");

    const retry = await submitMove(
      request(
        `/api/game/sessions/${sessionId}/moves`,
        "POST",
        command,
        cookie,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    const retryBody = await retry.json();
    expect(retry.status).toBe(200);
    expect(retryBody.idempotentReplay).toBe(true);
    expect(retryBody.outcome).toEqual(firstBody.outcome);
    expect(retryBody.currentSession.status).toBe("ABANDONED");
    expect(
      getDemoStore().auditEvents.filter(
        (event) => event.eventType === "GAME_SESSION_ABANDONED",
      ),
    ).toHaveLength(1);
  });

  it("blocks new sessions after all-product self-exclusion", async () => {
    const cookie = await playerCookie();
    const initial = await startSession(
      request("/api/game/sessions", "POST", { mode: "PRACTICE" }, cookie),
    );
    const initialBody = await initial.json();
    const activeSessionId = initialBody.session.id as string;
    const exclusion = await selfExclude(
      request(
        "/api/responsible-play/self-exclusion",
        "POST",
        {
          scope: "ALL_PRODUCTS",
          duration: "90_DAYS",
          confirm: true,
        },
        cookie,
      ),
    );
    expect(exclusion.status).toBe(201);

    const started = await startSession(
      request("/api/game/sessions", "POST", { mode: "PRACTICE" }, cookie),
    );
    expect(started.status).toBe(403);
    expect((await started.json()).error.code).toBe("SELF_EXCLUDED");

    const activeMove = await submitMove(
      request(
        `/api/game/sessions/${activeSessionId}/moves`,
        "POST",
        {
          actionId: "blocked-action-0001",
          sequence: 1,
          priorStateHash: initialBody.session.stateHash,
          intent: { type: "DRAW_STOCK" },
        },
        cookie,
      ),
      { params: Promise.resolve({ sessionId: activeSessionId }) },
    );
    expect(activeMove.status).toBe(403);
    expect((await activeMove.json()).error.code).toBe("SELF_EXCLUDED");
  });

  it("gives every ranked entrant the identical validated deal", async () => {
    const firstCookie = await playerCookie("first-ranked@example.test");
    const secondCookie = await playerCookie("second-ranked@example.test");

    const first = await enterCompetition(
      request(
        `/api/competitions/${CURATED_COMPETITION_ID}/enter`,
        "POST",
        {},
        firstCookie,
      ),
      { params: Promise.resolve({ competitionId: CURATED_COMPETITION_ID }) },
    );
    const second = await enterCompetition(
      request(
        `/api/competitions/${CURATED_COMPETITION_ID}/enter`,
        "POST",
        {},
        secondCookie,
      ),
      { params: Promise.resolve({ competitionId: CURATED_COMPETITION_ID }) },
    );
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(firstBody.session.dealCommitment).toBe(
      secondBody.session.dealCommitment,
    );
    expect(firstBody.session.tableau).toEqual(secondBody.session.tableau);
    expect(firstBody.session.stock).toEqual(secondBody.session.stock);
    expect(firstBody.session.competitionEntryId).not.toBe(
      secondBody.session.competitionEntryId,
    );
  });

  it("accepts appeals only for sessions owned by the player", async () => {
    const ownerCookie = await playerCookie("appeal-owner@example.test");
    const otherCookie = await playerCookie("appeal-other@example.test");
    const started = await startSession(
      request(
        "/api/game/sessions",
        "POST",
        { mode: "PRACTICE" },
        ownerCookie,
      ),
    );
    const sessionId = (await started.json()).session.id as string;
    const appealBody = {
      gameSessionId: sessionId,
      subject: "Move validation review",
      statement:
        "Please review the recorded server-authoritative move sequence.",
    };

    const forbidden = await submitAppeal(
      request("/api/appeals", "POST", appealBody, otherCookie),
    );
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe(
      "GAME_SESSION_FORBIDDEN",
    );
    expect(getDemoStore().appeals).toHaveLength(0);

    const missing = await submitAppeal(
      request(
        "/api/appeals",
        "POST",
        { ...appealBody, gameSessionId: "missing-session" },
        ownerCookie,
      ),
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe(
      "GAME_SESSION_NOT_FOUND",
    );
    expect(getDemoStore().appeals).toHaveLength(0);

    const accepted = await submitAppeal(
      request("/api/appeals", "POST", appealBody, ownerCookie),
    );
    expect(accepted.status).toBe(201);
    expect((await accepted.json()).appeal.gameSessionId).toBe(sessionId);
    expect(getDemoStore().appeals).toHaveLength(1);
  });

  it("completes the curated competition through 97 server-validated moves", async () => {
    const cookie = await playerCookie("proof-player@example.test");
    const entered = await enterCompetition(
      request(
        `/api/competitions/${CURATED_COMPETITION_ID}/enter`,
        "POST",
        {},
        cookie,
      ),
      { params: Promise.resolve({ competitionId: CURATED_COMPETITION_ID }) },
    );
    const enteredBody = await entered.json();
    const sessionId = enteredBody.session.id as string;
    let priorStateHash = enteredBody.session.stateHash as string;

    let finalSession: Record<string, unknown> | undefined;
    for (const [index, proofEvent] of getCuratedCompetitionBundle().validation.proof.events.entries()) {
      const sequence = index + 1;
      const response = await submitMove(
        request(
          `/api/game/sessions/${sessionId}/moves`,
          "POST",
          {
            actionId: `browser-proof-action-${String(sequence).padStart(3, "0")}`,
            sequence,
            priorStateHash,
            intent: proofEvent.intent,
          },
          cookie,
        ),
        { params: Promise.resolve({ sessionId }) },
      );
      expect(response.status, `move ${sequence}`).toBe(200);
      const responseBody = await response.json();
      finalSession = responseBody.currentSession;
      priorStateHash = responseBody.currentSession.stateHash;
    }

    expect(finalSession).toMatchObject({
      status: "WON",
      validMoveCount: 97,
      serverAuthoritative: true,
    });

    const leaderboard = await getCompetitionLeaderboard(
      request(
        `/api/competitions/${CURATED_COMPETITION_ID}/leaderboard`,
        "GET",
      ),
      { params: Promise.resolve({ competitionId: CURATED_COMPETITION_ID }) },
    );
    const leaderboardBody = await leaderboard.json();
    expect(leaderboardBody.standings).toHaveLength(1);
    expect(leaderboardBody.standings[0]).toMatchObject({
      rank: 1,
      completed: true,
      validMoves: 97,
    });
  });

  it("completes an unranked practice deal through the same 97-command validator", async () => {
    const cookie = await playerCookie("practice-proof-player@example.test");
    const started = await startSession(
      request("/api/game/sessions", "POST", { mode: "PRACTICE" }, cookie),
    );
    const startedBody = await started.json();
    const sessionId = startedBody.session.id as string;
    let priorStateHash = startedBody.session.stateHash as string;
    let finalSession: Record<string, unknown> | undefined;

    for (const [index, intent] of createCuratedSolutionIntents().entries()) {
      const sequence = index + 1;
      const response = await submitMove(
        request(
          `/api/game/sessions/${sessionId}/moves`,
          "POST",
          {
            actionId: `practice-proof-action-${String(sequence).padStart(3, "0")}`,
            sequence,
            priorStateHash,
            intent,
          },
          cookie,
        ),
        { params: Promise.resolve({ sessionId }) },
      );
      expect(response.status, `practice move ${sequence}`).toBe(200);
      const responseBody = await response.json();
      finalSession = responseBody.currentSession;
      priorStateHash = responseBody.currentSession.stateHash;
    }

    expect(finalSession).toMatchObject({
      mode: "PRACTICE",
      status: "WON",
      validMoveCount: 97,
      dealGeneratorVersion: "CURATED_SOLVABLE_V1",
      serverAuthoritative: true,
    });
    expect(getDemoStore().officialScores).toHaveLength(0);
  });
});
