import { describe, expect, it } from "vitest";

import {
  containsProhibitedRobotCombatBrand,
  GAME_TITLE_CATALOG,
  getFreeDevelopmentTitles,
  getGameTitleByKey,
  getPublicGameTitles,
} from "./game-titles";

describe("canonical game title catalog", () => {
  it("registers Monetaire and SGW Robot Combat with unique keys", () => {
    const keys = GAME_TITLE_CATALOG.map((entry) => entry.key);
    expect(keys).toEqual(["MONETAIRE_SOLITAIRE", "SGW_ROBOT_COMBAT"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps SGW Robot Combat on the Free side with no-value development status", () => {
    const robotCombat = getGameTitleByKey("SGW_ROBOT_COMBAT");
    expect(robotCombat).toMatchObject({
      workingTitle: "SGW Robot Combat",
      side: "FREE",
      category: "SKILL",
      valueClass: "NO_VALUE",
      legalOfferingClass: "NOT_APPLICABLE",
      developmentStatus: "IN_DEVELOPMENT",
      matchPlayAvailable: false,
      routes: {
        marketing: "/robot-combat",
        development: "/app/robot-combat",
      },
    });
  });

  it("does not expose match play for the in-development robot combat title", () => {
    for (const entry of getFreeDevelopmentTitles()) {
      expect(entry.matchPlayAvailable).toBe(false);
    }
  });

  it("rejects prohibited BattleBots branding in catalog entries", () => {
    for (const entry of getPublicGameTitles()) {
      expect(containsProhibitedRobotCombatBrand(entry.workingTitle)).toBe(false);
      expect(containsProhibitedRobotCombatBrand(entry.publicSummary)).toBe(false);
      expect(containsProhibitedRobotCombatBrand(entry.key)).toBe(false);
    }
  });
});
