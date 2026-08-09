import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { createCuratedSolutionIntents, type MoveIntent } from "@/domain";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const expectedTargetId = requiredEnvironment("PREVIEW_E2E_TARGET_ID");
const expectedDatabaseFingerprint = requiredEnvironment(
  "PREVIEW_DATABASE_FINGERPRINT",
);

type PublicSession = {
  id: string;
  mode: "NONCASH_COMPETITION";
  competitionEntryId: string;
  rulesetVersion: string;
  dealGeneratorVersion: string;
  dealCommitment: string;
  stateHash: string;
  status: "ACTIVE" | "WON" | "ABANDONED";
  sequence: number;
  validMoveCount: number;
  stock: { remaining: number };
  tableau: unknown;
};

function previewOrigin(): string {
  const raw = process.env.PREVIEW_BASE_URL?.trim();
  if (!raw) throw new Error("PREVIEW_BASE_URL is required.");
  const origin = new URL(raw).origin;
  if (origin === "https://skill-gaming-world.onrender.com") {
    throw new Error("Two-account proof refuses the production origin.");
  }
  return origin;
}

function originHeader(page: Page): string {
  return new URL(page.url()).origin;
}

async function registerOrdinaryAccount(
  page: Page,
  displayName: string,
): Promise<void> {
  await page.goto("/");
  const response = await page.request.post("/api/auth/register", {
    headers: { origin: originHeader(page) },
    data: {
      displayName,
      email: `${displayName.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}@example.test`,
      password: `Configured-${randomUUID()}-safe`,
      acceptPlayCoinTerms: true,
    },
  });
  expect(response.status()).toBe(201);
  await expect(response.json()).resolves.toMatchObject({
    environment: "configured",
    user: { displayName },
  });
}

async function currentCompetition(page: Page) {
  const response = await page.request.get("/api/competitions");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    competitions: Array<{
      competitionId: string;
      status: "PUBLISHED" | "ACTIVE";
      rulesetVersion: string;
      dealCommitment: string;
      entryCount: number;
      standings: Array<{
        entryId: string;
        rank: number;
        tied: boolean;
        completed: boolean;
      }>;
    }>;
    cashPrizesAvailable: boolean;
    valuablePrizesAvailable: boolean;
  };
  expect(body.competitions).toHaveLength(1);
  expect(body).toMatchObject({
    cashPrizesAvailable: false,
    valuablePrizesAvailable: false,
  });
  return body.competitions[0];
}

async function activeCompetition(page: Page) {
  let latest: Awaited<ReturnType<typeof currentCompetition>> | undefined;
  await expect
    .poll(
      async () => {
        latest = await currentCompetition(page);
        return latest.status;
      },
      { timeout: 20_000 },
    )
    .toBe("ACTIVE");
  return latest!;
}

async function enterCompetition(
  page: Page,
  competitionId: string,
): Promise<PublicSession> {
  const response = await page.request.post(
    `/api/competitions/${competitionId}/enter`,
    { headers: { origin: originHeader(page) } },
  );
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { session: PublicSession };
  expect(body.session).toMatchObject({
    mode: "NONCASH_COMPETITION",
    status: "ACTIVE",
    sequence: 0,
  });
  return body.session;
}

async function submitMove(
  page: Page,
  session: PublicSession,
  intent: MoveIntent,
  actionId = `configured-proof-${randomUUID()}`,
) {
  const response = await page.request.post(
    `/api/game/sessions/${session.id}/moves`,
    {
      headers: { origin: originHeader(page) },
      data: {
        actionId,
        sequence: session.sequence + 1,
        priorStateHash: session.stateHash,
        intent,
      },
    },
  );
  const body = (await response.json()) as {
    accepted?: boolean;
    idempotentReplay?: boolean;
    outcome?: unknown;
    rejection?: { code: string; message: string };
    currentSession?: PublicSession;
    error?: { code: string; message: string };
  };
  return { response, body };
}

async function playCoinSnapshot(page: Page) {
  const response = await page.request.get("/api/play-coins");
  expect(response.status()).toBe(200);
  return response.json();
}

async function assertIsolatedVerificationTarget(page: Page): Promise<void> {
  const response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    mode: "configured",
    verificationTarget: {
      id: expectedTargetId,
      databaseFingerprint: expectedDatabaseFingerprint,
    },
    operations: {
      monetairePlay: true,
      monetairePrize: false,
      socialCasino: false,
      realMoneyCasino: false,
      productionPayments: false,
    },
  });
}

async function closeContext(context: BrowserContext): Promise<void> {
  await context.close().catch(() => undefined);
}

test("two configured accounts share one deal while state, access, and results remain separate", async ({
  browser,
  page: accountA,
}) => {
  test.setTimeout(120_000);

  const accountBContext = await browser.newContext({ baseURL: previewOrigin() });
  const accountB = await accountBContext.newPage();

  try {
    await assertIsolatedVerificationTarget(accountA);
    await registerOrdinaryAccount(accountA, "Account Alpha");
    await registerOrdinaryAccount(accountB, "Account Beta");
    const [playCoinsBeforeA, playCoinsBeforeB] = await Promise.all([
      playCoinSnapshot(accountA),
      playCoinSnapshot(accountB),
    ]);

    const competition = await activeCompetition(accountA);
    expect(competition.rulesetVersion).toBe("KLONDIKE_DRAW_THREE_V2");
    const baselineEntryCount = competition.entryCount;
    const expectedActiveRank =
      competition.standings.filter((standing) => standing.completed).length + 1;

    let sessionA = await enterCompetition(
      accountA,
      competition.competitionId,
    );
    let sessionB = await enterCompetition(
      accountB,
      competition.competitionId,
    );

    expect(sessionA.id).not.toBe(sessionB.id);
    expect(sessionA.competitionEntryId).not.toBe(
      sessionB.competitionEntryId,
    );
    expect(sessionA.dealCommitment).toBe(sessionB.dealCommitment);
    expect(sessionA.dealCommitment).toBe(competition.dealCommitment);
    expect(sessionA.rulesetVersion).toBe("KLONDIKE_DRAW_THREE_V2");
    expect(sessionA.rulesetVersion).toBe(sessionB.rulesetVersion);
    expect(sessionA.dealGeneratorVersion).toBe(
      sessionB.dealGeneratorVersion,
    );
    expect(sessionA.stock).toEqual(sessionB.stock);
    expect(sessionA.tableau).toEqual(sessionB.tableau);

    const activeAfterEntry = await currentCompetition(accountA);
    expect(activeAfterEntry.entryCount).toBe(baselineEntryCount + 2);
    expect(activeAfterEntry.standings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: sessionA.competitionEntryId,
          rank: expectedActiveRank,
          tied: true,
          completed: false,
        }),
        expect.objectContaining({
          entryId: sessionB.competitionEntryId,
          rank: expectedActiveRank,
          tied: true,
          completed: false,
        }),
      ]),
    );
    const activeStandingA = activeAfterEntry.standings.find(
      (standing) => standing.entryId === sessionA.competitionEntryId,
    );
    const activeStandingB = activeAfterEntry.standings.find(
      (standing) => standing.entryId === sessionB.competitionEntryId,
    );
    expect(activeStandingA).toMatchObject({ completed: false, tied: true });
    expect(activeStandingB).toMatchObject({
      completed: false,
      rank: activeStandingA?.rank,
      tied: true,
    });
    await Promise.all([accountA.goto("/app"), accountB.goto("/app")]);
    for (const page of [accountA, accountB]) {
      const rank = page === accountA ? activeStandingA?.rank : activeStandingB?.rank;
      await expect(page.locator(".stat", { hasText: "Current rank" })).toContainText(
        `#${rank} · tied`,
      );
    }

    const forbiddenRead = await accountB.request.get(
      `/api/game/sessions/${sessionA.id}`,
    );
    expect(forbiddenRead.status()).toBe(403);
    await expect(forbiddenRead.json()).resolves.toMatchObject({
      error: { code: "SESSION_FORBIDDEN" },
    });

    const forbiddenMove = await accountB.request.post(
      `/api/game/sessions/${sessionA.id}/moves`,
      {
        headers: { origin: originHeader(accountB) },
        data: {
          actionId: `cross-account-${randomUUID()}`,
          sequence: 1,
          priorStateHash: sessionA.stateHash,
          intent: createCuratedSolutionIntents()[0],
        },
      },
    );
    expect(forbiddenMove.status()).toBe(403);
    await expect(forbiddenMove.json()).resolves.toMatchObject({
      error: { code: "SESSION_FORBIDDEN" },
    });
    const unchanged = await accountA.request.get(
      `/api/game/sessions/${sessionA.id}`,
    );
    await expect(unchanged.json()).resolves.toMatchObject({
      session: { stateHash: sessionA.stateHash, sequence: 0 },
    });

    const rejectedActionId = `expected-rejection-${randomUUID()}`;
    const firstRejected = await submitMove(
      accountB,
      sessionB,
      { type: "WASTE_TO_FOUNDATION" },
      rejectedActionId,
    );
    expect(firstRejected.response.status()).toBe(409);
    expect(firstRejected.body).toMatchObject({
      accepted: false,
      currentSession: {
        id: sessionB.id,
        sequence: 0,
        stateHash: sessionB.stateHash,
      },
    });
    const exactRejectedRetry = await submitMove(
      accountB,
      sessionB,
      { type: "WASTE_TO_FOUNDATION" },
      rejectedActionId,
    );
    expect(exactRejectedRetry.response.status()).toBe(409);
    expect(exactRejectedRetry.body.rejection).toEqual(
      firstRejected.body.rejection,
    );
    expect(exactRejectedRetry.body.currentSession).toMatchObject({
      sequence: 0,
      stateHash: sessionB.stateHash,
    });

    const sessionBBeforeAcceptedMove = sessionB;
    const acceptedActionId = `accepted-retry-${randomUUID()}`;
    const corrected = await submitMove(
      accountB,
      sessionB,
      { type: "DRAW_STOCK" },
      acceptedActionId,
    );
    expect(corrected.response.status()).toBe(200);
    expect(corrected.body.accepted).toBe(true);
    sessionB = corrected.body.currentSession!;
    expect(sessionB.sequence).toBe(1);

    const secondAccepted = await submitMove(
      accountB,
      sessionB,
      { type: "DRAW_STOCK" },
    );
    expect(secondAccepted.response.status()).toBe(200);
    expect(secondAccepted.body.accepted).toBe(true);
    sessionB = secondAccepted.body.currentSession!;
    expect(sessionB.sequence).toBe(2);

    const acceptedRetry = await submitMove(
      accountB,
      sessionBBeforeAcceptedMove,
      { type: "DRAW_STOCK" },
      acceptedActionId,
    );
    expect(acceptedRetry.response.status()).toBe(200);
    expect(acceptedRetry.body).toMatchObject({
      accepted: true,
      idempotentReplay: true,
      currentSession: {
        sequence: sessionB.sequence,
        stateHash: sessionB.stateHash,
      },
    });
    expect(acceptedRetry.body.outcome).toEqual(corrected.body.outcome);

    await accountA.goto("/app/monetaire/competitions");
    await accountB.goto("/app/monetaire/competitions");

    for (const intent of createCuratedSolutionIntents()) {
      const moved = await submitMove(accountA, sessionA, intent);
      expect(moved.response.status()).toBe(200);
      expect(moved.body.accepted).toBe(true);
      sessionA = moved.body.currentSession!;
    }
    expect(sessionA).toMatchObject({
      status: "WON",
      validMoveCount: 81,
      sequence: 81,
    });

    const abandoned = await submitMove(accountB, sessionB, {
      type: "ABANDON",
    });
    expect(abandoned.response.status()).toBe(200);
    sessionB = abandoned.body.currentSession!;
    expect(sessionB.status).toBe("ABANDONED");

    for (const page of [accountA, accountB]) {
      await expect(page.getByText("81 valid moves").first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText("Incomplete").first()).toBeVisible({
        timeout: 20_000,
      });
    }

    const finalCompetition = await currentCompetition(accountA);
    const finalStandingA = finalCompetition.standings.find(
      (standing) => standing.entryId === sessionA.competitionEntryId,
    );
    const finalStandingB = finalCompetition.standings.find(
      (standing) => standing.entryId === sessionB.competitionEntryId,
    );
    expect(finalStandingA?.rank).toEqual(expect.any(Number));
    expect(finalStandingB).toMatchObject({
      completed: false,
      rank: expect.any(Number),
    });
    await accountA.goto("/app");
    await expect(
      accountA.locator(".stat", { hasText: "Current rank" }),
    ).toContainText(
      `#${finalStandingA?.rank}${finalStandingA?.tied ? " · tied" : ""}`,
    );

    await accountA.goto("/account/history");
    await expect(accountA.getByText("Completed score").first()).toBeVisible();
    await expect(accountA.getByText("81 valid moves").first()).toBeVisible();
    await expect(accountA.getByText("81 accepted · 0 rejected")).toBeVisible();
    await expect(
      accountA.locator(".data-row", { hasText: "Clean Sequence" }),
    ).toContainText("Earned");
    await expect(accountA.getByText(`Session ${sessionA.id}`)).toBeVisible();
    await expect(
      accountA.getByText(`Entry ${sessionA.competitionEntryId}`),
    ).toBeVisible();
    await expect(accountA.getByText(`Session ${sessionB.id}`)).toHaveCount(0);
    await expect(accountA.getByText(sessionB.competitionEntryId)).toHaveCount(0);

    await accountB.goto("/app");
    await expect(
      accountB.locator(".stat", { hasText: "Current rank" }),
    ).toContainText(
      `#${finalStandingB?.rank}${finalStandingB?.tied ? " · tied" : ""}`,
    );
    await accountB.goto("/account/history");
    await expect(accountB.getByText("Incomplete score").first()).toBeVisible();
    await expect(accountB.getByText("3 accepted · 1 rejected")).toBeVisible();
    await expect(
      accountB.locator(".data-row", { hasText: "Clean Sequence" }),
    ).toContainText("Not earned");
    await expect(accountB.getByText(`Session ${sessionB.id}`)).toBeVisible();
    await expect(
      accountB.getByText(`Entry ${sessionB.competitionEntryId}`),
    ).toBeVisible();
    await expect(accountB.getByText(`Session ${sessionA.id}`)).toHaveCount(0);
    await expect(accountB.getByText(sessionA.competitionEntryId)).toHaveCount(0);

    const [playCoinsAfterA, playCoinsAfterB] = await Promise.all([
      playCoinSnapshot(accountA),
      playCoinSnapshot(accountB),
    ]);
    expect(playCoinsAfterA).toEqual(playCoinsBeforeA);
    expect(playCoinsAfterB).toEqual(playCoinsBeforeB);
  } finally {
    await closeContext(accountBContext);
  }
});
