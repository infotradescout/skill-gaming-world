import assert from "node:assert/strict";
import { describe, it } from "vitest";
import journal from "../../drizzle/meta/_journal.json";
import { hasRequiredMigrationHistory } from "./migration-readiness";

const core = "0009_monetaire_two_account_reality";
const robot = "0010_robot-combat-foundation";
const receipts = journal.entries.map((entry) => ({ createdAt: entry.when, hash: "a".repeat(64) }));

describe("required migration identities", () => {
  it("accepts the complete recorded history", () => {
    assert.equal(hasRequiredMigrationHistory(receipts, core), true);
    assert.equal(hasRequiredMigrationHistory(receipts, robot), true);
  });
  it("does not report Robot Combat ready with ten migrations", () => {
    assert.equal(hasRequiredMigrationHistory(receipts.slice(0, 10), core), true);
    assert.equal(hasRequiredMigrationHistory(receipts.slice(0, 10), robot), false);
  });
  it("rejects an unrelated eleventh migration", () => {
    assert.equal(hasRequiredMigrationHistory([
      ...receipts.slice(0, 10), { createdAt: 9999999999999, hash: "b".repeat(64) },
    ], robot), false);
  });
  it("rejects missing earlier history despite the same row count", () => {
    assert.equal(hasRequiredMigrationHistory([
      ...receipts.slice(1), { createdAt: 9999999999999, hash: "b".repeat(64) },
    ], robot), false);
  });
  it("rejects duplicated migration identities", () => {
    assert.equal(hasRequiredMigrationHistory([...receipts, receipts[0]], robot), false);
  });
  it("rejects missing or malformed recorded hashes", () => {
    for (const hash of [undefined, "", "not-a-hash"]) {
      assert.equal(hasRequiredMigrationHistory([{ ...receipts[0], hash }, ...receipts.slice(1)], robot), false);
    }
  });
  it("accepts PostgreSQL bigint string results", () => {
    assert.equal(hasRequiredMigrationHistory(receipts.map((row) => ({ ...row, createdAt: String(row.createdAt) })), robot), true);
  });
  it("fails closed for an unknown boundary", () => {
    assert.equal(hasRequiredMigrationHistory(receipts, "not-in-the-journal"), false);
  });
  it("rejects malformed source ordering", () => {
    const entries = journal.entries.map((entry) => ({ ...entry }));
    entries[2].when = entries[1].when;
    assert.equal(hasRequiredMigrationHistory(receipts, robot, entries), false);
  });
  it("rejects incorrect source indices", () => {
    const entries = journal.entries.map((entry) => ({ ...entry }));
    entries[2].idx = 8;
    assert.equal(hasRequiredMigrationHistory(receipts, robot, entries), false);
  });
  it("rejects source tags that no longer match their index", () => {
    const entries = journal.entries.map((entry) => ({ ...entry }));
    entries[2].tag = "0099_relabelled";
    assert.equal(hasRequiredMigrationHistory(receipts, robot, entries), false);
  });
  it("does not reject unrelated later receipts when all required identities remain present", () => {
    assert.equal(hasRequiredMigrationHistory([...receipts, { createdAt: 9999999999999, hash: "c".repeat(64) }], robot), true);
  });
});
