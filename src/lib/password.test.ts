import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("accepts the correct password and rejects a different password", async () => {
    const encoded = await hashPassword("a-strong-local-test-password");

    expect(encoded).not.toContain("a-strong-local-test-password");
    await expect(
      verifyPassword("a-strong-local-test-password", encoded),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", encoded)).resolves.toBe(false);
  });

  it("rejects an unsupported encoding", async () => {
    await expect(verifyPassword("anything", "plain$text")).resolves.toBe(false);
    await expect(
      verifyPassword("anything", "scrypt$zz$00"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword("anything", `scrypt$${"00".repeat(16)}$0`),
    ).resolves.toBe(false);
  });
});
