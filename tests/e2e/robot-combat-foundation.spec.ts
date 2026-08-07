import { expect, test } from "@playwright/test";

test("robot combat development page stays honest and non-playable", async ({ page }) => {
  await page.goto("/robot-combat");

  await expect(
    page.getByRole("heading", { name: "SGW Robot Combat", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Foundation only — not playable yet.")).toBeVisible();
  await expect(page.getByText("No paid entry, wager, cash prize")).toBeVisible();
  await expect(page.getByRole("link", { name: /start match/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /start match/i })).toHaveCount(0);
});
