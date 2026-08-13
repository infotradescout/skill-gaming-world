import {
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return routeFiles(path);
    }
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  });
}

describe("held-operation route inventory", () => {
  it("has no unreviewed writable API route", () => {
    const apiRoot = resolve(process.cwd(), "src", "app", "api");
    const writableRoutes = routeFiles(apiRoot)
      .filter((path) =>
        /export\s+(?:(?:async\s+)?function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map((path) =>
        relative(apiRoot, path)
          .replaceAll("\\", "/")
          .replace(/\/route\.ts$/, ""),
      )
      .toSorted();

    expect(writableRoutes).toEqual(
      [
        "account/close",
        "appeals",
        "auth/login",
        "auth/logout",
        "auth/register",
        "competitions/[competitionId]/enter",
        "game/sessions",
        "game/sessions/[sessionId]/moves",
        "play-coins/sandbox-purchase",
        "responsible-play/cooldown",
        "responsible-play/self-exclusion",
        "robot-combat/builds",
        "robot-combat/matches",
        "robot-combat/matches/[matchId]/commands",
        "robot-combat/matches/[matchId]/join",
        "robot-combat/test-bay",
        "robot-combat/test-bay/[sessionId]/commands",
      ].toSorted(),
    );

    const heldFragments = [
      "casino",
      "cash",
      "deposit",
      "payout",
      "prize",
      "redeem",
      "redemption",
      "social-casino",
      "transfer",
      "wager",
      "withdraw",
    ];
    for (const route of writableRoutes) {
      expect(
        heldFragments.some((fragment) => route.includes(fragment)),
        route,
      ).toBe(false);
    }

    expect(writableRoutes).not.toContain("fortune-dice");
  });
});
