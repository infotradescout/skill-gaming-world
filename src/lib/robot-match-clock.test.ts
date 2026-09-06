import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  createRobotMatchState, createRobotTestState, createStarterRobotBlueprint,
  hashRobotMatchState, type RobotMatchState,
} from "../domain/robot-combat";
import {
  applyClockedRobotCommand as apply, advanceRobotServerClock as advance,
  startRobotServerClock, RobotMatchClockError,
} from "./robot-match-clock";

const start = 1_000_000;
function match(): RobotMatchState {
  let state = createRobotMatchState({ matchId: "clocked", arenaKey: "training-floor-01", player: { playerId: "a", displayName: "A" } });
  const commands = [
    { type: "JOIN", playerId: "b", displayName: "B" },
    { type: "SUBMIT_BUILD", slot: "A", blueprint: createStarterRobotBlueprint("PUSHER") },
    { type: "SUBMIT_BUILD", slot: "B", blueprint: createStarterRobotBlueprint("STRIKER") },
    { type: "READY", slot: "A" }, { type: "READY", slot: "B" },
  ] as const;
  for (const command of commands) state = apply(state, command, start).state;
  return state;
}
function movingMatch(): RobotMatchState {
  return apply(match(), { type: "CONTROL", slot: "A", throttle: 1, steering: 0.3 }, start).state;
}
function core(state: RobotMatchState): unknown {
  const { lastEvent, nextSequence, ...rest } = state;
  void lastEvent; void nextSequence;
  return rest;
}

describe("server-owned Robot Combat time", () => {
  it("anchors the epoch when the second player readies", () => assert.deepEqual(match().serverClock, { startedAtMs: start }));
  it("does not start while waiting for an opponent", () => {
    const state = createRobotMatchState({ matchId: "waiting", arenaKey: "floor", player: { playerId: "a", displayName: "A" } });
    assert.equal(advance(state, start), undefined);
    assert.equal(state.serverClock, undefined);
  });
  for (const browserDelta of [0, 1, 120, 250, 60_000, NaN, Infinity]) {
    it(`ignores a browser's claimed ${browserDelta} milliseconds`, () => {
      const result = apply(match(), { type: "TICK", elapsedMs: browserDelta }, start + 1_234);
      assert.equal(result.state.elapsedMs, 1_200);
      assert.equal(result.clock?.event.metadata?.source, "SERVER_CLOCK");
      assert.equal(hashRobotMatchState(result.clock!.state), hashRobotMatchState(result.state));
    });
  }
  it("cannot be accelerated by repeated observations at the same server instant", () => {
    let state = movingMatch();
    const once = apply(state, { type: "TICK", elapsedMs: 250 }, start + 1_200).state;
    for (let index = 0; index < 100; index += 1) state = apply(state, { type: "TICK", elapsedMs: 250 }, start + 1_200).state;
    assert.deepEqual(core(state), core(once));
  });
  for (const interval of [1, 17, 50, 120, 600]) {
    it(`keeps identical movement at ${interval}ms observation intervals`, () => {
      const single = apply(movingMatch(), { type: "TICK", elapsedMs: 0 }, start + 2_000).state;
      let state = movingMatch();
      for (let elapsed = interval; elapsed < 2_000; elapsed += interval) state = apply(state, { type: "TICK", elapsedMs: 250 }, start + elapsed).state;
      state = apply(state, { type: "TICK", elapsedMs: 0 }, start + 2_000).state;
      assert.deepEqual(core(state), core(single));
    });
  }
  it("retains substep remainder across observations", () => {
    let state = match();
    for (const ms of [49, 51, 99, 101]) state = apply(state, { type: "TICK", elapsedMs: 250 }, start + ms).state;
    assert.equal(state.elapsedMs, 100);
    assert.deepEqual(state.serverClock, { startedAtMs: start });
  });
  it("does not reverse time on a backwards server observation", () => {
    const state = apply(movingMatch(), { type: "TICK", elapsedMs: 250 }, start + 1_000).state;
    const backwards = apply(state, { type: "TICK", elapsedMs: 250 }, start - 1_000).state;
    assert.deepEqual(core(backwards), core(state));
  });
  it("separates an accepted time advance from a rejected distant attack", () => {
    const state = match();
    const result = apply(state, { type: "FIRE", slot: "A" }, start + 600);
    assert.equal(result.clock!.event.accepted, true);
    assert.equal(result.event.accepted, false);
    assert.equal(result.clock!.event.sequence + 1, result.event.sequence);
    assert.notEqual(hashRobotMatchState(state), hashRobotMatchState(result.clock!.state));
    assert.equal(hashRobotMatchState(result.clock!.state), hashRobotMatchState(result.state));
  });
  it("recovers identical movement after JSON save and reload", () => {
    const first = apply(movingMatch(), { type: "TICK", elapsedMs: 0 }, start + 1_234).state;
    const restored = JSON.parse(JSON.stringify(first)) as RobotMatchState;
    const expected = apply(first, { type: "TICK", elapsedMs: 0 }, start + 2_000).state;
    const actual = apply(restored, { type: "TICK", elapsedMs: 250 }, start + 2_000).state;
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
    assert.equal(hashRobotMatchState(actual), hashRobotMatchState(expected));
  });
  it("holds excessive moving catch-up without changing the record or inventing a winner", () => {
    const state = movingMatch();
    const before = structuredClone(state);
    assert.throws(() => apply(state, { type: "FIRE", slot: "A" }, start + 60_050), RobotMatchClockError);
    assert.deepEqual(state, before);
    assert.equal(state.winnerSlot, undefined);
  });
  it("fast-forwards long stationary intervals without losing elapsed time", () => {
    const state = apply(match(), { type: "TICK", elapsedMs: 250 }, start + 86_400_000).state;
    assert.equal(state.elapsedMs, 86_400_000);
    assert.equal(state.phase, "ACTIVE");
  });
  it("holds V2 active snapshots without a trusted epoch instead of inventing one", () => {
    const state = match();
    delete state.serverClock;
    assert.throws(() => advance(state, start), RobotMatchClockError);
    assert.equal(state.serverClock, undefined);
  });
  it("keeps historical V1 snapshots unchanged and read-only", () => {
    const state: RobotMatchState = { ...match(), rulesetVersion: "ROBOT_COMBAT_RULES_V1" };
    const result = apply(state, { type: "TICK", elapsedMs: 250 }, start + 100_000);
    assert.equal(result.event.accepted, false);
    assert.equal(hashRobotMatchState(result.state), hashRobotMatchState(state));
  });
  it("does not advance a terminal match or rewrite its outcome", () => {
    const state = apply(match(), { type: "CANCEL", slot: "A", reason: "owner_choice" }, start).state;
    const result = apply(state, { type: "TICK", elapsedMs: 250 }, start + 1_000);
    assert.equal(result.event.accepted, false);
    assert.equal(hashRobotMatchState(result.state), hashRobotMatchState(state));
  });
  it("resets a private test with a new epoch and cleared weapon timing", () => {
    let state = startRobotServerClock(createRobotTestState({ matchId: "private", arenaKey: "bay-13-private-test", player: { playerId: "a", displayName: "A" }, blueprint: createStarterRobotBlueprint("PUSHER") }), start);
    state = apply(state, { type: "CONTROL", slot: "A", throttle: 1, steering: 0 }, start).state;
    state = apply(state, { type: "TICK", elapsedMs: 0 }, start + 1_500).state;
    state = apply(state, { type: "FIRE", slot: "A" }, start + 1_500).state;
    state = apply(state, { type: "RESET_TEST", slot: "A" }, start + 3_000).state;
    assert.equal(state.elapsedMs, 0);
    assert.equal(state.robots.A!.weaponReadyAtMs, 0);
    assert.deepEqual(state.serverClock, { startedAtMs: start + 3_000 });
    state = apply(state, { type: "TICK", elapsedMs: 250 }, start + 3_250).state;
    assert.equal(state.elapsedMs, 250);
  });
  for (const time of [NaN, Infinity, -1, 1.5]) {
    it(`rejects invalid server observation ${time}`, () => assert.throws(() => advance(match(), time), RobotMatchClockError));
  }
});
