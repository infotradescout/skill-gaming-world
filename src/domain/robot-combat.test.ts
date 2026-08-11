import { describe, expect, it } from "vitest";

import {
  applyRobotMatchCommand,
  createRobotMatchState,
  createStarterRobotBlueprint,
  inspectRobotBlueprint,
} from "./robot-combat";

describe("Robot Combat build authority", () => {
  it("keeps the three teaching archetypes inspection-valid", () => {
    for (const archetype of ["PUSHER", "CONTROL", "STRIKER"] as const) {
      const inspection = inspectRobotBlueprint(createStarterRobotBlueprint(archetype));
      expect(inspection.valid, archetype).toBe(true);
      expect(inspection.metrics.connectionCount, archetype).toBeGreaterThanOrEqual(4);
      expect(inspection.metrics.forcePath, archetype).toBe("CONNECTED");
    }
  });

  it("rejects a machine with a disconnected or missing drive path", () => {
    const blueprint = createStarterRobotBlueprint("PUSHER");
    blueprint.parts = blueprint.parts.filter((part) => part.instanceId !== "drive-right");
    blueprint.parts.push({
      instanceId: "loose-weapon",
      partKey: "weapon.hammer",
      parentInstanceId: "missing-frame",
      socket: "top-weapon",
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
    });
    const inspection = inspectRobotBlueprint(blueprint);
    expect(inspection.valid).toBe(false);
    expect(inspection.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["DRIVE_COUNT", "PARENT_MISSING"]),
    );
  });

  it("changes the inspected hash and metrics when a builder changes a module", () => {
    const first = createStarterRobotBlueprint("PUSHER");
    const second = createStarterRobotBlueprint("PUSHER");
    second.name = "my revision";
    second.parts = second.parts.map((part) =>
      part.instanceId === "armor"
        ? { ...part, partKey: "armor.bumper" }
        : part,
    );
    const firstInspection = inspectRobotBlueprint(first);
    const secondInspection = inspectRobotBlueprint(second);
    expect(secondInspection.blueprintHash).not.toBe(firstInspection.blueprintHash);
    expect(secondInspection.metrics.massKg).toBeGreaterThan(firstInspection.metrics.massKg);
  });
});

describe("Robot Combat match authority", () => {
  function match() {
    const created = createRobotMatchState({
      matchId: "match-1",
      arenaKey: "training-floor-01",
      player: { playerId: "player-a", displayName: "A" },
    });
    const joined = applyRobotMatchCommand(created, {
      type: "JOIN",
      playerId: "player-b",
      displayName: "B",
      slot: "B",
    }).state;
    const buildA = applyRobotMatchCommand(joined, {
      type: "SUBMIT_BUILD",
      slot: "A",
      blueprint: createStarterRobotBlueprint("PUSHER"),
    }).state;
    const buildB = applyRobotMatchCommand(buildA, {
      type: "SUBMIT_BUILD",
      slot: "B",
      blueprint: createStarterRobotBlueprint("STRIKER"),
    }).state;
    return buildB;
  }

  it("requires both inspected builders to ready before the clock starts", () => {
    const readyA = applyRobotMatchCommand(match(), { type: "READY", slot: "A" }).state;
    expect(readyA.phase).toBe("READY_CHECK");
    expect(readyA.robots.A).toBeUndefined();
    const started = applyRobotMatchCommand(readyA, { type: "READY", slot: "B" }).state;
    expect(started.phase).toBe("ACTIVE");
    expect(started.robots.A?.integrity).toBe(100);
    expect(started.robots.B?.integrity).toBe(100);
  });

  it("records control, clock, damage, and terminal winner truth", () => {
    const readyA = applyRobotMatchCommand(match(), { type: "READY", slot: "A" }).state;
    const started = applyRobotMatchCommand(readyA, { type: "READY", slot: "B" }).state;
    const controlled = applyRobotMatchCommand(started, {
      type: "CONTROL",
      slot: "A",
      throttle: 1,
      steering: 0.25,
    }).state;
    const advanced = applyRobotMatchCommand(controlled, { type: "TICK", elapsedMs: 120 }).state;
    expect(advanced.robots.A?.position.z).not.toBe(0);
    let fought = advanced;
    for (let index = 0; index < 6; index += 1) {
      fought = applyRobotMatchCommand(fought, { type: "FIRE", slot: "A" }).state;
    }
    expect(fought.phase).toBe("COMPLETED");
    expect(fought.winnerSlot).toBe("A");
    expect(fought.terminalReason).toBe("OPPONENT_DISABLED");
    expect(fought.robots.B?.damageLog.length).toBe(6);
    expect(fought.robots.B?.damageLog[0]?.targetComponent).toBe("frame");
    expect(fought.rebuildQuestions.B?.[0]).toMatch(/frame/i);
  });

  it("makes disconnect a visible terminal outcome instead of silently dropping the match", () => {
    const readyA = applyRobotMatchCommand(match(), { type: "READY", slot: "A" }).state;
    const started = applyRobotMatchCommand(readyA, { type: "READY", slot: "B" }).state;
    const disconnected = applyRobotMatchCommand(started, {
      type: "DISCONNECT",
      slot: "B",
      reason: "connection_lost",
    }).state;
    expect(disconnected.phase).toBe("DISCONNECTED");
    expect(disconnected.players.B?.connected).toBe(false);
    expect(disconnected.terminalReason).toBe("PLAYER_DISCONNECTED");
  });
});
