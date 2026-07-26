import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createCuratedSolutionIntents } from "@/domain";

async function registerPlayer(page: Page) {
  const identity = randomUUID().slice(0, 12);
  const email = `player-${identity}@example.test`;
  const password = "Monetaire-safe-demo-2026";
  await page.goto("/auth/register");
  await page.getByLabel("Display name").fill(`Player ${identity}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.locator('input[name="termsAccepted"]').check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  return { email, password };
}

async function completeCuratedSession(
  page: Page,
  session: { id: string; stateHash: string },
  actionPrefix: string,
) {
  let priorStateHash = session.stateHash;
  let currentSession: Record<string, unknown> | undefined;
  for (const [index, intent] of createCuratedSolutionIntents().entries()) {
    const response = await page.request.post(
      `/api/game/sessions/${session.id}/moves`,
      {
        headers: { origin: "http://127.0.0.1:3000" },
        data: {
          actionId: `${actionPrefix}-${String(index + 1).padStart(3, "0")}-${randomUUID()}`,
          sequence: index + 1,
          priorStateHash,
          intent,
        },
      },
    );
    expect(response.status(), `${actionPrefix} move ${index + 1}`).toBe(200);
    const responseBody = await response.json();
    currentSession = responseBody.currentSession;
    priorStateHash = responseBody.currentSession.stateHash;
  }
  return currentSession as {
    id: string;
    status: string;
    stateHash: string;
    validMoveCount: number;
  };
}

test("public landing page states the noncash product boundary", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Your decisions\.\s*The same deal\./ }),
  ).toBeVisible();
  await expect(page.getByText("Play Coins have no cash value.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Monetaire Play does not award cash or valuable prizes.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Casino cash wagering is not currently available.").first(),
  ).toBeVisible();
});

test("account access, held modes, and Play Coin exact retry remain coherent", async ({
  page,
}) => {
  const player = await registerPlayer(page);

  await expect(
    page.getByRole("heading", { name: "Your next deliberate move." }),
  ).toBeVisible();
  await expect(page.getByText("Practice available")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.getByLabel("Email").fill(player.email);
  await page.getByLabel("Password").fill(player.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Your next deliberate move." }),
  ).toBeVisible();

  await page.goto("/admin/feature-gates");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/eligibility");
  await expect(page.getByText("Safe demo only")).toBeVisible();
  await expect(page.getByText("Disabled", { exact: true })).toHaveCount(2);

  const requestBody = {
    packageKey: "PRACTICE_1000",
    idempotencyKey: `e2e-sandbox-${randomUUID()}`,
    acknowledgeSandboxOnly: true,
  };
  const first = await page.request.post("/api/play-coins/sandbox-purchase", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: requestBody,
  });
  const firstBody = await first.json();
  expect(first.status()).toBe(201);
  expect(firstBody.entry.chargedRealMoney).toBe(false);

  const retry = await page.request.post("/api/play-coins/sandbox-purchase", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: requestBody,
  });
  const retryBody = await retry.json();
  expect(retry.status()).toBe(200);
  expect(retryBody.duplicate).toBe(true);
  expect(retryBody.entry.transactionId).toBe(firstBody.entry.transactionId);

  await page.goto("/app/wallet");
  await expect(page.locator(".wallet-balance strong")).toHaveText("1,000");
  await expect(page.locator(".wallet-entry")).toHaveCount(1);
  await expect(page.locator(".wallet-entry")).toContainText(
    "Local sandbox simulation; no card was charged.",
  );
});

test("practice and competition use authoritative state and exact retries", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "desktop-chromium") {
    test.slow();
  }
  await registerPlayer(page);
  await page.goto("/app/monetaire/practice");

  await page.getByRole("button", { name: "Start or resume" }).click();
  await expect(page.getByText("Authoritative session")).toBeVisible();
  await page.getByRole("button", { name: /Draw from stock/ }).click();
  await expect(page.getByText("Stock draw accepted by the server.")).toBeVisible();
  await expect(page.locator(".game-metrics")).toContainText("Valid moves1");

  await page.reload();
  await page.getByRole("button", { name: "Start or resume" }).click();
  await expect(
    page.getByText("Server session resumed from its authoritative state."),
  ).toBeVisible();
  await expect(page.locator(".game-metrics")).toContainText("Valid moves1");

  const startResponse = await page.request.post("/api/game/sessions", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: { mode: "PRACTICE" },
  });
  expect(startResponse.status()).toBe(201);
  const started = await startResponse.json();
  const command = {
    actionId: `e2e-exact-retry-${randomUUID()}`,
    sequence: 1,
    priorStateHash: started.session.stateHash,
    intent: { type: "DRAW_STOCK" },
  };
  const first = await page.request.post(
    `/api/game/sessions/${started.session.id}/moves`,
    {
      headers: { origin: "http://127.0.0.1:3000" },
      data: command,
    },
  );
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.outcome.event.stateHashBefore).toBe(
    started.session.stateHash,
  );
  expect(firstBody.outcome.acceptedStateHash).toBe(
    firstBody.currentSession.stateHash,
  );

  const exactRetry = await page.request.post(
    `/api/game/sessions/${started.session.id}/moves`,
    {
      headers: { origin: "http://127.0.0.1:3000" },
      data: command,
    },
  );
  const exactRetryBody = await exactRetry.json();
  expect(exactRetry.status()).toBe(200);
  expect(exactRetryBody.idempotentReplay).toBe(true);
  expect(exactRetryBody.outcome).toEqual(firstBody.outcome);

  const changedRetry = await page.request.post(
    `/api/game/sessions/${started.session.id}/moves`,
    {
      headers: { origin: "http://127.0.0.1:3000" },
      data: { ...command, intent: { type: "ABANDON" } },
    },
  );
  expect(changedRetry.status()).toBe(409);
  expect((await changedRetry.json()).rejection.code).toBe(
    "IDEMPOTENCY_CONFLICT",
  );

  if (testInfo.project.name === "desktop-chromium") {
    const completionStart = await page.request.post("/api/game/sessions", {
      headers: { origin: "http://127.0.0.1:3000" },
      data: { mode: "PRACTICE" },
    });
    expect(completionStart.status()).toBe(201);
    const completionStartBody = await completionStart.json();
    expect(completionStartBody.session.dealGeneratorVersion).toBe(
      "CURATED_SOLVABLE_V1",
    );
    const completedPractice = await completeCuratedSession(
      page,
      completionStartBody.session,
      "e2e-practice-proof",
    );
    expect(completedPractice).toMatchObject({
      status: "WON",
      validMoveCount: 97,
    });
    await page.evaluate((sessionId) => {
      window.localStorage.setItem(
        "monetaire.practice.session-id",
        sessionId,
      );
    }, completedPractice.id);
    await page.goto("/app/monetaire/practice");
    await page.getByRole("button", { name: "Start or resume" }).click();
    await expect(
      page.getByRole("heading", { name: "Foundation complete." }),
    ).toBeVisible();
    await expect(page.getByText("Practice complete")).toBeVisible();
  }

  await page.goto("/app/monetaire/competitions");
  if (testInfo.project.name === "desktop-chromium") {
    await expect(
      page.getByText("No completed official scores are recorded."),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Enter or resume at no cost" }).click();
  await expect(
    page.getByText("Entry and playable server-created session confirmed."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Monetaire competition board" }),
  ).toBeVisible();
  await expect(page.getByText("Noncash competition · Server")).toBeVisible();

  if (testInfo.project.name === "desktop-chromium") {
    const competitionSession = await page.evaluate(async () => {
      const sessionId = window.localStorage.getItem(
        "monetaire.competition.session-id",
      );
      if (!sessionId) throw new Error("competition session id was not stored");
      const response = await fetch(`/api/game/sessions/${sessionId}`, {
        cache: "no-store",
      });
      const body = await response.json();
      return body.session as { id: string; stateHash: string };
    });
    await completeCuratedSession(
      page,
      competitionSession,
      "e2e-competition-proof",
    );

    await page.goto("/app/monetaire/competitions");
    await expect(
      page.getByText("No completed official scores are recorded."),
    ).toHaveCount(0);
    await expect(page.getByText("97 valid moves").first()).toBeVisible();
  }
});

test("cooldown and self-exclusion block practice resume and moves", async ({
  page,
}) => {
  await registerPlayer(page);
  await page.goto("/app/monetaire/practice");
  await page.getByRole("button", { name: "Start or resume" }).click();
  const activeSession = await page.evaluate(async () => {
    const sessionId = window.localStorage.getItem(
      "monetaire.practice.session-id",
    );
    if (!sessionId) throw new Error("practice session id was not stored");
    const response = await fetch(`/api/game/sessions/${sessionId}`, {
      cache: "no-store",
    });
    const body = await response.json();
    return body.session as {
      id: string;
      sequence: number;
      stateHash: string;
    };
  });

  await page.goto("/app/responsible-play");
  await page.getByRole("button", { name: "Start cooldown" }).click();
  await page
    .getByRole("dialog", { name: "Start a 24-hour cooldown?" })
    .getByRole("button", { name: "Confirm request" })
    .click();
  await expect(
    page.getByText(
      "Cooldown confirmed. New sessions are blocked for the recorded period.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Review self-exclusion" }).click();
  await page
    .getByRole("dialog", { name: "Request self-exclusion?" })
    .getByRole("button", { name: "Confirm request" })
    .click();
  await expect(
    page.getByText("Self-exclusion confirmed for the recorded scope."),
  ).toBeVisible();

  const blockedMove = await page.request.post(
    `/api/game/sessions/${activeSession.id}/moves`,
    {
      headers: { origin: "http://127.0.0.1:3000" },
      data: {
        actionId: `e2e-blocked-${randomUUID()}`,
        sequence: activeSession.sequence + 1,
        priorStateHash: activeSession.stateHash,
        intent: { type: "DRAW_STOCK" },
      },
    },
  );
  expect(blockedMove.status()).toBe(403);
  expect((await blockedMove.json()).error.code).toBe("SELF_EXCLUDED");

  await page.goto("/app/monetaire/practice");
  await expect(page).toHaveURL(/\/app\/responsible-play$/);
});

test("casino and privileged admin surfaces remain held", async ({ page }) => {
  await page.goto("/admin/feature-gates");
  await expect(page).toHaveURL(/\/auth\/login$/);

  await page.goto("/casino");
  await expect(
    page.getByRole("heading", { name: /Casino is\s*not available\./ }),
  ).toBeVisible();
  await expect(page.getByText("Server-disabled", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "No casino games, deposits, wagers, cash balances, or withdrawals are exposed in the current product.",
    ),
  ).toBeVisible();

});
