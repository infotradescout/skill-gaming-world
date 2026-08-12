import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import {
  applyRobotMatchCommand,
  createRobotMatchState,
  hashRobotMatchState,
  inspectRobotBlueprint,
  type RobotBlueprint,
  type RobotInspection,
  type RobotMatchCommand,
  type RobotMatchEvent,
  type RobotMatchState,
} from "@/domain";
import {
  robotCombatBuildRevisions,
  robotCombatBuilds,
  robotCombatMatchEvents,
  robotCombatMatches,
} from "@/db/schema";

import { getDatabase } from "@/db/client";
import type { DemoUser } from "./demo-store";
import { getRuntimeEnv } from "./env";
import { evaluateDemoPlayerAccess } from "./player-access";
import { assertPersistentPlayerAccess } from "./persistent-player-access";

export class RobotCombatServiceError extends Error {
  constructor(
    readonly code:
      | "ACCOUNT_RESTRICTED"
      | "INVALID_BUILD"
      | "BUILD_NOT_FOUND"
      | "MATCH_NOT_FOUND"
      | "MATCH_FORBIDDEN"
      | "MATCH_COMMAND_REJECTED"
      | "ACTION_ID_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export type RobotBuildRevision = {
  id: string;
  revision: number;
  blueprintHash: string;
  blueprint: RobotBlueprint;
  inspection: RobotInspection;
  createdAt: string;
};

export type RobotBuild = {
  id: string;
  buildKey: string;
  displayName: string;
  latestRevision: number;
  revisions: RobotBuildRevision[];
};

type MemoryBuild = RobotBuild & { userId: string };
type MemoryMatch = {
  state: RobotMatchState;
  actionIds: Map<string, RobotMatchEvent>;
};

type RobotCombatMemoryStore = {
  builds: Map<string, Map<string, MemoryBuild>>;
  matches: Map<string, MemoryMatch>;
};

declare global {
  var __skillGamingWorldRobotCombatStore: RobotCombatMemoryStore | undefined;
}

const memoryStore = globalThis.__skillGamingWorldRobotCombatStore ??= {
  builds: new Map<string, Map<string, MemoryBuild>>(),
  matches: new Map<string, MemoryMatch>(),
};
const memoryBuilds = memoryStore.builds;
const memoryMatches = memoryStore.matches;

type RobotCombatTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

function assertDemoAccess(user: DemoUser): void {
  const decision = evaluateDemoPlayerAccess({
    user,
    mode: "ROBOT_COMBAT_FREE",
    exclusions: [],
    serverAtMs: Date.now(),
  });
  if (!decision.allowed) {
    throw new RobotCombatServiceError(
      "ACCOUNT_RESTRICTED",
      "Account restrictions block Robot Combat.",
    );
  }
}

function assertBuildKey(buildKey: string): string {
  const normalized = buildKey.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(normalized)) {
    throw new RobotCombatServiceError(
      "INVALID_BUILD",
      "Build keys must use 2-64 letters, numbers, underscores, or hyphens.",
    );
  }
  return normalized;
}

function publicMemoryBuild(build: MemoryBuild): RobotBuild {
  return {
    id: build.id,
    buildKey: build.buildKey,
    displayName: build.displayName,
    latestRevision: build.latestRevision,
    revisions: build.revisions.map((revision) => ({
      ...revision,
      blueprint: structuredClone(revision.blueprint),
      inspection: structuredClone(revision.inspection),
    })),
  };
}

function fromPersistentRevision(
  revision: typeof robotCombatBuildRevisions.$inferSelect,
): RobotBuildRevision {
  return {
    id: revision.id,
    revision: revision.revision,
    blueprintHash: revision.blueprintHash,
    blueprint: revision.blueprint as unknown as RobotBlueprint,
    inspection: revision.inspection as unknown as RobotInspection,
    createdAt: revision.createdAt.toISOString(),
  };
}

function fromPersistentBuild(
  build: typeof robotCombatBuilds.$inferSelect,
  revisions: RobotBuildRevision[],
): RobotBuild {
  return {
    id: build.id,
    buildKey: build.buildKey,
    displayName: build.displayName,
    latestRevision: build.latestRevision,
    revisions,
  };
}

function buildInputInspection(blueprint: RobotBlueprint): RobotInspection {
  const inspection = inspectRobotBlueprint(blueprint);
  if (!inspection.valid) {
    throw new RobotCombatServiceError(
      "INVALID_BUILD",
      inspection.errors[0]?.message ?? "The machine failed inspection.",
    );
  }
  return inspection;
}

export async function saveRobotBuild(input: {
  user: DemoUser;
  buildKey: string;
  blueprint: RobotBlueprint;
}): Promise<RobotBuild> {
  const buildKey = assertBuildKey(input.buildKey);
  const inspection = buildInputInspection(input.blueprint);
  const env = getRuntimeEnv();
  if (env.DEMO_MODE) {
    assertDemoAccess(input.user);
    const byKey = memoryBuilds.get(input.user.id) ?? new Map<string, MemoryBuild>();
    memoryBuilds.set(input.user.id, byKey);
    const existing = byKey.get(buildKey);
    const now = new Date().toISOString();
    if (existing?.revisions.some((revision) => revision.blueprintHash === inspection.blueprintHash)) {
      return publicMemoryBuild(existing);
    }
    const revision: RobotBuildRevision = {
      id: randomUUID(),
      revision: (existing?.latestRevision ?? 0) + 1,
      blueprintHash: inspection.blueprintHash,
      blueprint: structuredClone(input.blueprint),
      inspection: structuredClone(inspection),
      createdAt: now,
    };
    const build: MemoryBuild = existing
      ? {
          ...existing,
          displayName: input.blueprint.name,
          latestRevision: revision.revision,
          revisions: [...existing.revisions, revision],
        }
      : {
          id: randomUUID(),
          userId: input.user.id,
          buildKey,
          displayName: input.blueprint.name,
          latestRevision: revision.revision,
          revisions: [revision],
        };
    byKey.set(buildKey, build);
    return publicMemoryBuild(build);
  }

  return getDatabase().transaction(async (transaction) => {
    await assertPersistentPlayerAccess(transaction, input.user, "ROBOT_COMBAT_FREE");
    await transaction.execute(
      sql`select pg_advisory_xact_lock(
        hashtext('ROBOT_COMBAT_BUILD_V1'),
        hashtext(${input.user.id}),
        hashtext(${buildKey})
      )`,
    );
    const [existing] = await transaction
      .select()
      .from(robotCombatBuilds)
      .where(and(eq(robotCombatBuilds.userId, input.user.id), eq(robotCombatBuilds.buildKey, buildKey)))
      .limit(1);
    const build = existing ?? (await transaction
      .insert(robotCombatBuilds)
      .values({
        userId: input.user.id,
        buildKey,
        displayName: input.blueprint.name,
        latestRevision: 0,
      })
      .returning())[0];
    if (!build) throw new Error("ROBOT_COMBAT_BUILD_CREATE_FAILED");

    const [latest] = await transaction
      .select()
      .from(robotCombatBuildRevisions)
      .where(eq(robotCombatBuildRevisions.buildId, build.id))
      .orderBy(desc(robotCombatBuildRevisions.revision))
      .limit(1);
    if (latest?.blueprintHash === inspection.blueprintHash) {
      const revisions = await transaction
        .select()
        .from(robotCombatBuildRevisions)
        .where(eq(robotCombatBuildRevisions.buildId, build.id))
        .orderBy(asc(robotCombatBuildRevisions.revision));
      return fromPersistentBuild(build, revisions.map(fromPersistentRevision));
    }
    const revisionNumber = (latest?.revision ?? 0) + 1;
    await transaction.insert(robotCombatBuildRevisions).values({
      buildId: build.id,
      userId: input.user.id,
      revision: revisionNumber,
      blueprintHash: inspection.blueprintHash,
      blueprint: input.blueprint as unknown as Record<string, unknown>,
      inspection: inspection as unknown as Record<string, unknown>,
    });
    const [updated] = await transaction
      .update(robotCombatBuilds)
      .set({
        displayName: input.blueprint.name,
        latestRevision: revisionNumber,
        updatedAt: new Date(),
      })
      .where(eq(robotCombatBuilds.id, build.id))
      .returning();
    const revisions = await transaction
      .select()
      .from(robotCombatBuildRevisions)
      .where(eq(robotCombatBuildRevisions.buildId, build.id))
      .orderBy(asc(robotCombatBuildRevisions.revision));
    return fromPersistentBuild(updated ?? build, revisions.map(fromPersistentRevision));
  });
}

export async function listRobotBuilds(user: DemoUser): Promise<RobotBuild[]> {
  const env = getRuntimeEnv();
  if (env.DEMO_MODE) {
    assertDemoAccess(user);
    return [...(memoryBuilds.get(user.id)?.values() ?? [])]
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map(publicMemoryBuild);
  }
  return getDatabase().transaction(async (transaction) => {
    await assertPersistentPlayerAccess(transaction, user, "ROBOT_COMBAT_FREE");
    const rows = await transaction
      .select({ build: robotCombatBuilds, revision: robotCombatBuildRevisions })
      .from(robotCombatBuilds)
      .leftJoin(robotCombatBuildRevisions, eq(robotCombatBuildRevisions.buildId, robotCombatBuilds.id))
      .where(eq(robotCombatBuilds.userId, user.id))
      .orderBy(asc(robotCombatBuilds.displayName), asc(robotCombatBuildRevisions.revision));
    const grouped = new Map<string, { build: typeof robotCombatBuilds.$inferSelect; revisions: RobotBuildRevision[] }>();
    for (const row of rows) {
      const current = grouped.get(row.build.id) ?? { build: row.build, revisions: [] };
      if (row.revision) current.revisions.push(fromPersistentRevision(row.revision));
      grouped.set(row.build.id, current);
    }
    return [...grouped.values()].map(({ build, revisions }) => fromPersistentBuild(build, revisions));
  });
}

async function ownedRevision(
  transaction: RobotCombatTransaction,
  user: DemoUser,
  buildId: string,
  revisionNumber?: number,
): Promise<{ build: typeof robotCombatBuilds.$inferSelect; revision: RobotBuildRevision }> {
  const buildRows = await transaction
    .select({ build: robotCombatBuilds, revision: robotCombatBuildRevisions })
    .from(robotCombatBuilds)
    .innerJoin(robotCombatBuildRevisions, eq(robotCombatBuildRevisions.buildId, robotCombatBuilds.id))
    .where(
      and(
        eq(robotCombatBuilds.id, buildId),
        eq(robotCombatBuilds.userId, user.id),
        ...(revisionNumber ? [eq(robotCombatBuildRevisions.revision, revisionNumber)] : []),
      ),
    )
    .orderBy(desc(robotCombatBuildRevisions.revision))
    .limit(1);
  const row = buildRows[0];
  if (!row) throw new RobotCombatServiceError("BUILD_NOT_FOUND", "The machine revision was not found.");
  return { build: row.build, revision: fromPersistentRevision(row.revision) };
}

function memoryRevision(userId: string, buildId: string, revisionNumber?: number): { build: MemoryBuild; revision: RobotBuildRevision } {
  const build = [...(memoryBuilds.get(userId)?.values() ?? [])].find((candidate) => candidate.id === buildId);
  const revision = build
    ? revisionNumber
      ? build.revisions.find((candidate) => candidate.revision === revisionNumber)
      : build.revisions.at(-1)
    : undefined;
  if (!build || !revision) throw new RobotCombatServiceError("BUILD_NOT_FOUND", "The machine revision was not found.");
  return { build, revision };
}

export async function createRobotMatch(input: {
  user: DemoUser;
  buildId: string;
  revision?: number;
  arenaKey?: string;
}): Promise<RobotMatchState> {
  const env = getRuntimeEnv();
  const matchId = randomUUID();
  const arenaKey = input.arenaKey?.trim() || "training-floor-01";
  if (env.DEMO_MODE) {
    assertDemoAccess(input.user);
    const selected = memoryRevision(input.user.id, input.buildId, input.revision);
    const initial = createRobotMatchState({
      matchId,
      arenaKey,
      player: {
        playerId: input.user.id,
        displayName: input.user.displayName,
      },
    });
    const submitted = applyRobotMatchCommand(initial, {
      type: "SUBMIT_BUILD",
      slot: "A",
      blueprint: selected.revision.blueprint,
    });
    memoryMatches.set(matchId, { state: submitted.state, actionIds: new Map() });
    return submitted.state;
  }
  return getDatabase().transaction(async (transaction) => {
    await assertPersistentPlayerAccess(transaction, input.user, "ROBOT_COMBAT_FREE");
    const selected = await ownedRevision(transaction, input.user, input.buildId, input.revision);
    const initial = createRobotMatchState({
      matchId,
      arenaKey,
      player: { playerId: input.user.id, displayName: input.user.displayName },
    });
    const submitted = applyRobotMatchCommand(initial, {
      type: "SUBMIT_BUILD",
      slot: "A",
      blueprint: selected.revision.blueprint,
    });
    await transaction.insert(robotCombatMatches).values({
      id: matchId,
      arenaKey,
      rulesetVersion: submitted.state.rulesetVersion,
      phase: submitted.state.phase,
      playerAId: input.user.id,
      stateSnapshot: submitted.state as unknown as Record<string, unknown>,
      nextSequence: submitted.state.nextSequence,
    });
    await transaction.insert(robotCombatMatchEvents).values({
      matchId,
      sequence: submitted.event.sequence,
      actionId: `create:${matchId}`,
      playerId: input.user.id,
      commandType: submitted.event.type,
      commandPayload: { type: "SUBMIT_BUILD", slot: "A", blueprintHash: selected.revision.blueprintHash },
      stateHashBefore: hashRobotMatchState(initial),
      stateHashAfter: hashRobotMatchState(submitted.state),
      accepted: true,
    });
    return submitted.state;
  });
}

export async function joinRobotMatch(input: {
  user: DemoUser;
  matchId: string;
  buildId: string;
  revision?: number;
}): Promise<RobotMatchState> {
  const env = getRuntimeEnv();
  if (env.DEMO_MODE) {
    assertDemoAccess(input.user);
    const match = memoryMatches.get(input.matchId);
    if (!match) throw new RobotCombatServiceError("MATCH_NOT_FOUND", "The match was not found.");
    const selected = memoryRevision(input.user.id, input.buildId, input.revision);
    const joined = applyRobotMatchCommand(match.state, {
      type: "JOIN",
      playerId: input.user.id,
      displayName: input.user.displayName,
      slot: "B",
    });
    if (!joined.event.accepted) throw new RobotCombatServiceError("MATCH_COMMAND_REJECTED", joined.event.message);
    const submitted = applyRobotMatchCommand(joined.state, {
      type: "SUBMIT_BUILD",
      slot: "B",
      blueprint: selected.revision.blueprint,
    });
    if (!submitted.event.accepted) throw new RobotCombatServiceError("MATCH_COMMAND_REJECTED", submitted.event.message);
    match.state = submitted.state;
    return submitted.state;
  }
  return getDatabase().transaction(async (transaction) => {
    await assertPersistentPlayerAccess(transaction, input.user, "ROBOT_COMBAT_FREE");
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('ROBOT_COMBAT_MATCH_V1'), hashtext(${input.matchId}))`);
    const [record] = await transaction
      .select()
      .from(robotCombatMatches)
      .where(eq(robotCombatMatches.id, input.matchId))
      .limit(1);
    if (!record) throw new RobotCombatServiceError("MATCH_NOT_FOUND", "The match was not found.");
    if (record.playerAId === input.user.id || record.playerBId) {
      throw new RobotCombatServiceError("MATCH_FORBIDDEN", "This match is not accepting that player.");
    }
    const selected = await ownedRevision(transaction, input.user, input.buildId, input.revision);
    const current = record.stateSnapshot as unknown as RobotMatchState;
    const joined = applyRobotMatchCommand(current, {
      type: "JOIN",
      playerId: input.user.id,
      displayName: input.user.displayName,
      slot: "B",
    });
    if (!joined.event.accepted) throw new RobotCombatServiceError("MATCH_COMMAND_REJECTED", joined.event.message);
    const submitted = applyRobotMatchCommand(joined.state, {
      type: "SUBMIT_BUILD",
      slot: "B",
      blueprint: selected.revision.blueprint,
    });
    if (!submitted.event.accepted) throw new RobotCombatServiceError("MATCH_COMMAND_REJECTED", submitted.event.message);
    const now = new Date();
    await transaction
      .update(robotCombatMatches)
      .set({
        phase: submitted.state.phase,
        playerBId: input.user.id,
        stateSnapshot: submitted.state as unknown as Record<string, unknown>,
        nextSequence: submitted.state.nextSequence,
        updatedAt: now,
      })
      .where(eq(robotCombatMatches.id, input.matchId));
    await transaction.insert(robotCombatMatchEvents).values([
      {
        matchId: input.matchId,
        sequence: joined.event.sequence,
        actionId: `join:${input.matchId}:${input.user.id}`,
        playerId: input.user.id,
        commandType: joined.event.type,
        commandPayload: { type: "JOIN", slot: "B" },
        stateHashBefore: hashRobotMatchState(current),
        stateHashAfter: hashRobotMatchState(joined.state),
        accepted: true,
      },
      {
        matchId: input.matchId,
        sequence: submitted.event.sequence,
        actionId: `submit:${input.matchId}:B:${selected.revision.blueprintHash}`,
        playerId: input.user.id,
        commandType: submitted.event.type,
        commandPayload: { type: "SUBMIT_BUILD", slot: "B", blueprintHash: selected.revision.blueprintHash },
        stateHashBefore: hashRobotMatchState(joined.state),
        stateHashAfter: hashRobotMatchState(submitted.state),
        accepted: true,
      },
    ]);
    return submitted.state;
  });
}

export async function getRobotMatch(input: { user: DemoUser; matchId: string }): Promise<RobotMatchState> {
  const env = getRuntimeEnv();
  if (env.DEMO_MODE) {
    assertDemoAccess(input.user);
    const match = memoryMatches.get(input.matchId);
    if (!match) throw new RobotCombatServiceError("MATCH_NOT_FOUND", "The match was not found.");
    if (!Object.values(match.state.players).some((player) => player?.playerId === input.user.id)) {
      throw new RobotCombatServiceError("MATCH_FORBIDDEN", "This match belongs to another player.");
    }
    return match.state;
  }
  return getDatabase().transaction(async (transaction) => {
    await assertPersistentPlayerAccess(transaction, input.user, "ROBOT_COMBAT_FREE");
    const [record] = await transaction
      .select()
      .from(robotCombatMatches)
      .where(
        and(
          eq(robotCombatMatches.id, input.matchId),
          sql`${robotCombatMatches.playerAId} = ${input.user.id} OR ${robotCombatMatches.playerBId} = ${input.user.id}`,
        ),
      )
      .limit(1);
    if (!record) throw new RobotCombatServiceError("MATCH_NOT_FOUND", "The match was not found.");
    return record.stateSnapshot as unknown as RobotMatchState;
  });
}

function playerSlot(state: RobotMatchState, userId: string): "A" | "B" {
  const slot = Object.entries(state.players).find(([, player]) => player?.playerId === userId)?.[0];
  if (slot !== "A" && slot !== "B") throw new RobotCombatServiceError("MATCH_FORBIDDEN", "This match belongs to another player.");
  return slot;
}

export async function commandRobotMatch(input: {
  user: DemoUser;
  matchId: string;
  actionId: string;
  command: RobotMatchCommand;
}): Promise<{ state: RobotMatchState; event: RobotMatchEvent; idempotentReplay?: boolean }> {
  if (!/^[A-Za-z0-9:_-]{12,128}$/.test(input.actionId)) {
    throw new RobotCombatServiceError("ACTION_ID_CONFLICT", "The action id is invalid.");
  }
  const env = getRuntimeEnv();
  if (env.DEMO_MODE) {
    assertDemoAccess(input.user);
    const match = memoryMatches.get(input.matchId);
    if (!match) throw new RobotCombatServiceError("MATCH_NOT_FOUND", "The match was not found.");
    const slot = playerSlot(match.state, input.user.id);
    if (input.command.type !== "TICK" && input.command.slot !== slot) {
      throw new RobotCombatServiceError("MATCH_FORBIDDEN", "The command slot does not belong to this player.");
    }
    if (match.actionIds.has(input.actionId)) {
      return { state: match.state, event: match.actionIds.get(input.actionId)!, idempotentReplay: true };
    }
    const applied = applyRobotMatchCommand(match.state, input.command);
    match.state = applied.state;
    match.actionIds.set(input.actionId, applied.event);
    return { state: applied.state, event: applied.event };
  }

  return getDatabase().transaction(async (transaction) => {
    await assertPersistentPlayerAccess(transaction, input.user, "ROBOT_COMBAT_FREE");
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('ROBOT_COMBAT_MATCH_V1'), hashtext(${input.matchId}))`);
    const [record] = await transaction
      .select()
      .from(robotCombatMatches)
      .where(eq(robotCombatMatches.id, input.matchId))
      .limit(1);
    if (!record) throw new RobotCombatServiceError("MATCH_NOT_FOUND", "The match was not found.");
    const current = record.stateSnapshot as unknown as RobotMatchState;
    const slot = playerSlot(current, input.user.id);
    if (input.command.type !== "TICK" && input.command.slot !== slot) {
      throw new RobotCombatServiceError("MATCH_FORBIDDEN", "The command slot does not belong to this player.");
    }
    const [existing] = await transaction
      .select()
      .from(robotCombatMatchEvents)
      .where(and(eq(robotCombatMatchEvents.matchId, input.matchId), eq(robotCombatMatchEvents.actionId, input.actionId)))
      .limit(1);
    if (existing) {
      return {
        state: current,
        event: {
          sequence: existing.sequence,
          type: existing.commandType as RobotMatchEvent["type"],
          accepted: existing.accepted,
          message: existing.accepted ? "Action replayed." : "Action was rejected.",
          atElapsedMs: current.elapsedMs,
        },
        idempotentReplay: true,
      };
    }
    const applied = applyRobotMatchCommand(current, input.command);
    const now = new Date();
    await transaction
      .update(robotCombatMatches)
      .set({
        phase: applied.state.phase,
        stateSnapshot: applied.state as unknown as Record<string, unknown>,
        nextSequence: applied.state.nextSequence,
        terminalReason: applied.state.terminalReason,
        startedAt: applied.state.phase === "ACTIVE" && !record.startedAt ? now : record.startedAt,
        completedAt: ["COMPLETED", "CANCELLED", "DISCONNECTED"].includes(applied.state.phase) ? now : record.completedAt,
        updatedAt: now,
      })
      .where(eq(robotCombatMatches.id, input.matchId));
    await transaction.insert(robotCombatMatchEvents).values({
      matchId: input.matchId,
      sequence: applied.event.sequence,
      actionId: input.actionId,
      playerId: input.user.id,
      commandType: applied.event.type,
      commandPayload: input.command as unknown as Record<string, unknown>,
      stateHashBefore: hashRobotMatchState(current),
      stateHashAfter: hashRobotMatchState(applied.state),
      accepted: applied.event.accepted,
      rejectionCode: applied.event.accepted ? null : "COMMAND_REJECTED",
    });
    return { state: applied.state, event: applied.event };
  });
}
