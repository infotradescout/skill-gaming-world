import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  applyRobotMatchCommand as apply,
  createRobotMatchState,
  createRobotTestState,
  createStarterRobotBlueprint,
  hashRobotMatchState,
  inspectRobotBlueprint,
  ROBOT_COMBAT_RULESET_VERSION,
  type RobotMatchState,
  type RobotStarterArchetype,
} from "./robot-combat";

function match(a: RobotStarterArchetype = "PUSHER", b: RobotStarterArchetype = "STRIKER"): RobotMatchState {
  let state = createRobotMatchState({ matchId: "match-1", arenaKey: "training-floor-01", player: { playerId: "a", displayName: "A" } });
  state = apply(state, { type: "JOIN", playerId: "b", displayName: "B", slot: "B" }).state;
  state = apply(state, { type: "SUBMIT_BUILD", slot: "A", blueprint: createStarterRobotBlueprint(a) }).state;
  state = apply(state, { type: "SUBMIT_BUILD", slot: "B", blueprint: createStarterRobotBlueprint(b) }).state;
  state = apply(state, { type: "READY", slot: "A" }).state;
  return apply(state, { type: "READY", slot: "B" }).state;
}

function advance(state: RobotMatchState, duration: number): RobotMatchState {
  for (let elapsed = 0; elapsed < duration; elapsed += 50) state = apply(state, { type: "TICK", elapsedMs: Math.min(50, duration - elapsed) }).state;
  return state;
}

function closeMatch(a: RobotStarterArchetype = "PUSHER", b: RobotStarterArchetype = "STRIKER"): RobotMatchState {
  const state = apply(match(a, b), { type: "CONTROL", slot: "A", throttle: 1, steering: 0 }).state;
  const approached = advance(state, 4_000);
  return apply(approached, { type: "CONTROL", slot: "A", throttle: 0, steering: 0 }).state;
}

function privateTest(): RobotMatchState {
  return createRobotTestState({ matchId: "test-bay", arenaKey: "bay-13-private-test", player: { playerId: "a", displayName: "A" }, blueprint: createStarterRobotBlueprint("PUSHER") });
}

function rejectedWithoutMutation(state: RobotMatchState, command: Parameters<typeof apply>[1]): void {
  const before = structuredClone(state);
  const result = apply(state, command);
  assert.equal(result.event.accepted, false);
  assert.equal(hashRobotMatchState(result.state), hashRobotMatchState(state));
  assert.deepEqual(state, before);
}

describe("Robot Combat build and historical authority", () => {
  for (const archetype of ["PUSHER", "CONTROL", "STRIKER"] as const) {
    it(`retains inspection validity for ${archetype}`, () => {
      const result = inspectRobotBlueprint(createStarterRobotBlueprint(archetype));
      assert.equal(result.valid, true);
      assert.ok(result.metrics.connectionCount >= 4);
      assert.equal(result.metrics.forcePath, "CONNECTED");
    });
  }
  it("rejects missing and disconnected drives", () => {
    const blueprint = createStarterRobotBlueprint("PUSHER");
    blueprint.parts = blueprint.parts.filter((part) => part.instanceId !== "drive-right");
    blueprint.parts[1].parentInstanceId = "missing";
    const result = inspectRobotBlueprint(blueprint);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "DRIVE_COUNT"));
    assert.ok(result.errors.some((error) => error.code === "PARENT_MISSING"));
  });
  it("changes blueprint identity and inspected mass when a part changes", () => {
    const blueprint = createStarterRobotBlueprint("PUSHER");
    const before = inspectRobotBlueprint(blueprint);
    blueprint.parts.find((part) => part.instanceId === "armor")!.partKey = "armor.bumper";
    const after = inspectRobotBlueprint(blueprint);
    assert.notEqual(before.blueprintHash, after.blueprintHash);
    assert.ok(after.metrics.massKg > before.metrics.massKg);
  });
  it("versions new matches without relabeling historical V1 state", () => {
    const current = match();
    assert.equal(current.rulesetVersion, ROBOT_COMBAT_RULESET_VERSION);
    assert.equal(current.rulesetVersion, "ROBOT_COMBAT_RULES_V2");
    const legacy: RobotMatchState = { ...current, rulesetVersion: "ROBOT_COMBAT_RULES_V1" };
    rejectedWithoutMutation(legacy, { type: "FIRE", slot: "A" });
    assert.equal(legacy.rulesetVersion, "ROBOT_COMBAT_RULES_V1");
  });
  it("requires both inspected builders to ready", () => {
    const created = createRobotMatchState({ matchId: "empty", arenaKey: "training-floor-01", player: { playerId: "a", displayName: "A" } });
    const joined = apply(created, { type: "JOIN", playerId: "b", displayName: "B" }).state;
    rejectedWithoutMutation(joined, { type: "READY", slot: "A" });
    assert.equal(joined.phase, "READY_CHECK");
    assert.equal(joined.robots.A, undefined);
  });
});

describe("Robot Combat movement and combat", () => {
  it("starts separate intact machines facing each other", () => {
    const state = match();
    assert.equal(state.phase, "ACTIVE");
    assert.deepEqual(state.robots.A!.position, { x: 0, z: -3.5 });
    assert.deepEqual(state.robots.B!.position, { x: 0, z: 3.5 });
    assert.equal(state.robots.A!.heading, 0);
    assert.equal(state.robots.B!.heading, Math.PI);
    assert.equal(state.robots.A!.integrity, 100);
    assert.equal(state.robots.B!.integrity, 100);
  });
  for (const weapon of ["PUSHER", "CONTROL", "STRIKER"] as const) {
    it(`${weapon} cannot damage an opponent across the arena`, () => rejectedWithoutMutation(match(weapon), { type: "FIRE", slot: "A" }));
    it(`${weapon} rejects an immediate second strike`, () => {
      const first = apply(closeMatch(weapon), { type: "FIRE", slot: "A" });
      assert.equal(first.event.accepted, true);
      rejectedWithoutMutation(first.state, { type: "FIRE", slot: "A" });
    });
    it(`${weapon} can strike again at its catalog cooldown boundary`, () => {
      const first = apply(closeMatch(weapon), { type: "FIRE", slot: "A" });
      const readyAt = first.state.robots.A!.weaponReadyAtMs!;
      const justBefore = advance(first.state, readyAt - first.state.elapsedMs - 1);
      rejectedWithoutMutation(justBefore, { type: "FIRE", slot: "A" });
      const ready = advance(justBefore, 1);
      assert.equal(apply(ready, { type: "FIRE", slot: "A" }).event.accepted, true);
    });
  }
  it("rejects a near target behind the attacker", () => {
    const state = closeMatch();
    state.robots.A!.heading = Math.PI;
    rejectedWithoutMutation(state, { type: "FIRE", slot: "A" });
  });
  it("requires a weapon module", () => {
    const state = closeMatch();
    state.players.A!.blueprint!.parts = state.players.A!.blueprint!.parts.filter((part) => part.instanceId !== "weapon");
    rejectedWithoutMutation(state, { type: "FIRE", slot: "A" });
  });
  for (const component of ["frame", "weapon", "power"]) {
    for (const form of ["zero", "flag"] as const) {
      it(`blocks fire when ${component} is disabled by ${form}`, () => {
        const state = closeMatch();
        if (form === "zero") state.robots.A!.components[component] = 0;
        else state.robots.A!.disabledComponents.push(component);
        rejectedWithoutMutation(state, { type: "FIRE", slot: "A" });
      });
    }
  }
  for (const component of ["frame", "drive", "power"]) {
    it(`stops movement and rejects drive input with disabled ${component}`, () => {
      const state = apply(match(), { type: "CONTROL", slot: "A", throttle: 1, steering: 1 }).state;
      state.robots.A!.components[component] = 0;
      const before = structuredClone(state.robots.A!.position);
      const advanced = advance(state, 500);
      assert.deepEqual(advanced.robots.A!.position, before);
      assert.equal(advanced.robots.A!.throttle, 0);
      assert.equal(advanced.robots.A!.steering, 0);
      rejectedWithoutMutation(advanced, { type: "CONTROL", slot: "A", throttle: 1, steering: 0 });
      assert.equal(apply(advanced, { type: "CONTROL", slot: "A", throttle: 0, steering: 0 }).event.accepted, true);
    });
  }
  it("wheel and track builds move differently using their catalog speed", () => {
    const wheel = advance(apply(match("PUSHER"), { type: "CONTROL", slot: "A", throttle: 1, steering: 0 }).state, 500);
    const track = advance(apply(match("CONTROL"), { type: "CONTROL", slot: "A", throttle: 1, steering: 0 }).state, 500);
    assert.ok(wheel.robots.A!.position.z > track.robots.A!.position.z);
  });
  it("armor protection reduces damage", () => {
    const lightArmor = apply(closeMatch("PUSHER", "STRIKER"), { type: "FIRE", slot: "A" }).state;
    const heavyArmor = apply(closeMatch("PUSHER", "CONTROL"), { type: "FIRE", slot: "A" }).state;
    assert.ok(heavyArmor.robots.B!.integrity > lightArmor.robots.B!.integrity);
  });
  it("prevents the machines from passing through one another", () => {
    let state = match();
    state = apply(state, { type: "CONTROL", slot: "A", throttle: 1, steering: 0 }).state;
    state = apply(state, { type: "CONTROL", slot: "B", throttle: 1, steering: 0 }).state;
    state = advance(state, 8_000);
    assert.ok(state.robots.A!.position.z < state.robots.B!.position.z);
    assert.ok(state.robots.B!.position.z - state.robots.A!.position.z > 2);
    assert.equal(state.robots.A!.integrity, 100);
    assert.equal(state.robots.B!.integrity, 100);
  });
  it("keeps the complete body inside arena bounds", () => {
    const state = advance(apply(match(), { type: "CONTROL", slot: "A", throttle: -1, steering: 0 }).state, 5_000);
    const radius = Math.hypot(1.7, 1.4) / 2;
    assert.ok(state.robots.A!.position.z >= -5.5 + radius);
  });
  it("records a winner only after valid timed strikes and keeps the final result immutable", () => {
    let state = closeMatch();
    for (let index = 0; index < 10 && state.phase === "ACTIVE"; index += 1) {
      const strike = apply(state, { type: "FIRE", slot: "A" });
      assert.equal(strike.event.accepted, true);
      state = strike.state;
      if (state.phase === "ACTIVE") state = advance(state, 900);
    }
    assert.equal(state.phase, "COMPLETED");
    assert.equal(state.winnerSlot, "A");
    assert.equal(state.terminalReason, "OPPONENT_DISABLED");
    assert.equal(state.robots.B!.damageLog.length, 7);
    assert.equal(state.robots.B!.damageLog[0].targetComponent, "frame");
    assert.match(state.rebuildQuestions.B![0], /frame/i);
    rejectedWithoutMutation(state, { type: "DISCONNECT", slot: "B", reason: "late" });
    rejectedWithoutMutation(state, { type: "FIRE", slot: "A" });
  });
  for (const value of [NaN, Infinity, -Infinity]) {
    it(`rejects non-finite controls ${value}`, () => rejectedWithoutMutation(match(), { type: "CONTROL", slot: "A", throttle: value, steering: 0 }));
  }
  for (const value of [NaN, Infinity, -1, 251, 0.1]) {
    it(`rejects invalid trusted step ${value}`, () => rejectedWithoutMutation(match(), { type: "TICK", elapsedMs: value }));
  }
  it("keeps disconnect explicit and without an invented winner", () => {
    const state = apply(match(), { type: "DISCONNECT", slot: "B", reason: "connection_lost" }).state;
    assert.equal(state.phase, "DISCONNECTED");
    assert.equal(state.players.B!.connected, false);
    assert.equal(state.terminalReason, "PLAYER_DISCONNECTED");
    assert.equal(state.winnerSlot, undefined);
    rejectedWithoutMutation(state, { type: "FIRE", slot: "A" });
  });
});

describe("Robot Combat private test consequences", () => {
  it("requires an actual new body contact, not a button at the starting position", () => {
    let state = privateTest();
    const blueprint = structuredClone(state.players.A!.blueprint);
    rejectedWithoutMutation(state, { type: "TEST_CONTACT", slot: "A" });
    state = advance(apply(state, { type: "CONTROL", slot: "A", throttle: 1, steering: 0 }).state, 1_500);
    const contact = apply(state, { type: "TEST_CONTACT", slot: "A" });
    assert.equal(contact.event.accepted, true);
    assert.equal(contact.state.testReport!.contacts, 1);
    rejectedWithoutMutation(contact.state, { type: "TEST_CONTACT", slot: "A" });
    const held = advance(contact.state, 1_000);
    rejectedWithoutMutation(held, { type: "TEST_CONTACT", slot: "A" });
    const fired = apply(held, { type: "FIRE", slot: "A" });
    assert.equal(fired.event.accepted, true);
    assert.equal(fired.state.testReport!.weaponUses, 1);
    assert.equal(fired.state.testReport!.consequences.length, 2);
    const reset = apply(fired.state, { type: "RESET_TEST", slot: "A" }).state;
    assert.equal(reset.elapsedMs, 0);
    assert.equal(reset.testReport!.resets, 1);
    assert.equal(reset.testReport!.contacts, 0);
    assert.equal(reset.robots.B!.integrity, 100);
    assert.equal(reset.robots.A!.weaponReadyAtMs, 0);
    assert.equal(reset.robots.A!.contactPending, false);
    assert.deepEqual(reset.players.A!.blueprint, blueprint);
  });
  it("does not allow test commands in a regular match", () => {
    rejectedWithoutMutation(match(), { type: "TEST_CONTACT", slot: "A" });
    rejectedWithoutMutation(match(), { type: "RESET_TEST", slot: "A" });
  });
});
