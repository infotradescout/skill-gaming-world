import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createRobotMatchState } from "../domain/robot-combat";
import { newerRobotMatchSnapshot } from "./robot-match-snapshot";

const initial = createRobotMatchState({ matchId: "snapshot", arenaKey: "floor", player: { playerId: "a", displayName: "A" } });
const current = { ...initial, nextSequence: 20, elapsedMs: 900 };
describe("Robot Combat response ordering", () => {
  it("ignores an older polling reply", () => assert.equal(newerRobotMatchSnapshot(current, { ...current, nextSequence: 19 }), current));
  it("ignores an equal-sequence duplicate reply", () => assert.equal(newerRobotMatchSnapshot(current, { ...current, elapsedMs: 1_000 }), current));
  it("accepts the newer authoritative snapshot", () => {
    const next = { ...current, nextSequence: 21, elapsedMs: 1_000 };
    assert.equal(newerRobotMatchSnapshot(current, next), next);
  });
  it("rejects a snapshot from another match", () => assert.equal(newerRobotMatchSnapshot(current, { ...current, matchId: "other", nextSequence: 99 }), current));
  it("accepts a newer private reset despite a lower elapsed clock", () => {
    const next = { ...current, mode: "PRIVATE_TEST" as const, nextSequence: 21, elapsedMs: 0 };
    assert.equal(newerRobotMatchSnapshot(current, next), next);
  });
  for (const invalid of [NaN, Infinity, 0.5]) {
    it(`rejects invalid sequence ${invalid}`, () => assert.equal(newerRobotMatchSnapshot(current, { ...current, nextSequence: invalid }), current));
  }
  for (const invalid of [NaN, Infinity, -1]) {
    it(`rejects invalid elapsed time ${invalid}`, () => assert.equal(newerRobotMatchSnapshot(current, { ...current, nextSequence: 21, elapsedMs: invalid }), current));
  }
});
