import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { createStarterRobotBlueprint } from "@/domain";
import type { DemoUser } from "./demo-store";
import { commandRobotMatch, commandRobotTestSession, createRobotMatch, createRobotTestSession, getRobotMatch, joinRobotMatch, saveRobotBuild } from "./robot-combat-service";

const originalDemoMode = process.env.DEMO_MODE;
const originalNow = Date.now;
let serverNow = 1_000_000;
let identity = 0;
function user(): DemoUser {
  const id = `combat-test-${++identity}`;
  return { id, email: `${id}@example.test`, displayName: id, passwordHash: "not-used", status: "ACTIVE", createdAt: new Date().toISOString(), acceptedPlayCoinTermsVersion: "PLAY_COINS_V1", acceptedPlayCoinTermsAt: new Date().toISOString(), adminRoles: [] };
}
function setupTime(): void {
  process.env.DEMO_MODE = "true";
  serverNow = 1_000_000;
  Date.now = () => serverNow;
}
afterEach(() => {
  Date.now = originalNow;
  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
});
async function pair() {
  setupTime();
  const a = user(); const b = user();
  const buildA = await saveRobotBuild({ user: a, buildKey: "machine-a", blueprint: createStarterRobotBlueprint("PUSHER") });
  const buildB = await saveRobotBuild({ user: b, buildKey: "machine-b", blueprint: createStarterRobotBlueprint("STRIKER") });
  const created = await createRobotMatch({ user: a, buildId: buildA.id });
  await joinRobotMatch({ user: b, matchId: created.matchId, buildId: buildB.id });
  await commandRobotMatch({ user: a, matchId: created.matchId, actionId: "service-ready-a", command: { type: "READY", slot: "A" } });
  const started = await commandRobotMatch({ user: b, matchId: created.matchId, actionId: "service-ready-b", command: { type: "READY", slot: "B" } });
  return { a, b, state: started.state, matchId: created.matchId };
}

describe("Robot Combat in-memory service wiring", () => {
  it("carries saved machines through movement, valid timed strikes and final reload", async () => {
    const { a, matchId, state } = await pair();
    assert.deepEqual(state.serverClock, { startedAtMs: serverNow });
    const distant = await commandRobotMatch({ user: a, matchId, actionId: "service-distant-fire", command: { type: "FIRE", slot: "A" } });
    assert.equal(distant.event.accepted, false);
    await commandRobotMatch({ user: a, matchId, actionId: "service-drive-forward", command: { type: "CONTROL", slot: "A", throttle: 1, steering: 0 } });
    serverNow += 2_000;
    await commandRobotMatch({ user: a, matchId, actionId: "service-drive-brake", command: { type: "CONTROL", slot: "A", throttle: 0, steering: 0 } });
    let terminal = state;
    for (let index = 0; index < 7; index += 1) {
      const result = await commandRobotMatch({ user: a, matchId, actionId: `service-strike-${index}`, command: { type: "FIRE", slot: "A" } });
      assert.equal(result.event.accepted, true);
      terminal = result.state;
      serverNow += 900;
    }
    assert.equal(terminal.phase, "COMPLETED");
    assert.equal(terminal.winnerSlot, "A");
    assert.deepEqual(await getRobotMatch({ user: a, matchId }), terminal);
  });
  it("two players observing the same time cannot double the clock", async () => {
    const { a, b, matchId } = await pair();
    serverNow += 600;
    const first = await commandRobotMatch({ user: a, matchId, actionId: "service-tick-player-a", command: { type: "TICK", elapsedMs: 250 } });
    const second = await commandRobotMatch({ user: b, matchId, actionId: "service-tick-player-b", command: { type: "TICK", elapsedMs: 250 } });
    assert.equal(first.state.elapsedMs, 600);
    assert.equal(second.state.elapsedMs, 600);
  });
  it("replays a duplicate before consulting the advancing server clock", async () => {
    const { a, matchId } = await pair();
    const request = { user: a, matchId, actionId: "service-original-control", command: { type: "CONTROL" as const, slot: "A" as const, throttle: 1, steering: 0 } };
    const first = await commandRobotMatch(request);
    serverNow += 1_000;
    const replay = await commandRobotMatch(request);
    assert.equal(replay.idempotentReplay, true);
    assert.deepEqual(replay.state, first.state);
    assert.equal(replay.state.nextSequence, first.state.nextSequence);
  });
  it("does not replay another player's tick under the same action identifier", async () => {
    const { a, b, matchId } = await pair();
    const request = { user: a, matchId, actionId: "service-actor-bound-tick", command: { type: "TICK" as const, elapsedMs: 120 } };
    await commandRobotMatch(request);
    await assert.rejects(commandRobotMatch({ ...request, user: b }), /different command/);
  });
  it("rejects changed command content under the same action identifier", async () => {
    const { a, matchId } = await pair();
    const request = { user: a, matchId, actionId: "service-content-bound", command: { type: "CONTROL" as const, slot: "A" as const, throttle: 1, steering: 0 } };
    await commandRobotMatch(request);
    await assert.rejects(commandRobotMatch({ ...request, command: { ...request.command, throttle: -1 } }), /different command/);
  });
  it("rejects another player's control slot and an unrelated account", async () => {
    const { a, matchId } = await pair();
    await assert.rejects(commandRobotMatch({ user: a, matchId, actionId: "service-wrong-slot", command: { type: "FIRE", slot: "B" } }), /slot does not belong/);
    await assert.rejects(getRobotMatch({ user: user(), matchId }), /another player/);
  });
  it("keeps rejected attack outcomes bound even after moving into reach", async () => {
    const { a, matchId } = await pair();
    const request = { user: a, matchId, actionId: "service-rejected-shot", command: { type: "FIRE" as const, slot: "A" as const } };
    const first = await commandRobotMatch(request);
    assert.equal(first.event.accepted, false);
    await commandRobotMatch({ user: a, matchId, actionId: "service-move-after-miss", command: { type: "CONTROL", slot: "A", throttle: 1, steering: 0 } });
    serverNow += 2_000;
    await commandRobotMatch({ user: a, matchId, actionId: "service-observe-after-move", command: { type: "TICK", elapsedMs: 250 } });
    const replay = await commandRobotMatch(request);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.event.accepted, false);
    assert.equal(replay.state.robots.B!.integrity, 100);
  });
  it("starts and resets the private test using service-owned time", async () => {
    setupTime();
    const a = user();
    const build = await saveRobotBuild({ user: a, buildKey: "private-build", blueprint: createStarterRobotBlueprint("PUSHER") });
    const state = await createRobotTestSession({ user: a, buildId: build.id });
    assert.deepEqual(state.serverClock, { startedAtMs: serverNow });
    serverNow += 1_000;
    const observed = await commandRobotTestSession({ user: a, sessionId: state.matchId, actionId: "service-private-observe", command: { type: "TICK", elapsedMs: 1 } });
    assert.equal(observed.state.elapsedMs, 1_000);
    const reset = await commandRobotTestSession({ user: a, sessionId: state.matchId, actionId: "service-private-reset", command: { type: "RESET_TEST", slot: "A" } });
    assert.equal(reset.state.elapsedMs, 0);
    assert.deepEqual(reset.state.serverClock, { startedAtMs: serverNow });
  });
});
