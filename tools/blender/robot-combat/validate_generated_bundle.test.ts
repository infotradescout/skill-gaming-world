import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("generated robot combat manifest validator", () => {
  it("documents the expected bundle layout and Free-side manifest rules", () => {
    const validatorPath = resolve(
      process.cwd(),
      "tools/blender/robot-combat/validate_generated_bundle.py",
    );
    const source = readFileSync(validatorPath, "utf8");
    expect(source).toContain("sgw.robot_combat.assets.v1");
    expect(source).toContain('game.get("platform_side") != "FREE"');
    expect(source).toContain('game.get("value_class") != "NO_VALUE"');
    expect(source).toContain('"rammer", "ripper", "maul"');
  });
});
