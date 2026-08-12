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

  it("keeps Robot Combat on the Free side with an honest development status", () => {
    const robotCombat = getGameTitleByKey("SGW_ROBOT_COMBAT");
    expect(robotCombat).toMatchObject({
      workingTitle: "Robot Combat",
      side: "FREE",
      category: "SKILL",
      valueClass: "NO_VALUE",
      legalOfferingClass: "NOT_APPLICABLE",
      developmentStatus: "IN_DEVELOPMENT",
      matchPlayAvailable: true,
      routes: {
        marketing: "/robot-combat",
        development: "/app/robot-combat",
      },
    });
  });

  it("keeps the unfinished game visible in the development catalog", () => {
    expect(getFreeDevelopmentTitles().map((entry) => entry.key)).toContain(
      "SGW_ROBOT_COMBAT",
    );
  });

  it("rejects prohibited BattleBots branding in catalog entries", () => {
    for (const entry of getPublicGameTitles()) {
      expect(containsProhibitedRobotCombatBrand(entry.workingTitle)).toBe(false);
      expect(containsProhibitedRobotCombatBrand(entry.publicSummary)).toBe(false);
      expect(containsProhibitedRobotCombatBrand(entry.key)).toBe(false);
    }
  });
});
