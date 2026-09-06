import { createHash } from "node:crypto";

export const ROBOT_COMBAT_GAME_KEY = "SGW_ROBOT_COMBAT" as const;
// V1 snapshots remain historical records. New matches use the repaired referee.
export const ROBOT_COMBAT_RULESET_VERSION = "ROBOT_COMBAT_RULES_V2" as const;
export type RobotCombatRulesetVersion = "ROBOT_COMBAT_RULES_V1" | typeof ROBOT_COMBAT_RULESET_VERSION;

export const ROBOT_COMBAT_PART_CATEGORIES = [
  "CHASSIS",
  "DRIVE",
  "POWER",
  "ARMOR",
  "WEAPON",
] as const;
export type RobotPartCategory = (typeof ROBOT_COMBAT_PART_CATEGORIES)[number];

export type RobotPartDefinition = {
  key: string;
  category: RobotPartCategory;
  displayName: string;
  massKg: number;
  powerDraw: number;
  powerOutput: number;
  maxQuantity: number;
  size: { x: number; y: number; z: number };
  sockets: ReadonlyArray<{
    key: string;
    accepts: readonly RobotPartCategory[];
  }>;
  maxMassKg?: number;
  basePowerOutput?: number;
  attributes: Readonly<Record<string, string | number | boolean>>;
};

const ALL_CATEGORIES: readonly RobotPartCategory[] = [
  "CHASSIS",
  "DRIVE",
  "POWER",
  "ARMOR",
  "WEAPON",
];

const ROOT_SOCKETS = [
  { key: "drive-left", accepts: ["DRIVE"] },
  { key: "drive-right", accepts: ["DRIVE"] },
  { key: "front-armor", accepts: ["ARMOR"] },
  { key: "front-weapon", accepts: ["WEAPON"] },
  { key: "top-power", accepts: ["POWER"] },
  { key: "top-weapon", accepts: ["WEAPON"] },
  { key: "side-left", accepts: ["ARMOR"] },
  { key: "side-right", accepts: ["ARMOR"] },
] as const;

const NO_SOCKETS: readonly [] = [];

export const ROBOT_COMBAT_PART_CATALOG: readonly RobotPartDefinition[] = [
  {
    key: "chassis.light",
    category: "CHASSIS",
    displayName: "Light frame",
    massKg: 42,
    powerDraw: 0,
    powerOutput: 0,
    maxQuantity: 1,
    size: { x: 1.7, y: 0.45, z: 1.4 },
    sockets: ROOT_SOCKETS,
    maxMassKg: 128,
    basePowerOutput: 6,
    attributes: { traction: 1.05, recovery: 0.75 },
  },
  {
    key: "chassis.heavy",
    category: "CHASSIS",
    displayName: "Heavy frame",
    massKg: 65,
    powerDraw: 0,
    powerOutput: 0,
    maxQuantity: 1,
    size: { x: 2.1, y: 0.55, z: 1.65 },
    sockets: ROOT_SOCKETS,
    maxMassKg: 180,
    basePowerOutput: 8,
    attributes: { traction: 1.2, recovery: 0.55 },
  },
  {
    key: "drive.wheel",
    category: "DRIVE",
    displayName: "Wheel drive",
    massKg: 8,
    powerDraw: 1,
    powerOutput: 0,
    maxQuantity: 2,
    size: { x: 0.34, y: 0.5, z: 0.62 },
    sockets: NO_SOCKETS,
    attributes: { traction: 1.1, topSpeed: 1.15, steering: 1.2 },
  },
  {
    key: "drive.track",
    category: "DRIVE",
    displayName: "Track drive",
    massKg: 17,
    powerDraw: 2,
    powerOutput: 0,
    maxQuantity: 2,
    size: { x: 0.38, y: 0.48, z: 1.1 },
    sockets: NO_SOCKETS,
    attributes: { traction: 1.45, topSpeed: 0.82, steering: 0.9 },
  },
  {
    key: "power.cell",
    category: "POWER",
    displayName: "Compact power cell",
    massKg: 11,
    powerDraw: 0,
    powerOutput: 4,
    maxQuantity: 1,
    size: { x: 0.62, y: 0.3, z: 0.52 },
    sockets: NO_SOCKETS,
    attributes: { heat: 0.8 },
  },
  {
    key: "power.twin",
    category: "POWER",
    displayName: "Twin power cell",
    massKg: 21,
    powerDraw: 0,
    powerOutput: 7,
    maxQuantity: 1,
    size: { x: 0.78, y: 0.36, z: 0.62 },
    sockets: NO_SOCKETS,
    attributes: { heat: 1.2 },
  },
  {
    key: "armor.wedge",
    category: "ARMOR",
    displayName: "Low wedge",
    massKg: 14,
    powerDraw: 0,
    powerOutput: 0,
    maxQuantity: 1,
    size: { x: 0.95, y: 0.25, z: 0.52 },
    sockets: NO_SOCKETS,
    attributes: { protection: 1.1, clearance: -0.04 },
  },
  {
    key: "armor.bumper",
    category: "ARMOR",
    displayName: "Wraparound bumper",
    massKg: 22,
    powerDraw: 0,
    powerOutput: 0,
    maxQuantity: 1,
    size: { x: 1.15, y: 0.34, z: 0.65 },
    sockets: NO_SOCKETS,
    attributes: { protection: 1.55, clearance: -0.02 },
  },
  {
    key: "weapon.ram",
    category: "WEAPON",
    displayName: "Impact ram",
    massKg: 12,
    powerDraw: 0,
    powerOutput: 0,
    maxQuantity: 1,
    size: { x: 0.9, y: 0.3, z: 0.5 },
    sockets: NO_SOCKETS,
    attributes: { damage: 18, cooldownMs: 900, reach: 1.2 },
  },
  {
    key: "weapon.spinner",
    category: "WEAPON",
    displayName: "Continuous spinner",
    massKg: 24,
    powerDraw: 3,
    powerOutput: 0,
    maxQuantity: 1,
    size: { x: 0.8, y: 0.26, z: 0.72 },
    sockets: NO_SOCKETS,
    attributes: { damage: 31, cooldownMs: 1200, reach: 1.35 },
  },
  {
    key: "weapon.hammer",
    category: "WEAPON",
    displayName: "Committed hammer",
    massKg: 29,
    powerDraw: 2,
    powerOutput: 0,
    maxQuantity: 1,
    size: { x: 0.68, y: 0.92, z: 0.58 },
    sockets: NO_SOCKETS,
    attributes: { damage: 44, cooldownMs: 1800, reach: 1.1 },
  },
] as const;

const PARTS_BY_KEY = new Map(
  ROBOT_COMBAT_PART_CATALOG.map((part) => [part.key, part]),
);

export type RobotBlueprintPart = {
  instanceId: string;
  partKey: string;
  parentInstanceId: string | null;
  socket: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
};

export type RobotBlueprint = {
  schemaVersion: 1;
  name: string;
  parts: RobotBlueprintPart[];
};

export type RobotInspectionErrorCode =
  | "NAME_REQUIRED"
  | "PART_UNKNOWN"
  | "DUPLICATE_INSTANCE"
  | "CHASSIS_COUNT"
  | "PART_LIMIT"
  | "PARENT_MISSING"
  | "PARENT_SOCKET_UNKNOWN"
  | "SOCKET_OCCUPIED"
  | "SOCKET_CATEGORY_MISMATCH"
  | "GRAPH_DISCONNECTED"
  | "DRIVE_COUNT"
  | "POWER_COUNT"
  | "WEAPON_COUNT"
  | "MASS_LIMIT"
  | "POWER_LIMIT"
  | "BALANCE_LIMIT"
  | "CLEARANCE_LIMIT"
  | "FOOTPRINT_LIMIT";

export type RobotInspectionError = {
  code: RobotInspectionErrorCode;
  message: string;
  instanceId?: string;
};

export type RobotInspectionMetrics = {
  massKg: number;
  maxMassKg: number;
  powerOutput: number;
  powerDraw: number;
  powerReserve: number;
  centerOfMass: { x: number; y: number; z: number };
  balanceScore: number;
  footprint: { x: number; z: number };
  clearanceCm: number;
  connectionCount: number;
  forcePath: "CONNECTED" | "BROKEN";
};

export type RobotInspection = {
  valid: boolean;
  blueprintHash: string;
  errors: RobotInspectionError[];
  metrics: RobotInspectionMetrics;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

export function canonicalRobotJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function hashRobotBlueprint(blueprint: RobotBlueprint): string {
  return createHash("sha256")
    .update(canonicalRobotJson(blueprint))
    .digest("hex");
}

export function getRobotPartDefinition(
  partKey: string,
): RobotPartDefinition | undefined {
  return PARTS_BY_KEY.get(partKey);
}

export function getRobotPartCatalog(): RobotPartDefinition[] {
  return ROBOT_COMBAT_PART_CATALOG.map((part) => ({
    ...part,
    sockets: part.sockets.map((socket) => ({ ...socket })),
    attributes: { ...part.attributes },
  }));
}

function emptyMetrics(): RobotInspectionMetrics {
  return {
    massKg: 0,
    maxMassKg: 0,
    powerOutput: 0,
    powerDraw: 0,
    powerReserve: 0,
    centerOfMass: { x: 0, y: 0, z: 0 },
    balanceScore: 0,
    footprint: { x: 0, z: 0 },
    clearanceCm: 0,
    connectionCount: 0,
    forcePath: "BROKEN",
  };
}

export function inspectRobotBlueprint(blueprint: RobotBlueprint): RobotInspection {
  const errors: RobotInspectionError[] = [];
  const metrics = emptyMetrics();
  const parts = Array.isArray(blueprint.parts) ? blueprint.parts : [];
  const byId = new Map<string, RobotBlueprintPart>();
  const definitions = new Map<string, RobotPartDefinition>();
  const occupiedSockets = new Set<string>();

  if (typeof blueprint.name !== "string" || blueprint.name.trim().length < 2) {
    errors.push({ code: "NAME_REQUIRED", message: "Name the machine before saving it." });
  }
  if (parts.length > 24) {
    errors.push({ code: "PART_LIMIT", message: "A machine can contain at most 24 parts." });
  }

  for (const part of parts) {
    if (!part || typeof part.instanceId !== "string") continue;
    if (byId.has(part.instanceId)) {
      errors.push({
        code: "DUPLICATE_INSTANCE",
        message: `Part instance ${part.instanceId} is duplicated.`,
        instanceId: part.instanceId,
      });
      continue;
    }
    byId.set(part.instanceId, part);
    const definition = PARTS_BY_KEY.get(part.partKey);
    if (!definition) {
      errors.push({
        code: "PART_UNKNOWN",
        message: `Part ${part.partKey} is not in the approved catalog.`,
        instanceId: part.instanceId,
      });
      continue;
    }
    definitions.set(part.instanceId, definition);
    metrics.massKg += definition.massKg;
    metrics.powerDraw += definition.powerDraw;
    metrics.powerOutput += definition.powerOutput;
    const position = part.position ?? { x: 0, y: 0, z: 0 };
    metrics.centerOfMass.x += position.x * definition.massKg;
    metrics.centerOfMass.y += position.y * definition.massKg;
    metrics.centerOfMass.z += position.z * definition.massKg;
    metrics.footprint.x = Math.max(
      metrics.footprint.x,
      Math.abs(position.x) * 2 + definition.size.x,
    );
    metrics.footprint.z = Math.max(
      metrics.footprint.z,
      Math.abs(position.z) * 2 + definition.size.z,
    );
    const clearance =
      0.15 + position.y - definition.size.y / 2 +
      Number(definition.attributes.clearance ?? 0);
    metrics.clearanceCm =
      metrics.clearanceCm === 0
        ? Math.round(clearance * 100)
        : Math.min(metrics.clearanceCm, Math.round(clearance * 100));
  }

  const chassis = parts.filter(
    (part) => definitions.get(part.instanceId)?.category === "CHASSIS",
  );
  const drives = parts.filter(
    (part) => definitions.get(part.instanceId)?.category === "DRIVE",
  );
  const powers = parts.filter(
    (part) => definitions.get(part.instanceId)?.category === "POWER",
  );
  const weapons = parts.filter(
    (part) => definitions.get(part.instanceId)?.category === "WEAPON",
  );

  if (chassis.length !== 1) {
    errors.push({
      code: "CHASSIS_COUNT",
      message: "A machine needs exactly one frame.",
    });
  }
  if (drives.length < 2) {
    errors.push({
      code: "DRIVE_COUNT",
      message: "Attach at least two drive modules to move and recover.",
    });
  }
  if (powers.length !== 1) {
    errors.push({
      code: "POWER_COUNT",
      message: "Attach exactly one power module.",
    });
  }
  if (weapons.length > 1) {
    errors.push({
      code: "WEAPON_COUNT",
      message: "A first-release machine may carry one weapon module.",
    });
  }

  const root = chassis[0];
  const rootDefinition = root ? definitions.get(root.instanceId) : undefined;
  if (root && root.parentInstanceId !== null) {
    errors.push({
      code: "PARENT_MISSING",
      message: "The frame must be the root of the assembly.",
      instanceId: root.instanceId,
    });
  }
  metrics.maxMassKg = rootDefinition?.maxMassKg ?? 0;
  metrics.powerOutput += rootDefinition?.basePowerOutput ?? 0;

  for (const part of parts) {
    const definition = definitions.get(part.instanceId);
    if (!definition || part === root) continue;
    if (!part.parentInstanceId || !byId.has(part.parentInstanceId)) {
      errors.push({
        code: "PARENT_MISSING",
        message: `Part ${definition.displayName} is not attached to the assembly.`,
        instanceId: part.instanceId,
      });
      continue;
    }
    const parent = byId.get(part.parentInstanceId)!;
    const parentDefinition = definitions.get(parent.instanceId);
    const socket = parentDefinition?.sockets.find((candidate) => candidate.key === part.socket);
    if (!socket) {
      errors.push({
        code: "PARENT_SOCKET_UNKNOWN",
        message: `Socket ${part.socket} does not exist on ${parentDefinition?.displayName ?? "the parent"}.`,
        instanceId: part.instanceId,
      });
      continue;
    }
    const socketIdentity = `${parent.instanceId}:${part.socket}`;
    if (occupiedSockets.has(socketIdentity)) {
      errors.push({
        code: "SOCKET_OCCUPIED",
        message: `Socket ${part.socket} is already occupied.`,
        instanceId: part.instanceId,
      });
    }
    occupiedSockets.add(socketIdentity);
    if (!socket.accepts.includes(definition.category)) {
      errors.push({
        code: "SOCKET_CATEGORY_MISMATCH",
        message: `${definition.displayName} cannot attach to ${part.socket}.`,
        instanceId: part.instanceId,
      });
    }
    metrics.connectionCount += 1;
  }

  if (root) {
    const reachable = new Set<string>();
    const visit = (parentId: string) => {
      if (reachable.has(parentId)) return;
      reachable.add(parentId);
      for (const part of parts) {
        if (part.parentInstanceId === parentId) visit(part.instanceId);
      }
    };
    visit(root.instanceId);
    for (const part of parts) {
      if (!reachable.has(part.instanceId)) {
        errors.push({
          code: "GRAPH_DISCONNECTED",
          message: `${definitions.get(part.instanceId)?.displayName ?? "Part"} is disconnected from the frame.`,
          instanceId: part.instanceId,
        });
      }
    }
    metrics.forcePath = errors.some((error) =>
      ["PARENT_MISSING", "PARENT_SOCKET_UNKNOWN", "SOCKET_CATEGORY_MISMATCH", "GRAPH_DISCONNECTED"].includes(error.code),
    )
      ? "BROKEN"
      : "CONNECTED";
  }

  if (metrics.massKg > metrics.maxMassKg && metrics.maxMassKg > 0) {
    errors.push({
      code: "MASS_LIMIT",
      message: `The frame supports ${metrics.maxMassKg} kg; this assembly weighs ${metrics.massKg} kg.`,
    });
  }
  if (metrics.powerDraw > metrics.powerOutput) {
    errors.push({
      code: "POWER_LIMIT",
      message: `The assembly draws ${metrics.powerDraw} power against ${metrics.powerOutput} available.`,
    });
  }
  if (metrics.massKg > 0) {
    metrics.centerOfMass.x /= metrics.massKg;
    metrics.centerOfMass.y /= metrics.massKg;
    metrics.centerOfMass.z /= metrics.massKg;
  }
  const balanceOffset = Math.hypot(metrics.centerOfMass.x, metrics.centerOfMass.z);
  metrics.balanceScore = Math.max(0, Math.round(100 - balanceOffset * 35));
  if (balanceOffset > 1.5) {
    errors.push({
      code: "BALANCE_LIMIT",
      message: "The center of mass is outside the stable driving envelope.",
    });
  }
  if (metrics.clearanceCm < 0) {
    errors.push({
      code: "CLEARANCE_LIMIT",
      message: "A module is below the declared arena clearance.",
    });
  }
  if (metrics.footprint.x > 3.8 || metrics.footprint.z > 3.8) {
    errors.push({
      code: "FOOTPRINT_LIMIT",
      message: "The assembly exceeds the arena footprint envelope.",
    });
  }

  const counts = new Map<string, number>();
  for (const part of parts) counts.set(part.partKey, (counts.get(part.partKey) ?? 0) + 1);
  for (const [partKey, count] of counts) {
    const definition = PARTS_BY_KEY.get(partKey);
    if (definition && count > definition.maxQuantity) {
      errors.push({
        code: "PART_LIMIT",
        message: `${definition.displayName} may be used ${definition.maxQuantity} time(s).`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    blueprintHash: hashRobotBlueprint(blueprint),
    errors,
    metrics: {
      ...metrics,
      powerReserve: metrics.powerOutput - metrics.powerDraw,
    },
  };
}

function blueprintPart(
  instanceId: string,
  partKey: string,
  parentInstanceId: string | null,
  socket: string,
  position: { x: number; y: number; z: number },
): RobotBlueprintPart {
  return { instanceId, partKey, parentInstanceId, socket, position, rotationY: 0 };
}

export type RobotStarterArchetype = "PUSHER" | "CONTROL" | "STRIKER";

export function createStarterRobotBlueprint(
  archetype: RobotStarterArchetype,
): RobotBlueprint {
  const common = [
    blueprintPart("frame", archetype === "PUSHER" ? "chassis.light" : "chassis.heavy", null, "root", {
      x: 0,
      y: 0.4,
      z: 0,
    }),
    blueprintPart("drive-left", archetype === "CONTROL" ? "drive.track" : "drive.wheel", "frame", "drive-left", {
      x: -0.85,
      y: 0.15,
      z: 0,
    }),
    blueprintPart("drive-right", archetype === "CONTROL" ? "drive.track" : "drive.wheel", "frame", "drive-right", {
      x: 0.85,
      y: 0.15,
      z: 0,
    }),
    blueprintPart("power", archetype === "STRIKER" ? "power.twin" : "power.cell", "frame", "top-power", {
      x: 0,
      y: 0.82,
      z: 0,
    }),
  ];
  if (archetype === "PUSHER") {
    common.push(
      blueprintPart("armor", "armor.wedge", "frame", "front-armor", { x: 0, y: 0.27, z: -0.9 }),
      blueprintPart("weapon", "weapon.ram", "frame", "front-weapon", { x: 0, y: 0.32, z: -1.0 }),
    );
  } else if (archetype === "CONTROL") {
    common.push(
      blueprintPart("armor", "armor.bumper", "frame", "front-armor", { x: 0, y: 0.32, z: -0.9 }),
      blueprintPart("weapon", "weapon.spinner", "frame", "top-weapon", { x: 0, y: 0.8, z: 0 }),
    );
  } else {
    common.push(
      blueprintPart("armor", "armor.wedge", "frame", "front-armor", { x: 0, y: 0.28, z: -1.05 }),
      blueprintPart("weapon", "weapon.hammer", "frame", "top-weapon", { x: 0, y: 0.9, z: 0 }),
    );
  }
  return {
    schemaVersion: 1,
    name: `${archetype.toLowerCase()} starter`,
    parts: common,
  };
}

export type RobotMatchPhase =
  | "WAITING_FOR_OPPONENT"
  | "READY_CHECK"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "DISCONNECTED";

export type RobotMatchSlot = "A" | "B";

export type RobotMatchPlayer = {
  playerId: string;
  displayName: string;
  slot: RobotMatchSlot;
  connected: boolean;
  ready: boolean;
  blueprint?: RobotBlueprint;
  inspection?: RobotInspection;
};

export type RobotCombatRobotState = {
  position: { x: number; z: number };
  heading: number;
  throttle: number;
  steering: number;
  integrity: number;
  components: Record<string, number>;
  disabledComponents: string[];
  damageLog: RobotDamageRecord[];
  lastActionAt: number;
  weaponReadyAtMs?: number;
  inContact?: boolean;
  contactPending?: boolean;
};

export type RobotDamageRecord = {
  sourceSlot: RobotMatchSlot;
  targetComponent: string;
  damage: number;
  componentRemaining: number;
  elapsedMs: number;
};

export type RobotMatchState = {
  matchId: string;
  rulesetVersion: RobotCombatRulesetVersion;
  arenaKey: string;
  mode?: "MATCH" | "PRIVATE_TEST";
  phase: RobotMatchPhase;
  players: Partial<Record<RobotMatchSlot, RobotMatchPlayer>>;
  robots: Partial<Record<RobotMatchSlot, RobotCombatRobotState>>;
  elapsedMs: number;
  // Assigned by the service, never by a request payload. Persisted with the state.
  serverClock?: { startedAtMs: number };
  nextSequence: number;
  winnerSlot?: RobotMatchSlot;
  terminalReason?: string;
  rebuildQuestions: Partial<Record<RobotMatchSlot, string[]>>;
  testReport?: RobotTestReport;
  lastEvent?: RobotMatchEvent;
};

export type RobotTestConsequence = {
  kind: "CONTACT" | "WEAPON";
  targetComponent: string;
  damage: number;
  componentRemaining: number;
  message: string;
  elapsedMs: number;
};

export type RobotTestReport = {
  controlsAccepted: number;
  contacts: number;
  weaponUses: number;
  resets: number;
  consequences: RobotTestConsequence[];
};

export type RobotMatchCommand =
  | { type: "JOIN"; playerId: string; displayName: string; slot?: RobotMatchSlot }
  | { type: "SUBMIT_BUILD"; slot: RobotMatchSlot; blueprint: RobotBlueprint }
  | { type: "READY"; slot: RobotMatchSlot }
  | { type: "CONTROL"; slot: RobotMatchSlot; throttle: number; steering: number }
  | { type: "FIRE"; slot: RobotMatchSlot }
  | { type: "TEST_CONTACT"; slot: RobotMatchSlot }
  | { type: "RESET_TEST"; slot: RobotMatchSlot }
  | { type: "TICK"; elapsedMs: number }
  | { type: "DISCONNECT"; slot: RobotMatchSlot; reason: string }
  | { type: "CANCEL"; slot: RobotMatchSlot; reason: string };

export type RobotMatchEvent = {
  sequence: number;
  type: RobotMatchCommand["type"] | "DAMAGE" | "MATCH_STARTED" | "MATCH_COMPLETED";
  slot?: RobotMatchSlot;
  accepted: boolean;
  message: string;
  atElapsedMs: number;
  metadata?: Record<string, string | number | boolean>;
};

export function hashRobotMatchState(state: RobotMatchState): string {
  const { lastEvent, nextSequence, ...canonicalState } = state;
  void lastEvent;
  void nextSequence;
  return createHash("sha256")
    .update(canonicalRobotJson(canonicalState))
    .digest("hex");
}

export function createRobotMatchState(input: {
  matchId: string;
  arenaKey: string;
  player: Omit<RobotMatchPlayer, "slot" | "connected" | "ready">;
}): RobotMatchState {
  return {
    matchId: input.matchId,
    rulesetVersion: ROBOT_COMBAT_RULESET_VERSION,
    arenaKey: input.arenaKey,
    mode: "MATCH",
    phase: "WAITING_FOR_OPPONENT",
    players: {
      A: {
        ...input.player,
        slot: "A",
        connected: true,
        ready: false,
      },
    },
    robots: {},
    elapsedMs: 0,
    nextSequence: 1,
    rebuildQuestions: {},
  };
}

export function createRobotTestState(input: {
  matchId: string;
  arenaKey: string;
  player: Omit<RobotMatchPlayer, "slot" | "connected" | "ready">;
  blueprint: RobotBlueprint;
}): RobotMatchState {
  const initial = createRobotMatchState({
    matchId: input.matchId,
    arenaKey: input.arenaKey,
    player: input.player,
  });
  const submitted = applyRobotMatchCommand(initial, {
    type: "SUBMIT_BUILD",
    slot: "A",
    blueprint: input.blueprint,
  });
  if (!submitted.event.accepted) {
    throw new Error("ROBOT_COMBAT_TEST_BUILD_INVALID");
  }
  const testStartEvent: RobotMatchEvent = {
    sequence: submitted.event.sequence,
    type: "MATCH_STARTED",
    slot: "A",
    accepted: true,
    message: "Private test bay opened with the saved machine.",
    atElapsedMs: 0,
  };
  return {
    ...submitted.state,
    mode: "PRIVATE_TEST",
    phase: "ACTIVE",
    players: {
      ...submitted.state.players,
      B: {
        playerId: "robot-combat-training-target",
        displayName: "Training target",
        slot: "B",
        connected: true,
        ready: true,
      },
    },
    robots: {
      A: createRobotState({ x: 0, z: -3.5 }),
      B: createRobotState({ x: 0, z: 0 }),
    },
    testReport: {
      controlsAccepted: 0,
      contacts: 0,
      weaponUses: 0,
      resets: 0,
      consequences: [],
    },
    lastEvent: testStartEvent,
  };
}

function matchEvent(
  state: RobotMatchState,
  event: Omit<RobotMatchEvent, "sequence" | "atElapsedMs">,
): RobotMatchEvent {
  return {
    ...event,
    sequence: state.nextSequence,
    atElapsedMs: state.elapsedMs,
  };
}

function rejection(state: RobotMatchState, command: RobotMatchCommand, message: string) {
  const event = matchEvent(state, {
    type: command.type,
    slot: "slot" in command ? command.slot : undefined,
    accepted: false,
    message,
  });
  return { state: { ...state, nextSequence: state.nextSequence + 1, lastEvent: event }, event };
}

function readyPlayer(state: RobotMatchState, slot: RobotMatchSlot): RobotMatchPlayer | undefined {
  return state.players[slot];
}

function withEvent(state: RobotMatchState, event: RobotMatchEvent, changes: Partial<RobotMatchState> = {}) {
  return {
    state: { ...state, ...changes, nextSequence: state.nextSequence + 1, lastEvent: event },
    event,
  };
}

export function applyRobotMatchCommand(
  state: RobotMatchState,
  command: RobotMatchCommand,
): { state: RobotMatchState; event: RobotMatchEvent } {
  if (state.rulesetVersion !== ROBOT_COMBAT_RULESET_VERSION) {
    return rejection(state, command, "This earlier match is read-only. Start a new match with your saved machine.");
  }
  if (["COMPLETED", "CANCELLED", "DISCONNECTED"].includes(state.phase)
    && !(command.type === "RESET_TEST" && state.mode === "PRIVATE_TEST")) {
    return rejection(state, command, "The match is already terminal.");
  }
  if (command.type === "JOIN") {
    if (state.phase !== "WAITING_FOR_OPPONENT") return rejection(state, command, "This match is no longer accepting an opponent.");
    const slot = command.slot ?? (state.players.A ? "B" : "A");
    if (state.players[slot] || Object.values(state.players).some((player) => player?.playerId === command.playerId)) {
      return rejection(state, command, "That player or slot is already present.");
    }
    const player: RobotMatchPlayer = {
      playerId: command.playerId,
      displayName: command.displayName,
      slot,
      connected: true,
      ready: false,
    };
    const event = matchEvent(state, { type: "JOIN", slot, accepted: true, message: `${command.displayName} joined the match.` });
    return withEvent(state, event, {
      players: { ...state.players, [slot]: player },
      phase: "READY_CHECK",
    });
  }

  if (command.type === "TICK") {
    if (state.phase !== "ACTIVE") return rejection(state, command, "The match clock is not active.");
    if (!Number.isSafeInteger(command.elapsedMs) || command.elapsedMs < 0 || command.elapsedMs > 250) {
      return rejection(state, command, "The simulation step is invalid.");
    }
    // This pure reducer accepts simulation deltas only from the server clock.
    // The request service does not forward a browser's elapsedMs here.
    let robots = state.robots;
    let remaining = command.elapsedMs;
    while (remaining > 0) {
      const step = Math.min(50, remaining);
      robots = moveRobots(state, robots, step);
      remaining -= step;
    }
    const elapsedMs = state.elapsedMs + command.elapsedMs;
    const event = { ...matchEvent(state, { type: "TICK", accepted: true, message: "Match state refreshed." }), atElapsedMs: elapsedMs };
    return withEvent(state, event, { elapsedMs, robots });
  }

  const player = "slot" in command ? readyPlayer(state, command.slot) : undefined;
  if (!player) return rejection(state, command, "The requested player slot is not present.");
  if (!player.connected && command.type !== "DISCONNECT") return rejection(state, command, "The player is disconnected.");

  if (command.type === "SUBMIT_BUILD") {
    if (state.phase !== "WAITING_FOR_OPPONENT" && state.phase !== "READY_CHECK") return rejection(state, command, "Builds are locked after the match starts.");
    const inspection = inspectRobotBlueprint(command.blueprint);
    if (!inspection.valid) return rejection(state, command, inspection.errors[0]?.message ?? "The machine failed inspection.");
    const updated = { ...player, blueprint: command.blueprint, inspection, ready: false };
    const event = matchEvent(state, { type: "SUBMIT_BUILD", slot: command.slot, accepted: true, message: "Machine inspected and submitted.", metadata: { blueprintHash: inspection.blueprintHash } });
    return withEvent(state, event, { players: { ...state.players, [command.slot]: updated } });
  }

  if (command.type === "READY") {
    if (state.phase !== "READY_CHECK") return rejection(state, command, "The match is not in the ready check.");
    if (!player.inspection?.valid || !player.blueprint) return rejection(state, command, "Submit an inspection-valid machine first.");
    const updated = { ...player, ready: true };
    const players = { ...state.players, [command.slot]: updated };
    const bothReady = players.A?.ready === true && players.B?.ready === true;
    const nextPhase: RobotMatchPhase = bothReady ? "ACTIVE" : "READY_CHECK";
    const nextRobots = bothReady
      ? {
          A: createRobotState({ x: 0, z: -3.5 }),
          B: { ...createRobotState({ x: 0, z: 3.5 }), heading: Math.PI },
        }
      : state.robots;
    const event = matchEvent(state, {
      type: bothReady ? "MATCH_STARTED" : "READY",
      slot: command.slot,
      accepted: true,
      message: bothReady ? "Both machines ready. Match started." : "Player ready; waiting for the other machine.",
    });
    return withEvent(state, event, { players, phase: nextPhase, robots: nextRobots });
  }

  if (command.type === "CONTROL") {
    if (state.phase !== "ACTIVE") return rejection(state, command, "Controls are only accepted during an active match.");
    if (!Number.isFinite(command.throttle) || !Number.isFinite(command.steering)) {
      return rejection(state, command, "The drive input is invalid.");
    }
    const currentRobot = state.robots[command.slot];
    if (!currentRobot) return rejection(state, command, "The machine is not present.");
    if ((!componentUsable(currentRobot, "drive") || !componentUsable(currentRobot, "power") || !componentUsable(currentRobot, "frame"))
      && (command.throttle !== 0 || command.steering !== 0)) {
      return rejection(state, command, "This machine cannot drive while its drive, power, or frame is disabled.");
    }
    const throttle = Math.max(-1, Math.min(1, command.throttle));
    const steering = Math.max(-1, Math.min(1, command.steering));
    const robot = state.robots[command.slot] ?? createRobotState();
    const updatedRobot = { ...robot, throttle, steering, lastActionAt: state.elapsedMs };
    const event = matchEvent(state, { type: "CONTROL", slot: command.slot, accepted: true, message: "Control input accepted." });
    return withEvent(state, event, {
      robots: { ...state.robots, [command.slot]: updatedRobot },
      testReport: state.mode === "PRIVATE_TEST"
        ? { ...state.testReport!, controlsAccepted: state.testReport!.controlsAccepted + 1 }
        : state.testReport,
    });
  }

  if (command.type === "FIRE") {
    if (state.phase !== "ACTIVE") return rejection(state, command, "Weapons are only accepted during an active match.");
    const opponentSlot: RobotMatchSlot = command.slot === "A" ? "B" : "A";
    const attacker = player.inspection;
    const attackerRobot = state.robots[command.slot];
    const opponentRobot = state.robots[opponentSlot];
    if (!attackerRobot || !opponentRobot) return rejection(state, command, "Both machines must be present.");
    if (!["frame", "power", "weapon"].every((component) => componentUsable(attackerRobot, component))) {
      return rejection(state, command, "This machine cannot fire while its weapon, power, or frame is disabled.");
    }
    const weapon = player.blueprint?.parts
      .map((part) => getRobotPartDefinition(part.partKey))
      .find((part) => part?.category === "WEAPON");
    if (!attacker || !weapon) return rejection(state, command, "The submitted machine has no usable weapon.");
    const reach = Number(weapon.attributes.reach);
    const cooldownMs = Number(weapon.attributes.cooldownMs);
    const baseDamage = Number(weapon.attributes.damage);
    if (![reach, cooldownMs, baseDamage].every((value) => Number.isFinite(value) && value > 0)) {
      return rejection(state, command, "This weapon has no valid combat configuration.");
    }
    if (state.elapsedMs < (attackerRobot.weaponReadyAtMs ?? 0)) {
      return rejection(state, command, "The weapon is recovering from its last strike.");
    }
    const dx = opponentRobot.position.x - attackerRobot.position.x;
    const dz = opponentRobot.position.z - attackerRobot.position.z;
    const distance = Math.hypot(dx, dz);
    const reachLimit = robotBodyRadius(state.players[command.slot]) + robotBodyRadius(state.players[opponentSlot]) + reach;
    if (!Number.isFinite(distance) || distance > reachLimit) {
      return rejection(state, command, "Move closer. The opponent is outside this weapon's reach.");
    }
    if (dx * Math.sin(attackerRobot.heading) + dz * Math.cos(attackerRobot.heading) <= 0) {
      return rejection(state, command, "Face the opponent before striking.");
    }
    const armor = playerParts(state.players[opponentSlot], "ARMOR");
    const protection = Math.max(1, ...armor.map((part) => Number(part.attributes.protection ?? 1)));
    const damage = Math.max(1, Math.round(baseDamage / protection));
    const targetComponent = weaponKeyTarget(
      player.blueprint?.parts.find((part) => getRobotPartDefinition(part.partKey)?.category === "WEAPON")?.partKey,
    );
    const componentBefore = opponentRobot.components[targetComponent] ?? 100;
    const componentDamage = Math.max(1, Math.round(damage * 0.65));
    const componentRemaining = Math.max(0, componentBefore - componentDamage);
    const damageRecord: RobotDamageRecord = {
      sourceSlot: command.slot,
      targetComponent,
      damage: componentBefore - componentRemaining,
      componentRemaining,
      elapsedMs: state.elapsedMs,
    };
    const components = { ...opponentRobot.components, [targetComponent]: componentRemaining };
    const disabledComponents = components[targetComponent] === 0 && !opponentRobot.disabledComponents.includes(targetComponent)
      ? [...opponentRobot.disabledComponents, targetComponent]
      : opponentRobot.disabledComponents;
    const integrity = Math.max(0, opponentRobot.integrity - damage);
    const opponent = {
      ...opponentRobot,
      integrity,
      components,
      disabledComponents,
      damageLog: [...opponentRobot.damageLog, damageRecord],
      lastActionAt: state.elapsedMs,
    };
    const completed = integrity === 0 || disabledComponents.includes("frame");
    const rebuildQuestions = {
      ...state.rebuildQuestions,
      [opponentSlot]: rebuildQuestionsFor(targetComponent, componentRemaining),
    };
    const event = matchEvent(state, {
      type: completed ? "MATCH_COMPLETED" : "DAMAGE",
      slot: command.slot,
      accepted: true,
      message: completed ? "The opponent machine is disabled." : "Localized component damage recorded.",
      metadata: {
        damage,
        target: opponentSlot,
        targetComponent,
        componentRemaining,
        remainingIntegrity: integrity,
      },
    });
    return withEvent(state, event, {
      robots: {
        ...state.robots,
        [command.slot]: { ...attackerRobot, weaponReadyAtMs: state.elapsedMs + cooldownMs, lastActionAt: state.elapsedMs },
        [opponentSlot]: (!componentUsable(opponent, "drive") || !componentUsable(opponent, "power") || !componentUsable(opponent, "frame"))
          ? { ...opponent, throttle: 0, steering: 0 }
          : opponent,
      },
      phase: completed ? "COMPLETED" : state.phase,
      winnerSlot: completed ? command.slot : state.winnerSlot,
      terminalReason: completed ? "OPPONENT_DISABLED" : state.terminalReason,
      rebuildQuestions,
      testReport: state.mode === "PRIVATE_TEST"
        ? {
            ...state.testReport!,
            weaponUses: state.testReport!.weaponUses + 1,
            consequences: [
              ...state.testReport!.consequences,
              {
                kind: "WEAPON" as const,
                targetComponent,
                damage: componentBefore - componentRemaining,
                componentRemaining,
                message: `Weapon fire stressed the ${targetComponent} component.`,
                elapsedMs: state.elapsedMs,
              },
            ].slice(-12),
          }
        : state.testReport,
    });
  }

  if (command.type === "TEST_CONTACT") {
    if (state.mode !== "PRIVATE_TEST") return rejection(state, command, "Contact trials are only available in the private test bay.");
    if (state.phase !== "ACTIVE") return rejection(state, command, "The private test bay is not active.");
    const robot = state.robots[command.slot] ?? createRobotState();
    if (!robot.contactPending || robot.throttle <= 0
      || !["frame", "drive", "power"].every((component) => componentUsable(robot, component))) {
      return rejection(state, command, "Drive into the target before recording a new contact.");
    }
    const playerInspection = state.players[command.slot]?.inspection;
    const balanceScore = playerInspection?.metrics.balanceScore ?? 50;
    const targetComponent = balanceScore < 70 ? "drive" : "frame";
    const damage = Math.max(6, Math.round(12 + (100 - balanceScore) * 0.12));
    const target = state.robots.B ?? createRobotState({ x: 0, z: 0 });
    const componentBefore = target.components[targetComponent] ?? 100;
    const componentRemaining = Math.max(0, componentBefore - damage);
    const damageRecord: RobotDamageRecord = {
      sourceSlot: command.slot,
      targetComponent,
      damage: componentBefore - componentRemaining,
      componentRemaining,
      elapsedMs: state.elapsedMs,
    };
    const updatedTarget = {
      ...target,
      components: { ...target.components, [targetComponent]: componentRemaining },
      integrity: Math.max(0, target.integrity - Math.round(damage * 0.5)),
      disabledComponents: componentRemaining === 0 && !target.disabledComponents.includes(targetComponent)
        ? [...target.disabledComponents, targetComponent]
        : target.disabledComponents,
      damageLog: [...target.damageLog, damageRecord],
      lastActionAt: state.elapsedMs,
    };
    const event = matchEvent(state, {
      type: "TEST_CONTACT",
      slot: command.slot,
      accepted: true,
      message: `Contact recorded against the ${targetComponent} path.`,
      metadata: { targetComponent, damage: componentBefore - componentRemaining, balanceScore },
    });
    return withEvent(state, event, {
      robots: { ...state.robots, [command.slot]: { ...robot, contactPending: false }, B: updatedTarget },
      testReport: {
        ...state.testReport!,
        contacts: state.testReport!.contacts + 1,
        consequences: [
          ...state.testReport!.consequences,
          {
            kind: "CONTACT" as const,
            targetComponent,
            damage: componentBefore - componentRemaining,
            componentRemaining,
            message: `Contact stressed the ${targetComponent} path; balance score was ${balanceScore}.`,
            elapsedMs: state.elapsedMs,
          },
        ].slice(-12),
      },
    });
  }

  if (command.type === "RESET_TEST") {
    if (state.mode !== "PRIVATE_TEST") return rejection(state, command, "Reset is only available in the private test bay.");
    const event = matchEvent(state, {
      type: "RESET_TEST",
      slot: command.slot,
      accepted: true,
      message: "Private test reset. The saved machine is ready for another trial.",
    });
    return withEvent(state, event, {
      phase: "ACTIVE",
      elapsedMs: 0,
      winnerSlot: undefined,
      terminalReason: undefined,
      rebuildQuestions: {},
      robots: {
        A: createRobotState({ x: 0, z: -3.5 }),
        B: createRobotState({ x: 0, z: 0 }),
      },
      testReport: {
        controlsAccepted: 0,
        contacts: 0,
        weaponUses: 0,
        resets: (state.testReport?.resets ?? 0) + 1,
        consequences: [],
      },
    });
  }

  if (command.type === "DISCONNECT") {
    const event = matchEvent(state, { type: "DISCONNECT", slot: command.slot, accepted: true, message: command.reason });
    return withEvent(state, event, {
      players: { ...state.players, [command.slot]: { ...player, connected: false, ready: false } },
      phase: state.phase === "COMPLETED" || state.phase === "CANCELLED" ? state.phase : "DISCONNECTED",
      terminalReason: state.phase === "ACTIVE" ? "PLAYER_DISCONNECTED" : command.reason,
    });
  }

  if (command.type === "CANCEL") {
    if (state.phase === "COMPLETED" || state.phase === "CANCELLED") return rejection(state, command, "The match is already terminal.");
    const event = matchEvent(state, { type: "CANCEL", slot: command.slot, accepted: true, message: command.reason });
    return withEvent(state, event, { phase: "CANCELLED", terminalReason: command.reason });
  }

  return rejection(state, command, "Unsupported match command.");
}

function createRobotState(position: { x: number; z: number } = { x: 0, z: 0 }): RobotCombatRobotState {
  return {
    position,
    heading: 0,
    throttle: 0,
    steering: 0,
    integrity: 100,
    components: { frame: 100, drive: 100, weapon: 100, power: 100 },
    disabledComponents: [],
    damageLog: [],
    lastActionAt: 0,
    weaponReadyAtMs: 0,
    inContact: false,
    contactPending: false,
  };
}

function componentUsable(robot: RobotCombatRobotState, component: string): boolean {
  return robot.integrity > 0 && Number.isFinite(robot.components[component])
    && robot.components[component] > 0 && !robot.disabledComponents.includes(component);
}

function playerParts(player: RobotMatchPlayer | undefined, category: RobotPartCategory): RobotPartDefinition[] {
  return (player?.blueprint?.parts ?? [])
    .map((part) => getRobotPartDefinition(part.partKey))
    .filter((part): part is RobotPartDefinition => part?.category === category);
}

function robotBodyRadius(player: RobotMatchPlayer | undefined): number {
  const chassis = playerParts(player, "CHASSIS")[0];
  // Conservative 2D body envelope, not a claim of per-part 3D collision physics.
  return chassis ? Math.hypot(chassis.size.x, chassis.size.z) / 2 : 0.5;
}

function moveRobots(state: RobotMatchState, previous: RobotMatchState["robots"], elapsedMs: number): RobotMatchState["robots"] {
  const robots = { ...previous };
  for (const slot of ["A", "B"] as const) {
    const robot = previous[slot];
    if (!robot) continue;
    const drives = playerParts(state.players[slot], "DRIVE");
    const canMove = drives.length >= 2 && ["frame", "drive", "power"].every((component) => componentUsable(robot, component));
    const average = (key: string) => drives.reduce((total, drive) => total + Number(drive.attributes[key] ?? 1), 0) / Math.max(1, drives.length);
    const throttle = canMove ? robot.throttle : 0;
    const steering = canMove ? robot.steering : 0;
    const heading = robot.heading + steering * elapsedMs * 0.002 * average("steering");
    const distance = throttle * elapsedMs * 0.002 * average("topSpeed");
    const radius = robotBodyRadius(state.players[slot]);
    robots[slot] = {
      ...robot,
      throttle,
      steering,
      heading,
      position: {
        x: Math.max(-7.5 + radius, Math.min(7.5 - radius, robot.position.x + Math.sin(heading) * distance)),
        z: Math.max(-5.5 + radius, Math.min(5.5 - radius, robot.position.z + Math.cos(heading) * distance)),
      },
    };
  }
  const a = robots.A;
  const b = robots.B;
  if (a && b && previous.A && previous.B) {
    const minimum = robotBodyRadius(state.players.A) + robotBodyRadius(state.players.B);
    const distance = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
    const oldDistance = Math.hypot(previous.A.position.x - previous.B.position.x, previous.A.position.z - previous.B.position.z);
    const contact = distance <= minimum && distance <= oldDistance;
    // Stop penetration symmetrically. Momentum, lifting and per-part contacts
    // remain separate gameplay work; no fabricated collision damage is added.
    robots.A = { ...a, position: contact ? previous.A.position : a.position, inContact: contact,
      contactPending: contact && !previous.A.inContact ? true : contact ? a.contactPending : false };
    robots.B = { ...b, position: contact ? previous.B.position : b.position, inContact: contact,
      contactPending: contact && !previous.B.inContact ? true : contact ? b.contactPending : false };
  }
  return robots;
}

function weaponKeyTarget(partKey: string | undefined): string {
  if (partKey === "weapon.spinner") return "drive";
  if (partKey === "weapon.hammer") return "weapon";
  return "frame";
}

function rebuildQuestionsFor(component: string, remaining: number): string[] {
  if (remaining === 0) {
    return component === "drive"
      ? ["What mounting or traction change keeps the drive alive after first contact?"]
      : component === "weapon"
        ? ["Can the weapon mount recover after a committed strike?", "Does the frame still protect the power path?"]
        : ["What front geometry or balance change keeps the frame from taking the whole impact?"];
  }
  return component === "drive"
    ? ["Did the drive take damage because of traction, balance, or exposure?"]
    : component === "weapon"
      ? ["Was the weapon exposed when the strike landed?"]
      : ["Was the frame's force path aligned with the contact?"];
}

void ALL_CATEGORIES;
