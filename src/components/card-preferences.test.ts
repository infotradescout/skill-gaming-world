import { describe, expect, it } from "vitest";

import {
  DEFAULT_CARD_PREFERENCES,
  mergeCardPreferences,
  sanitizeCardPreferences,
} from "./card-preferences";

describe("Monetaire card appearance preferences", () => {
  it("defaults to the established Monetaire front and back", () => {
    expect(sanitizeCardPreferences(null)).toBe(DEFAULT_CARD_PREFERENCES);
  });

  it("validates card fronts and backs independently", () => {
    expect(sanitizeCardPreferences({ front: "midnight", back: "invalid" })).toEqual({
      front: "midnight",
      back: "monetaire",
    });
  });

  it("changes one surface without changing the other", () => {
    const frontChanged = mergeCardPreferences(DEFAULT_CARD_PREFERENCES, {
      front: "parchment",
    });
    const backChanged = mergeCardPreferences(frontChanged, { back: "shipyard" });
    expect(frontChanged).toEqual({ front: "parchment", back: "monetaire" });
    expect(backChanged).toEqual({ front: "parchment", back: "shipyard" });
  });
});
