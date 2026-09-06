import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import {
  createRobotMatchState, createRobotTestState, createStarterRobotBlueprint,
  hashRobotMatchState, type RobotMatchState,
} from "../domain/robot-combat";
import { applyClockedRobotCommand, startRobotServerClock } from "./robot-match-clock";

// These are transaction-contract doubles, not PostgreSQL/Drizzle integration.
const fixture = vi.hoisted(() => ({
  rows: [] as unknown[][],
  inserted: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
  denied: false,
  advanceAtLookup: false,
}));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => ({ and: values }),
  or: (...values: unknown[]) => ({ or: values }),
  eq: (...values: unknown[]) => ({ eq: values }),
  asc: (value: unknown) => value,
  desc: (value: unknown) => value,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));
vi.mock("@/db/schema", () => ({
  robotCombatMatches: { id: "id", playerAId: "playerAId", playerBId: "playerBId" },
  robotCombatMatchEvents: { matchId: "matchId", actionId: "actionId" },
  robotCombatBuilds: {}, robotCombatBuildRevisions: {},
}));
vi.mock("./env", () => ({ getRuntimeEnv: () => ({ DEMO_MODE: false }) }));
vi.mock("./persistent-player-access", () => ({
  assertPersistentPlayerAccess: async () => {
    fixture.calls.push("access");
    if (fixture.denied) throw new Error("ACCOUNT_RESTRICTED");
  },
}));
vi.mock("@/db/client", () => ({
  getDatabase: () => ({
    transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      const transaction = {
        execute: async () => { fixture.calls.push("lock"); },
        select: () => {
          const chain = {
            from: () => chain,
            where: () => chain,
            limit: async () => {
              fixture.calls.push("lookup");
              if (fixture.advanceAtLookup) vi.setSystemTime(1_001_500);
              return fixture.rows.shift() ?? [];
            },
          };
          return chain;
        },
        update: () => ({ set: (values: Record<string, unknown>) => ({
          where: async () => { fixture.updates.push(values); },
        }) }),
        insert: () => ({ values: async (values: Array<Record<string, unknown>>) => { fixture.inserted.push(...values); } }),
      };
      return callback(transaction);
    },
  }),
}));

const player = {
  id: "a", email: "a@example.test", displayName: "A", passwordHash: "unused",
  status: "ACTIVE" as const, createdAt: new Date(0).toISOString(),
  acceptedPlayCoinTermsVersion: "PLAY_COINS_V1", acceptedPlayCoinTermsAt: new Date(0).toISOString(), adminRoles: [],
};
function active(): RobotMatchState {
  let state = createRobotMatchState({ matchId: "persist-contract", arenaKey: "training-floor-01", player: { playerId: "a", displayName: "A" } });
  for (const command of [
    { type: "JOIN", playerId: "b", displayName: "B" },
    { type: "SUBMIT_BUILD", slot: "A", blueprint: createStarterRobotBlueprint("PUSHER") },
    { type: "SUBMIT_BUILD", slot: "B", blueprint: createStarterRobotBlueprint("STRIKER") },
    { type: "READY", slot: "A" }, { type: "READY", slot: "B" },
  ] as const) state = applyClockedRobotCommand(state, command, 1_000_000).state;
  return state;
}
function setup(state: RobotMatchState, existing?: Record<string, unknown>) {
  vi.useFakeTimers();
  vi.setSystemTime(1_001_000);
  fixture.rows = [[{
    id: state.matchId, stateSnapshot: state, startedAt: new Date(1_000_000),
    completedAt: state.phase === "COMPLETED" ? new Date(1_000_500) : null,
  }], existing ? [existing] : []];
  fixture.inserted = []; fixture.updates = []; fixture.calls = [];
  fixture.denied = false; fixture.advanceAtLookup = false;
}
afterEach(() => vi.useRealTimers());

async function send(command: Parameters<typeof applyClockedRobotCommand>[1], actionId = "persistence-action-01") {
  const { commandRobotMatch } = await import("./robot-combat-service");
  return commandRobotMatch({ user: player, matchId: "persist-contract", actionId, command });
}

describe("Robot Combat configured-service transaction contract (mocked database)", () => {
  it("stores clock evidence separately before a rejected strike, with a continuous hash chain", async () => {
    const state = active(); setup(state);
    const result = await send({ type: "FIRE", slot: "A" });
    assert.equal(result.event.accepted, false);
    assert.deepEqual(fixture.calls, ["access", "lock", "lookup", "lookup"]);
    assert.equal(fixture.inserted.length, 2);
    const [clock, rejected] = fixture.inserted;
    assert.equal(clock.accepted, true);
    assert.match(String(clock.actionId), /^!clock:/);
    assert.deepEqual(clock.commandPayload, { type: "SERVER_CLOCK", serverAtMs: 1_001_000, stepMs: 50 });
    assert.equal(clock.stateHashBefore, hashRobotMatchState(state));
    assert.equal(clock.stateHashAfter, rejected.stateHashBefore);
    assert.equal(rejected.stateHashBefore, rejected.stateHashAfter);
    assert.equal(rejected.stateHashAfter, hashRobotMatchState(result.state));
    assert.equal(Number(clock.sequence) + 1, rejected.sequence);
    assert.equal(result.state.nextSequence, Number(rejected.sequence) + 1);
    assert.equal(rejected.rejectionCode, "COMMAND_REJECTED");
  });
  it("retains server evidence for refresh requests rather than recording a client delta as authority", async () => {
    setup(active());
    const result = await send({ type: "TICK", elapsedMs: 250 });
    assert.equal(result.state.elapsedMs, 1_000);
    assert.equal(fixture.inserted.length, 2);
    const [clock, request] = fixture.inserted;
    assert.equal((clock.commandPayload as { type: string }).type, "SERVER_CLOCK");
    assert.deepEqual(request.commandPayload, { type: "TICK", elapsedMs: 250 });
    assert.equal(request.stateHashBefore, request.stateHashAfter);
    assert.equal(request.stateHashBefore, clock.stateHashAfter);
  });
  it("samples server time after lock and receipt lookup", async () => {
    setup(active()); fixture.advanceAtLookup = true;
    const result = await send({ type: "TICK", elapsedMs: 0 });
    assert.equal(result.state.elapsedMs, 1_500);
  });
  it("replays bound receipts before advancing time or writing anything", async () => {
    const state = active(); setup(state, {
      playerId: "a", commandPayload: { type: "FIRE", slot: "A" },
      sequence: 2, commandType: "FIRE", accepted: false,
    });
    const result = await send({ type: "FIRE", slot: "A" });
    assert.equal(result.idempotentReplay, true);
    assert.equal(result.event.accepted, false);
    assert.equal(hashRobotMatchState(result.state), hashRobotMatchState(state));
    assert.equal(fixture.inserted.length + fixture.updates.length, 0);
  });
  it("rejects changed payload reuse without clock or database writes", async () => {
    setup(active(), { playerId: "a", commandPayload: { type: "CONTROL", slot: "A", throttle: 1, steering: 0 } });
    await assert.rejects(() => send({ type: "FIRE", slot: "A" }), /different command/);
    assert.equal(fixture.inserted.length + fixture.updates.length, 0);
  });
  it("rejects the other participant's slot before looking up receipts", async () => {
    setup(active());
    await assert.rejects(() => send({ type: "FIRE", slot: "B" }), /does not belong/);
    assert.deepEqual(fixture.calls, ["access", "lock", "lookup"]);
    assert.equal(fixture.inserted.length + fixture.updates.length, 0);
  });
  it("keeps the access check ahead of the lock and all writes", async () => {
    setup(active()); fixture.denied = true;
    await assert.rejects(() => send({ type: "TICK", elapsedMs: 250 }), /ACCOUNT_RESTRICTED/);
    assert.deepEqual(fixture.calls, ["access"]);
    assert.equal(fixture.inserted.length + fixture.updates.length, 0);
  });
  it("preserves the original completion timestamp and outcome on rejected late disconnects", async () => {
    const state: RobotMatchState = { ...active(), phase: "COMPLETED", winnerSlot: "B", terminalReason: "OPPONENT_DISABLED" };
    setup(state);
    const result = await send({ type: "DISCONNECT", slot: "A", reason: "late_disconnect" });
    assert.equal(result.event.accepted, false);
    assert.equal(hashRobotMatchState(result.state), hashRobotMatchState(state));
    assert.deepEqual(fixture.updates[0].completedAt, new Date(1_000_500));
    assert.equal(fixture.updates[0].terminalReason, "OPPONENT_DISABLED");
    assert.equal(fixture.inserted.length, 1);
  });
  it("records the accepted cancellation's first completion time", async () => {
    setup(active());
    const result = await send({ type: "CANCEL", slot: "A", reason: "player_choice" });
    assert.equal(result.event.accepted, true);
    assert.deepEqual(fixture.updates[0].completedAt, new Date(1_001_000));
    assert.equal(fixture.updates[0].terminalReason, "player_choice");
  });
  it("clears old terminal columns and starts a new private-test clock on reset", async () => {
    const base = startRobotServerClock(createRobotTestState({ matchId: "persist-contract", arenaKey: "bay-13-private-test", player: { playerId: "a", displayName: "A" }, blueprint: createStarterRobotBlueprint("PUSHER") }), 1_000_000);
    setup({ ...base, phase: "COMPLETED", winnerSlot: "A", terminalReason: "OPPONENT_DISABLED" });
    const result = await send({ type: "RESET_TEST", slot: "A" });
    assert.equal(result.event.accepted, true);
    assert.equal(result.state.elapsedMs, 0);
    assert.deepEqual(result.state.serverClock, { startedAtMs: 1_001_000 });
    assert.equal(fixture.updates[0].terminalReason, null);
    assert.equal(fixture.updates[0].completedAt, null);
  });
  it("holds old V1 matches without rewriting their rules or gameplay state", async () => {
    const state: RobotMatchState = { ...active(), rulesetVersion: "ROBOT_COMBAT_RULES_V1" }; setup(state);
    const result = await send({ type: "TICK", elapsedMs: 250 });
    assert.equal(result.event.accepted, false);
    assert.equal(hashRobotMatchState(result.state), hashRobotMatchState(state));
    assert.equal(fixture.inserted.length, 1);
    assert.equal(fixture.inserted[0].stateHashBefore, fixture.inserted[0].stateHashAfter);
  });
});
