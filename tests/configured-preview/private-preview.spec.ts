import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for configured-preview verification.`);
  }
  return value;
}

const ownerEmail = requiredEnvironment("PREVIEW_OWNER_EMAIL").toLowerCase();
const ownerPassword = requiredEnvironment("PREVIEW_OWNER_PASSWORD");
if (ownerPassword.length < 12) {
  throw new Error(
    "PREVIEW_OWNER_PASSWORD must contain at least 12 characters.",
  );
}

function configuredOrigin(page: Page): string {
  const baseURL = page.context().pages()[0]?.url();
  if (baseURL && baseURL !== "about:blank") {
    return new URL(baseURL).origin;
  }
  return new URL(requiredEnvironment("PREVIEW_BASE_URL")).origin;
}

async function assertConfiguredHealth(page: Page) {
  const response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toBe(
    "noindex, nofollow, noarchive",
  );
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    mode: "configured",
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
}

async function assertGenericNonOwnerDenial(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    headers: { origin: configuredOrigin(page) },
    data: {
      email: `denied-${randomUUID()}@example.invalid`,
      password: ownerPassword,
    },
  });

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      code: "INVALID_CREDENTIALS",
      message: "Email or password is incorrect.",
    },
  });
}

async function registerOwnerIfNeeded(page: Page) {
  await page.goto("/auth/register");
  await page.getByLabel("Display name").fill("Preview Owner");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(ownerPassword);
  await page.getByLabel("Confirm password").fill(ownerPassword);
  await page.locator('input[name="termsAccepted"]').check();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/auth/register",
  );
  await page.getByRole("button", { name: "Create account" }).click();
  const response = await responsePromise;
  expect([201, 409]).toContain(response.status());

  if (response.status() === 201) {
    await expect(page).toHaveURL(/\/app$/);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    return;
  }

  await expect(page.getByRole("alert")).toContainText(
    "An account already exists for this email.",
  );
  await page.goto("/auth/login");
}

async function loginOwner(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(ownerPassword);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/auth/login",
  );
  await page.getByRole("button", { name: "Log in" }).click();
  const response = await responsePromise;

  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Your next deliberate move." }),
  ).toBeVisible();
}

async function assertPracticeReload(page: Page) {
  await page.goto("/app/monetaire/practice");
  await page.getByRole("button", { name: "Start or resume" }).click();
  await expect(page.getByText("Authoritative session")).toBeVisible();

  const beforeReload = await page.evaluate(async () => {
    const sessionId = window.localStorage.getItem(
      "monetaire.practice.session-id",
    );
    if (!sessionId) throw new Error("Practice session id was not stored.");
    const response = await fetch(`/api/game/sessions/${sessionId}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Practice session could not be read.");
    const body = await response.json();
    return {
      sessionId,
      stateHash: body.session.stateHash as string,
    };
  });

  await page.reload();
  await page.getByRole("button", { name: "Start or resume" }).click();
  await expect(
    page.getByText("Server session resumed from its authoritative state."),
  ).toBeVisible();

  const afterReload = await page.evaluate(async (sessionId) => {
    const response = await fetch(`/api/game/sessions/${sessionId}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Practice session did not survive reload.");
    const body = await response.json();
    return {
      sessionId: body.session.id as string,
      stateHash: body.session.stateHash as string,
    };
  }, beforeReload.sessionId);

  expect(afterReload).toEqual(beforeReload);
}

async function assertHeldOperations(page: Page) {
  const gatesResponse = await page.request.get("/api/feature-gates");
  expect(gatesResponse.status()).toBe(200);
  const gates = await gatesResponse.json();
  for (const key of [
    "play_coin.package.production",
    "mode.monetaire_prize",
    "prize.payout",
    "mode.social_casino",
    "social_casino.game_execution",
    "mode.real_money_casino",
    "casino.deposit",
    "casino.wager",
    "casino.withdrawal",
    "casino.game_execution",
  ]) {
    expect(gates.gates[key].decision, key).toBe("DENY");
  }
  expect(gates.environmentRequests).toEqual({
    monetairePrize: false,
    socialCasino: false,
    realMoneyCasino: false,
    productionPayments: false,
  });

  const sandboxResponse = await page.request.post(
    "/api/play-coins/sandbox-purchase",
    {
      headers: { origin: configuredOrigin(page) },
      data: {
        packageKey: "PRACTICE_1000",
        idempotencyKey: `configured-preview-${randomUUID()}`,
        acknowledgeSandboxOnly: true,
      },
    },
  );
  expect(sandboxResponse.status()).toBe(503);
  await expect(sandboxResponse.json()).resolves.toMatchObject({
    error: { code: "SANDBOX_ONLY" },
  });

  await page.goto("/casino");
  await expect(
    page.getByRole("heading", { name: /Casino is\s*not available\./ }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No casino games, deposits, wagers, cash balances, or withdrawals are exposed in the current product.",
    ),
  ).toBeVisible();
}

async function assertAdminDenied(page: Page) {
  const apiResponse = await page.request.get("/api/admin/audit");
  expect(apiResponse.status()).toBe(403);
  await expect(apiResponse.json()).resolves.toMatchObject({
    error: { code: "ADMIN_ROLE_REQUIRED" },
  });

  await page.goto("/admin/feature-gates");
  await expect(page).toHaveURL(/\/app$/);
}

test("configured private preview is owner-only, persistent, and held", async ({
  page,
}) => {
  await assertConfiguredHealth(page);
  await assertGenericNonOwnerDenial(page);
  await registerOwnerIfNeeded(page);
  await loginOwner(page);
  await assertPracticeReload(page);
  await assertHeldOperations(page);
  await assertAdminDenied(page);
});
