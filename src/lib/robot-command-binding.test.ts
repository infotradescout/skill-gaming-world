import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { robotCommandBindingMatches, robotCommandPayload } from "./robot-command-binding";

const command = { type: "CONTROL", slot: "A", throttle: 1, steering: 0 };
const receipt = { playerId: "owner-a", commandPayload: robotCommandPayload(command) };

describe("robot action binding", () => {
  it("accepts an exact retry by its original player", () => {
    assert.equal(robotCommandBindingMatches(receipt, "owner-a", robotCommandPayload(command)), true);
  });
  it("accepts equivalent JSON with reordered object keys", () => {
    assert.equal(robotCommandBindingMatches(receipt, "owner-a", {
      steering: 0, slot: "A", type: "CONTROL", throttle: 1,
    }), true);
  });
  it("rejects reuse by the other match participant", () => {
    assert.equal(robotCommandBindingMatches(receipt, "owner-b", robotCommandPayload(command)), false);
  });
  it("rejects altered controls", () => {
    assert.equal(robotCommandBindingMatches(receipt, "owner-a", { ...command, throttle: -1 }), false);
  });
  it("rejects a different action type", () => {
    assert.equal(robotCommandBindingMatches(receipt, "owner-a", { type: "FIRE", slot: "A" }), false);
  });
  it("rejects changed tick amounts", () => {
    assert.equal(robotCommandBindingMatches({ playerId: "owner-a", commandPayload: { type: "TICK", elapsedMs: 120 } },
      "owner-a", { type: "TICK", elapsedMs: 250 }), false);
  });
  it("rejects a receipt without its original actor", () => {
    assert.equal(robotCommandBindingMatches({ ...receipt, playerId: null }, "owner-a", robotCommandPayload(command)), false);
  });
  it("normalizes optional undefined fields like persisted JSON", () => {
    assert.deepEqual(robotCommandPayload({ type: "FIRE", slot: "A", unused: undefined }), { type: "FIRE", slot: "A" });
  });
  it("copies nested payloads so later mutation cannot rewrite a receipt", () => {
    const input = { type: "SUBMIT_BUILD", blueprint: { name: "before", parts: [{ partKey: "chassis.light" }] } };
    const payload = robotCommandPayload(input);
    input.blueprint.parts[0].partKey = "chassis.heavy";
    assert.equal(robotCommandBindingMatches({ playerId: "owner-a", commandPayload: payload }, "owner-a", robotCommandPayload(input)), false);
  });
});
