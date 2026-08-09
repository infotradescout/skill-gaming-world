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

  it("keeps Bay 13 on the Free side with no-value playable status", () => {
    const robotCombat = getGameTitleByKey("SGW_ROBOT_COMBAT");
    expect(robotCombat).toMatchObject({
      workingTitle: "Bay 13: The Scrapyard",
      side: "FREE",
      category: "SKILL",
      valueClass: "NO_VALUE",
      legalOfferingClass: "NOT_APPLICABLE",
      developmentStatus: "ACTIVE",
      matchPlayAvailable: true,
      routes: {
        marketing: "/robot-combat",
        development: "/app/robot-combat",
      },
    });
  });

  it("does not leave the playable title in the development-only catalog", () => {
    expect(getFreeDevelopmentTitles().map((entry) => entry.key)).not.toContain(
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
