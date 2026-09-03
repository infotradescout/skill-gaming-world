import { describe, expect, it } from "vitest";
import { checkpointView } from "./BuildPanel.tsx";

describe("checkpointView", () => {
  it("separates SI's understanding from its first three recommendations", () => {
    const view = checkpointView(`A shared pantry that helps neighbors reduce food waste.

1. Start with a simple item board.
2. Let neighbors reserve an item.
3. Show pickup status clearly.
4. Add delivery later.

What I need from you
- Choose the neighborhood.`);

    expect(view).toEqual({
      understanding: "A shared pantry that helps neighbors reduce food waste.",
      recommendations: [
        "Start with a simple item board.",
        "Let neighbors reserve an item.",
        "Show pickup status clearly.",
      ],
    });
  });
});

