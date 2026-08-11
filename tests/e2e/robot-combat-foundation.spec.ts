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
});
