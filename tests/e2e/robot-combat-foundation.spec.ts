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
  const mirrorLink = page.getByRole("link", { name: "Open the live 3D authority mirror", exact: true });
  const mirrorHref = await mirrorLink.getAttribute("href");
  expect(mirrorHref).toMatch(/\/app\/robot-combat\/runtime\?matchId=[^&]+&slot=A$/);
  await expect(mirrorLink).toHaveAttribute("target", "_blank");
  const authorityRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/robot-combat/matches/")) authorityRequests.push(request.url());
  });
  await page.goto(mirrorHref ?? "");
  await expect(page).toHaveURL(/\/app\/robot-combat\/runtime\?matchId=[^&]+&slot=A$/);
  await expect(page.getByRole("heading", { name: "Live authority mirror", exact: true })).toBeVisible();
  await expect(page.locator("iframe[title='Robot Combat 3D runtime prototype']")).toHaveAttribute(
    "src",
    /\/games\/robot-combat\/index\.html\?matchId=[^&]+&slot=A$/,
  );
  const liveMatchId = new URL(mirrorHref ?? "", page.url()).searchParams.get("matchId") ?? "";
  await expect.poll(
    () => authorityRequests.some((requestUrl) => requestUrl.includes("/api/robot-combat/matches/" + liveMatchId)),
    { timeout: 15000 },
  ).toBeTruthy();
  await expect(page.locator("iframe[title='Robot Combat 3D runtime prototype']").contentFrame().locator("canvas")).toBeVisible({ timeout: 15000 });
});

test("authenticated app exposes the exported 3D runtime with its boundary stated", async ({ page, request }) => {
  await registerPlayer(page);
  await page.goto("/app/robot-combat/runtime");

  await expect(page.getByRole("heading", { name: "Workshop and arena prototype", exact: true })).toBeVisible();
  await expect(page.getByText(/Open it from a live match/i)).toBeVisible();
  await expect(page.locator("iframe[title='Robot Combat 3D runtime prototype']")).toHaveAttribute(
    "src",
    "/games/robot-combat/index.html",
  );

  const artifact = await request.get("/games/robot-combat/index.html");
  expect(artifact.ok()).toBeTruthy();
  await expect(artifact.text()).resolves.toContain("Robot Combat Prototype");
});

test("authenticated workshop opens a private test bay and records consequences before rebuild", async ({ page }) => {
  await registerPlayer(page);
  await page.goto("/app/robot-combat");
  await page.getByRole("button", { name: "Inspect & save revision" }).click();
  await expect(page.getByText(/Revision \d+ saved/i)).toBeVisible();
  await page.getByRole("button", { name: "Enter private test bay" }).click();
  await expect(page).toHaveURL(/\/app\/robot-combat\/test-bay\//);
  await expect(page.getByRole("heading", { name: "Private test bay", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Learn what the machine does", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Drive toward contact gate" }).click();
  for (let tick = 0; tick < 6; tick += 1) {
    await page.getByRole("button", { name: "Advance test clock" }).click();
  }
  await page.getByRole("button", { name: "Record contact" }).click();
  await expect(page.getByText("Contact consequence", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use weapon" }).click();
  await expect(page.getByText("Weapon consequence", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset private test" }).click();
  await expect(page.getByText("Private test reset. The saved machine is ready for another trial.", { exact: true })).toBeVisible();
  await expect(page.getByText("No consequence recorded yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rebuild this machine", exact: true })).toHaveAttribute(
    "href",
    "/app/robot-combat",
  );
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
