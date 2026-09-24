import { mkdir, readFile, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The safe demo allows eight anonymous registrations per rolling minute.
// Pace real UI submissions across Playwright workers and retries, leaving the
// server's limiter and every registration request unchanged.
const REGISTRATION_SPACING_MS = 10_000;
const LOCK_TIMEOUT_MS = 10_000;
const MAX_SCHEDULE_WAIT_MS = 240_000;

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function reserveRegistrationSlot(): Promise<void> {
  const info = test.info();
  test.setTimeout(Math.max(info.timeout, 300_000));
  const outputDir = info.project.outputDir;
  await mkdir(outputDir, { recursive: true });
  const lockDir = join(outputDir, ".registration-schedule.lock");
  const scheduleFile = join(outputDir, ".registration-schedule.json");
  const lockStartedAt = Date.now();

  while (true) {
    try {
      await mkdir(lockDir);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() - lockStartedAt >= LOCK_TIMEOUT_MS) {
        throw new Error(`Registration schedule lock timed out: ${lockDir}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  let slotAt: number;
  try {
    let lastSlotAt = 0;
    try {
      const saved = JSON.parse(await readFile(scheduleFile, "utf8")) as { lastSlotAt?: unknown };
      if (!Number.isSafeInteger(saved.lastSlotAt) || Number(saved.lastSlotAt) < 0) {
        throw new Error(`Invalid registration schedule: ${scheduleFile}`);
      }
      lastSlotAt = Number(saved.lastSlotAt);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    const now = Date.now();
    slotAt = Math.max(now, lastSlotAt + REGISTRATION_SPACING_MS);
    if (slotAt - now > MAX_SCHEDULE_WAIT_MS) {
      throw new Error(`Registration schedule wait exceeds ${MAX_SCHEDULE_WAIT_MS} ms`);
    }
    await writeFile(scheduleFile, JSON.stringify({ lastSlotAt: slotAt }), "utf8");
  } finally {
    await rmdir(lockDir);
  }

  const waitMs = Math.max(0, slotAt - Date.now());
  console.info(`[registration-schedule] ${info.project.name} slot=${new Date(slotAt).toISOString()} waitMs=${waitMs}`);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

export async function submitPacedRegistration(page: Page): Promise<void> {
  await reserveRegistrationSlot();
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === "/api/auth/register" &&
        candidate.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  console.info(`[registration-schedule] ${test.info().project.name} registrationStatus=${response.status()}`);
  expect(response.status()).toBe(201);
}
