import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { fortuneDiceResult } from "./fortune-dice";

describe("Fortune Dice fairness protocol", () => {
  it("reproduces a committed round deterministically", () => {
    const serverSeed = "82d898fdb6808d9fdc83c3ffaf0770cbfa3ac32eaf4e62bcab3920d5f80f29f7";
    const clientSeed = "player-selected-seed";
    const commitment = createHash("sha256").update(serverSeed).digest("hex");

    expect(commitment).toHaveLength(64);
    expect(fortuneDiceResult(serverSeed, clientSeed, BigInt(17))).toEqual(
      fortuneDiceResult(serverSeed, clientSeed, BigInt(17)),
    );
  });

  it("always derives two valid six-sided dice", () => {
    for (let nonce = 0; nonce < 1_000; nonce += 1) {
      const dice = fortuneDiceResult("server-seed", "client-seed", BigInt(nonce));
      expect(dice[0]).toBeGreaterThanOrEqual(1);
      expect(dice[0]).toBeLessThanOrEqual(6);
      expect(dice[1]).toBeGreaterThanOrEqual(1);
      expect(dice[1]).toBeLessThanOrEqual(6);
    }
  });
});
