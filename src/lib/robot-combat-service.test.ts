import { afterEach, describe, expect, it } from "vitest";

import { createStarterRobotBlueprint } from "@/domain";
import type { DemoUser } from "./demo-store";
import {
  commandRobotMatch,
  createRobotMatch,
  joinRobotMatch,
  saveRobotBuild,
} from "./robot-combat-service";

const originalDemoMode = process.env.DEMO_MODE;

function user(id: string, displayName: string): DemoUser {
  return {
    id,
    email: `${id}@example.test`,
    displayName,
    passwordHash: "not-used-in-this-test",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    acceptedPlayCoinTermsVersion: "PLAY_COINS_V1",
    acceptedPlayCoinTermsAt: new Date().toISOString(),
    adminRoles: [],
  };
}

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
});

describe("Robot Combat player service", () => {
  it("carries two builders from saved revisions through a terminal match outcome", async () => {
    process.env.DEMO_MODE = "true";
    const playerA = user("robot-service-a", "Builder A");
    const playerB = user("robot-service-b", "Builder B");
    const buildA = await saveRobotBuild({
      user: playerA,
      buildKey: "service-a",
      blueprint: createStarterRobotBlueprint("PUSHER"),
    });
    const buildB = await saveRobotBuild({
      user: playerB,
      buildKey: "service-b",
      blueprint: createStarterRobotBlueprint("STRIKER"),
    });

    const created = await createRobotMatch({
      user: playerA,
      buildId: buildA.id,
      revision: buildA.latestRevision,
    });
    const joined = await joinRobotMatch({
      user: playerB,
      matchId: created.matchId,
      buildId: buildB.id,
      revision: buildB.latestRevision,
    });
    expect(joined.phase).toBe("READY_CHECK");

    const readyA = await commandRobotMatch({
      user: playerA,
      matchId: created.matchId,
      actionId: "service-ready-a-1",
      command: { type: "READY", slot: "A" },
    });
    expect(readyA.state.phase).toBe("READY_CHECK");
    const started = await commandRobotMatch({
      user: playerB,
      matchId: created.matchId,
      actionId: "service-ready-b-1",
      command: { type: "READY", slot: "B" },
    });
    expect(started.state.phase).toBe("ACTIVE");

    const moved = await commandRobotMatch({
      user: playerA,
      matchId: created.matchId,
      actionId: "service-control-a-1",
      command: { type: "CONTROL", slot: "A", throttle: 1, steering: 0 },
    });
    expect(moved.event.accepted).toBe(true);

    let terminal = moved.state;
    for (let index = 0; index < 6; index += 1) {
      terminal = (
        await commandRobotMatch({
          user: playerA,
          matchId: created.matchId,
          actionId: `service-fire-a-${index + 1}`,
          command: { type: "FIRE", slot: "A" },
        })
      ).state;
    }
    expect(terminal.phase).toBe("COMPLETED");
    expect(terminal.winnerSlot).toBe("A");
  });

  it("replays a duplicate action id without applying it twice", async () => {
    process.env.DEMO_MODE = "true";
    const player = user("robot-service-replay", "Replay Builder");
    const build = await saveRobotBuild({
      user: player,
      buildKey: "replay-build",
      blueprint: createStarterRobotBlueprint("PUSHER"),
    });
    const match = await createRobotMatch({ user: player, buildId: build.id });
    const first = await commandRobotMatch({
      user: player,
      matchId: match.matchId,
      actionId: "service-cancel-1",
      command: { type: "CANCEL", slot: "A", reason: "test_cancel" },
    });
    const replay = await commandRobotMatch({
      user: player,
      matchId: match.matchId,
      actionId: "service-cancel-1",
      command: { type: "CANCEL", slot: "A", reason: "test_cancel" },
    });
    expect(first.state.phase).toBe("CANCELLED");
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.state.nextSequence).toBe(first.state.nextSequence);
  });
});
