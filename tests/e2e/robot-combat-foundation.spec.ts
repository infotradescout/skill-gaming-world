import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function registerPlayer(page: import("@playwright/test").Page) {
  const identity = randomUUID().slice(0, 12);
  const email = `robot-${identity}@example.test`;
  const password = "Robot-combat-safe-demo-2026";
  await page.goto("/auth/register");
  await page.getByLabel("Display name").fill(`Robot player ${identity}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.locator('input[name="termsAccepted"]').check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app(?:\?welcome=1)?$/);
}

test("Robot Combat public page describes the workshop-first product truth", async ({ page }) => {
  await page.goto("/robot-combat");

  await expect(
    page.getByRole("heading", { name: "Build the machine. Learn what it does.", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/workshop and arena are being built as one product/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /enter the workshop/i })).toHaveAttribute(
    "href",
    "/auth/login",
  );
  await expect(page.getByText(/In active development/i)).toBeVisible();
  await expect(page.getByText(/no wagering, deposit, prize, payout/i)).toBeVisible();
});

test("authenticated workshop saves an inspected revision and opens a match", async ({ page }) => {
  await registerPlayer(page);
  await page.goto("/app/robot-combat");

  await expect(page.getByRole("heading", { name: "Robot Combat", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inspect & save revision" }).click();
  await expect(page.getByText(/Revision \d+ saved/i)).toBeVisible();
  await expect(page.getByText("Inspection valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open a free 1v1 match" }).click();
  await expect(page.getByText("WAITING_FOR_OPPONENT", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Enter authority arena" }).click();
  await expect(page).toHaveURL(/\/app\/robot-combat\/matches\//);
  await expect(page.getByRole("heading", { name: "Authority arena", exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for another builder", { exact: true })).toBeVisible();
});

test("two builders can ready, control, damage, and report a match", async ({ page, browser }) => {
  await registerPlayer(page);
  await page.goto("/app/robot-combat");
  await page.getByRole("button", { name: "Inspect & save revision" }).click();
  await expect(page.getByText(/Revision \d+ saved/i)).toBeVisible();
  await page.getByRole("button", { name: "Open a free 1v1 match" }).click();
  await expect(page.getByText("WAITING_FOR_OPPONENT", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Enter authority arena" }).click();
  await expect(page).toHaveURL(/\/app\/robot-combat\/matches\//);
  const matchId = new URL(page.url()).pathname.split("/").at(-1);

  const opponentContext = await browser.newContext();
  const opponentPage = await opponentContext.newPage();
  try {
    await registerPlayer(opponentPage);
    await opponentPage.goto("/app/robot-combat");
    await opponentPage.getByRole("button", { name: "Inspect & save revision" }).click();
    await expect(opponentPage.getByText(/Revision \d+ saved/i)).toBeVisible();
    await opponentPage.getByLabel("Join an existing match").fill(matchId ?? "");
    await opponentPage.getByRole("button", { name: "Join with this revision" }).click();
    await expect(opponentPage.getByText("READY_CHECK", { exact: true })).toBeVisible();
    await opponentPage.getByRole("link", { name: "Enter authority arena" }).click();

    await expect(page.getByText("READY CHECK", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ready this machine" }).click();
    await opponentPage.getByRole("button", { name: "Ready this machine" }).click();
    await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
    await expect(opponentPage.getByText("ACTIVE", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Drive forward" }).click();
    for (let hit = 0; hit < 6; hit += 1) {
      await page.getByRole("button", { name: "Fire weapon" }).click();
    }
    await expect(page.getByText("Match report ready", { exact: true })).toBeVisible();
    await expect(page.getByText("Machine A won", { exact: true })).toBeVisible();
    await expect(opponentPage.getByText("Questions for your next revision", { exact: true })).toBeVisible();
  } finally {
    await opponentContext.close();
  }
});
