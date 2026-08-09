import { expect, test } from "@playwright/test";

test("Bay 13 public page launches free training without Legal Play claims", async ({ page }) => {
  await page.goto("/robot-combat");

  await expect(
    page.getByRole("heading", { name: "Bay 13: The Scrapyard", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/No paid entry, wager, cash prize/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /play bay 13/i })).toHaveAttribute(
    "href",
    "/games/bay-13/index.html",
  );
  await expect(page.getByText(/Hosted player-versus-player matchmaking is not live yet/i)).toBeVisible();
});
