import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { submitPacedRegistration } from "./registration-pacer";

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
  await submitPacedRegistration(page);
  await expect(page).toHaveURL(/\/app(?:\?welcome=1)?$/);
}

test("Robot Combat public page states the free build-and-fight boundary", async ({ page }) => {
  await page.goto("/robot-combat");

  await expect(page.getByRole("heading", { name: "Build & fight.", exact: true })).toBeVisible();
  await expect(page.getByText(/choose the parts, test the machine, and take your build onto the free arena floor/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter the garage" })).toHaveAttribute(
    "href",
    "/auth/register",
  );
  await expect(page.getByText(/Robot Combat is in active development/i)).toBeVisible();
  await expect(page.getByText(/the current free game has no entry fee, wagering, deposits, valuable prizes, or payouts/i)).toBeVisible();
  await expect(page.getByText("Assemble", { exact: true })).toBeVisible();
  await expect(page.getByText("Inspect", { exact: true })).toBeVisible();
  await expect(page.getByText("Fight", { exact: true })).toBeVisible();
});

test("authenticated workshop saves an inspected revision and opens a match", async ({ page }) => {
  await registerPlayer(page);
  await page.goto("/app/robot-combat");

  await expect(page.getByRole("heading", { name: "Build & fight.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build your contender.", exact: true })).toBeVisible();
  const [saveResponse] = await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/robot-combat/builds" &&
      response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Save build & check it" }).click(),
  ]);
  expect(saveResponse.status()).toBe(201);
  const saved = (await saveResponse.json()).build as {
    id: string;
    latestRevision: number;
    revisions: Array<{ revision: number; inspection: { valid: boolean } }>;
  };
  expect(saved.id).toBeTruthy();
  expect(saved.latestRevision).toBeGreaterThan(0);
  expect(saved.revisions.at(-1)?.revision).toBe(saved.latestRevision);
  expect(saved.revisions.at(-1)?.inspection.valid).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Build saved. Your machine is ready to test." })).toBeVisible();
  await expect(page.getByText("Ready to test", { exact: true })).toBeVisible();
  await expect(page.getByText("Weight", { exact: true })).toBeVisible();

  const [matchResponse] = await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/robot-combat/matches" &&
      response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Open a free match" }).click(),
  ]);
  expect(matchResponse.status()).toBe(201);
  expect(matchResponse.request().postDataJSON()).toEqual(
    expect.objectContaining({ buildId: saved.id, revision: saved.latestRevision }),
  );
  const match = (await matchResponse.json()).match as {
    matchId: string;
    phase: string;
    players: { A?: { inspection?: { valid: boolean } } };
  };
  expect(match.matchId).toBeTruthy();
  expect(match.phase).toBe("WAITING_FOR_OPPONENT");
  expect(match.players.A?.inspection?.valid).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Match opened. Share the code with another builder." })).toBeVisible();
  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
  const arenaLink = page.getByRole("link", { name: "Open match arena" });
  await expect(arenaLink).toHaveAttribute("href", `/app/robot-combat/matches/${match.matchId}`);
  await arenaLink.click();
  await expect(page).toHaveURL(/\/app\/robot-combat\/matches\//);
  await expect(page.getByRole("heading", { name: "The arena", exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for another builder", { exact: true })).toBeVisible();
  const mirrorLink = page.getByRole("link", { name: "Open the 3D match view", exact: true });
  const mirrorHref = await mirrorLink.getAttribute("href");
  expect(mirrorHref).toMatch(/\/app\/robot-combat\/runtime\?matchId=[^&]+&slot=A$/);
  await expect(mirrorLink).toHaveAttribute("target", "_blank");
  const authorityRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/robot-combat/matches/")) authorityRequests.push(request.url());
  });
  await page.goto(mirrorHref ?? "");
  await expect(page).toHaveURL(/\/app\/robot-combat\/runtime\?matchId=[^&]+&slot=A$/);
  await expect(page.getByRole("heading", { name: "Live arena view", exact: true })).toBeVisible();
  await expect(page.locator("iframe[title='Robot Combat visual arena']")).toHaveAttribute(
    "src",
    /\/games\/robot-combat\/index\.html\?matchId=[^&]+&slot=A$/,
  );
  const liveMatchId = new URL(mirrorHref ?? "", page.url()).searchParams.get("matchId") ?? "";
  await expect.poll(
    () => authorityRequests.some((requestUrl) => requestUrl.includes("/api/robot-combat/matches/" + liveMatchId)),
    { timeout: 15000 },
  ).toBeTruthy();
  await expect(page.locator("iframe[title='Robot Combat visual arena']").contentFrame().locator("canvas")).toBeVisible({ timeout: 15000 });
});

test("authenticated app exposes the exported 3D runtime with its boundary stated", async ({ page, request }) => {
  await registerPlayer(page);
  await page.goto("/app/robot-combat/runtime");

  await expect(page.getByRole("heading", { name: "Workshop preview", exact: true })).toBeVisible();
  await expect(page.getByText(/Preview the visual build and arena view/i)).toBeVisible();
  await expect(page.getByText(/This view is a visual preview of the Robot Combat world and remains separate from the match controls/i)).toBeVisible();
  await expect(page.locator("iframe[title='Robot Combat visual arena']")).toHaveAttribute(
    "src",
    "/games/robot-combat/index.html",
  );

  const artifact = await request.get("/games/robot-combat/index.html");
  expect(artifact.ok()).toBeTruthy();
  await expect(artifact.text()).resolves.toContain("Robot Combat Prototype");
});

test("authenticated workshop opens a private test bay and records consequences before rebuild", async ({ page }) => {
  type PrivateTestState = {
    matchId: string;
    mode: string;
    phase: string;
    elapsedMs: number;
    testReport?: {
      controlsAccepted: number;
      contacts: number;
      weaponUses: number;
      resets: number;
      consequences: Array<{ kind: string; damage: number }>;
    };
  };
  await registerPlayer(page);
  await page.goto("/app/robot-combat");
  const [saveResponse] = await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/robot-combat/builds" &&
      response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Save build & check it" }).click(),
  ]);
  expect(saveResponse.status()).toBe(201);
  const saved = (await saveResponse.json()).build as {
    id: string;
    latestRevision: number;
    revisions: Array<{ revision: number; inspection: { valid: boolean } }>;
  };
  expect(saved.id).toBeTruthy();
  expect(saved.latestRevision).toBeGreaterThan(0);
  expect(saved.revisions.at(-1)?.revision).toBe(saved.latestRevision);
  expect(saved.revisions.at(-1)?.inspection.valid).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Build saved. Your machine is ready to test." })).toBeVisible();
  await expect(page.getByText("Ready to test", { exact: true })).toBeVisible();

  const [createResponse] = await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/robot-combat/test-bay" &&
      response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Open private test" }).click(),
  ]);
  expect(createResponse.status()).toBe(201);
  expect(createResponse.request().postDataJSON()).toEqual(
    expect.objectContaining({ buildId: saved.id, revision: saved.latestRevision }),
  );
  await expect(page).toHaveURL(/\/app\/robot-combat\/test-bay\/[^/]+$/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  expect(sessionId).toBeTruthy();
  const retrieval = await page.request.get(`/api/robot-combat/test-bay/${sessionId}`);
  expect(retrieval.status()).toBe(200);
  const privateTest = (await retrieval.json()).test as PrivateTestState;
  expect(privateTest.matchId).toBe(sessionId);
  expect(privateTest.mode).toBe("PRIVATE_TEST");
  expect(privateTest.phase).toBe("ACTIVE");
  await expect(page.getByRole("heading", { name: "Private test bay", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Learn what the machine does", exact: true })).toBeVisible();

  async function sendAction(label: string, commandType: string): Promise<PrivateTestState> {
    const [response] = await Promise.all([
      page.waitForResponse((candidate) =>
        new URL(candidate.url()).pathname === `/api/robot-combat/test-bay/${privateTest.matchId}/commands` &&
        candidate.request().method() === "POST",
      ),
      page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    expect(response.status(), label).toBe(200);
    expect(response.request().postDataJSON().command.type).toBe(commandType);
    const result = (await response.json()) as { accepted: boolean; test: PrivateTestState };
    expect(result.accepted, label).toBe(true);
    expect(result.test.matchId).toBe(privateTest.matchId);
    return result.test;
  }

  const driven = await sendAction("Drive toward contact gate", "CONTROL");
  expect(driven.testReport?.controlsAccepted).toBeGreaterThan(0);
  let ticked: PrivateTestState | undefined;
  for (let tick = 0; tick < 6; tick += 1) {
    ticked = await sendAction("Advance test clock", "TICK");
  }
  expect(ticked?.elapsedMs).toBeGreaterThan(0);
  const contact = await sendAction("Record contact", "TEST_CONTACT");
  expect(contact.testReport?.contacts).toBeGreaterThan(0);
  expect(contact.testReport?.consequences.some((item) => item.kind === "CONTACT" && item.damage > 0)).toBe(true);
  await expect(page.getByText("Contact consequence", { exact: true })).toBeVisible();
  const weapon = await sendAction("Use weapon", "FIRE");
  expect(weapon.testReport?.weaponUses).toBeGreaterThan(0);
  expect(weapon.testReport?.consequences.some((item) => item.kind === "WEAPON" && item.damage > 0)).toBe(true);
  await expect(page.getByText("Weapon consequence", { exact: true })).toBeVisible();
  const reset = await sendAction("Reset private test", "RESET_TEST");
  expect(reset.testReport).toMatchObject({
    controlsAccepted: 0,
    contacts: 0,
    weaponUses: 0,
    resets: 1,
    consequences: [],
  });
  await expect(page.getByText("Private test reset. The saved machine is ready for another trial.", { exact: true })).toBeVisible();
  await expect(page.getByText("No consequence recorded yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rebuild this machine", exact: true })).toHaveAttribute(
    "href",
    "/app/robot-combat",
  );
});

test("two builders can ready, control, damage, and report a match", async ({ page, browser }) => {
  type SavedBuild = {
    id: string;
    latestRevision: number;
    revisions: Array<{ revision: number; inspection: { valid: boolean } }>;
  };
  type MatchSnapshot = {
    matchId: string;
    phase: string;
    players: {
      A?: { playerId: string; inspection?: { valid: boolean } };
      B?: { playerId: string; inspection?: { valid: boolean } };
    };
    robots: { B?: { integrity: number; damageLog: Array<{ damage: number }> } };
    winnerSlot?: string;
    terminalReason?: string;
  };

  await registerPlayer(page);
  await page.goto("/app/robot-combat");
  const [firstSave] = await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/robot-combat/builds" &&
      response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Save build & check it" }).click(),
  ]);
  expect(firstSave.status()).toBe(201);
  const firstBuild = ((await firstSave.json()) as { build: SavedBuild }).build;
  expect(firstBuild.id).toBeTruthy();
  expect(firstBuild.latestRevision).toBeGreaterThan(0);
  expect(firstBuild.revisions.at(-1)?.revision).toBe(firstBuild.latestRevision);
  expect(firstBuild.revisions.at(-1)?.inspection.valid).toBe(true);

  const [createResponse] = await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/robot-combat/matches" &&
      response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Open a free match" }).click(),
  ]);
  expect(createResponse.status()).toBe(201);
  expect(createResponse.request().postDataJSON()).toEqual(
    expect.objectContaining({ buildId: firstBuild.id, revision: firstBuild.latestRevision }),
  );
  const created = ((await createResponse.json()) as { match: MatchSnapshot }).match;
  expect(created.matchId).toBeTruthy();
  expect(created.phase).toBe("WAITING_FOR_OPPONENT");
  expect(created.players.A?.inspection?.valid).toBe(true);
  expect(created.players.B).toBeUndefined();
  await expect(page.getByRole("link", { name: "Open match arena" })).toHaveAttribute(
    "href",
    `/app/robot-combat/matches/${created.matchId}`,
  );
  await page.getByRole("link", { name: "Open match arena" }).click();
  await expect(page.getByText("Waiting for another builder", { exact: true })).toBeVisible();

  const opponentContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const opponentPage = await opponentContext.newPage();
  try {
    await registerPlayer(opponentPage);
    await opponentPage.goto("/app/robot-combat");
    await opponentPage.getByRole("button", { name: /Striker/ }).click();
    const [secondSave] = await Promise.all([
      opponentPage.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/robot-combat/builds" &&
        response.request().method() === "POST",
      ),
      opponentPage.getByRole("button", { name: "Save build & check it" }).click(),
    ]);
    expect(secondSave.status()).toBe(201);
    const secondBuild = ((await secondSave.json()) as { build: SavedBuild }).build;
    expect(secondBuild.id).toBeTruthy();
    expect(secondBuild.id).not.toBe(firstBuild.id);
    expect(secondBuild.latestRevision).toBeGreaterThan(0);
    expect(secondBuild.revisions.at(-1)?.revision).toBe(secondBuild.latestRevision);
    expect(secondBuild.revisions.at(-1)?.inspection.valid).toBe(true);

    await opponentPage.getByLabel("Join with a match code").fill(created.matchId);
    const [joinResponse] = await Promise.all([
      opponentPage.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/robot-combat/matches/${created.matchId}/join` &&
        response.request().method() === "POST",
      ),
      opponentPage.getByRole("button", { name: "Join match" }).click(),
    ]);
    expect(joinResponse.status()).toBe(200);
    expect(joinResponse.request().postDataJSON()).toEqual(
      expect.objectContaining({ buildId: secondBuild.id, revision: secondBuild.latestRevision }),
    );
    const joined = ((await joinResponse.json()) as { match: MatchSnapshot }).match;
    expect(joined.matchId).toBe(created.matchId);
    expect(joined.phase).toBe("READY_CHECK");
    expect(joined.players.A?.playerId).toBe(created.players.A?.playerId);
    expect(joined.players.B?.playerId).toBeTruthy();
    expect(joined.players.B?.playerId).not.toBe(joined.players.A?.playerId);
    expect(joined.players.A?.inspection?.valid).toBe(true);
    expect(joined.players.B?.inspection?.valid).toBe(true);
    await opponentPage.getByRole("link", { name: "Open match arena" }).click();
    await expect(opponentPage.getByText("Both machines must be ready", { exact: true })).toBeVisible();
    await expect(page.getByText("Both machines must be ready", { exact: true })).toBeVisible();

    const readyPath = `/api/robot-combat/matches/${created.matchId}/commands`;
    const [firstReady] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === readyPath && response.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Ready my machine" }).click(),
    ]);
    expect(firstReady.status()).toBe(200);
    expect(firstReady.request().postDataJSON().command).toEqual({ type: "READY", slot: "A" });
    const firstReadyResult = (await firstReady.json()) as { accepted: boolean; match: MatchSnapshot };
    expect(firstReadyResult.accepted).toBe(true);
    expect(firstReadyResult.match.phase).toBe("READY_CHECK");

    const [secondReady] = await Promise.all([
      opponentPage.waitForResponse((response) =>
        new URL(response.url()).pathname === readyPath && response.request().method() === "POST",
      ),
      opponentPage.getByRole("button", { name: "Ready my machine" }).click(),
    ]);
    expect(secondReady.status()).toBe(200);
    expect(secondReady.request().postDataJSON().command).toEqual({ type: "READY", slot: "B" });
    const secondReadyResult = (await secondReady.json()) as { accepted: boolean; match: MatchSnapshot };
    expect(secondReadyResult.accepted).toBe(true);
    expect(secondReadyResult.match.phase).toBe("ACTIVE");
    await expect(page.getByRole("button", { name: "Drive forward" })).toBeVisible();
    await expect(opponentPage.getByRole("button", { name: "Drive forward" })).toBeVisible();

    const [driveResponse] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === readyPath &&
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.command?.type === "CONTROL",
      ),
      page.getByRole("button", { name: "Drive forward" }).click(),
    ]);
    expect(driveResponse.status()).toBe(200);
    expect(driveResponse.request().postDataJSON().command).toEqual({
      type: "CONTROL", slot: "A", throttle: 1, steering: 0,
    });
    expect(((await driveResponse.json()) as { accepted: boolean }).accepted).toBe(true);

    let latest: MatchSnapshot | undefined;
    for (let shot = 0; shot < 12; shot += 1) {
      const [fireResponse] = await Promise.all([
        page.waitForResponse((response) =>
          new URL(response.url()).pathname === readyPath &&
          response.request().method() === "POST" &&
          response.request().postDataJSON()?.command?.type === "FIRE",
        ),
        page.getByRole("button", { name: "Fire weapon" }).click(),
      ]);
      expect(fireResponse.status()).toBe(200);
      expect(fireResponse.request().postDataJSON().command).toEqual({ type: "FIRE", slot: "A" });
      const fired = (await fireResponse.json()) as { accepted: boolean; match: MatchSnapshot };
      expect(fired.accepted).toBe(true);
      latest = fired.match;
      if (latest.phase === "COMPLETED") break;
    }
    expect(latest?.robots.B?.damageLog.length).toBeGreaterThan(0);
    expect(latest?.robots.B?.damageLog.some((hit) => hit.damage > 0)).toBe(true);
    expect(latest?.phase).toBe("COMPLETED");
    expect(latest?.winnerSlot).toBe("A");
    expect(latest?.terminalReason).toBe("OPPONENT_DISABLED");
    await expect(page.getByText("Match report ready", { exact: true })).toBeVisible();
    await expect(page.getByText("Machine A won", { exact: true })).toBeVisible();
    await expect(opponentPage.getByText("Questions for your next revision", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rebuild this machine" })).toHaveAttribute("href", "/app/robot-combat");
    await expect(opponentPage.getByRole("link", { name: "Rebuild this machine" })).toHaveAttribute("href", "/app/robot-combat");
  } finally {
    await opponentContext.close();
  }
});
