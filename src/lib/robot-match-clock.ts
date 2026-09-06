import {
  applyRobotMatchCommand,
  ROBOT_COMBAT_RULESET_VERSION,
  type RobotMatchCommand,
  type RobotMatchEvent,
  type RobotMatchState,
} from "../domain/robot-combat";

export const ROBOT_SIMULATION_STEP_MS = 50;
// A resource-protection hold, not a fabricated match result or silent time cap.
// Long moving-session recovery needs a separately proved replay worker.
export const ROBOT_MAX_MOVING_CATCHUP_MS = 60_000;

type Transition = { state: RobotMatchState; event: RobotMatchEvent };
export type RobotClockApplication = Transition & { clock?: Transition };

export class RobotMatchClockError extends Error {}

function checkedServerTime(serverAtMs: number): number {
  if (!Number.isSafeInteger(serverAtMs) || serverAtMs < 0) {
    throw new RobotMatchClockError("The match clock is unavailable. No new action was applied.");
  }
  return serverAtMs;
}

/** Attach the server's epoch only to a newly created active test or start/reset. */
export function startRobotServerClock(state: RobotMatchState, serverAtMs: number): RobotMatchState {
  checkedServerTime(serverAtMs);
  if (state.rulesetVersion !== ROBOT_COMBAT_RULESET_VERSION || state.phase !== "ACTIVE" || state.elapsedMs !== 0) {
    throw new RobotMatchClockError("This match cannot start a new clock.");
  }
  return { ...state, serverClock: { startedAtMs: serverAtMs } };
}

/**
 * Fixed steps are anchored to one persisted server epoch. More observations,
 * other players, reloads and serialized retries cannot add elapsed time.
 * Caller must sample serverAtMs AFTER acquiring the match transaction lock.
 */
export function advanceRobotServerClock(state: RobotMatchState, serverAtMs: number): Transition | undefined {
  checkedServerTime(serverAtMs);
  if (state.phase !== "ACTIVE" || state.rulesetVersion !== ROBOT_COMBAT_RULESET_VERSION) return undefined;
  const start = state.serverClock?.startedAtMs;
  if (start === undefined || !Number.isSafeInteger(start) || start < 0
    || !Number.isSafeInteger(state.elapsedMs) || state.elapsedMs < 0
    || state.elapsedMs % ROBOT_SIMULATION_STEP_MS !== 0) {
    throw new RobotMatchClockError("This match needs clock recovery before more actions can be accepted.");
  }
  const target = Math.floor(Math.max(0, serverAtMs - start) / ROBOT_SIMULATION_STEP_MS) * ROBOT_SIMULATION_STEP_MS;
  const delta = target - state.elapsedMs;
  if (delta <= 0) return undefined;
  const moving = Object.values(state.robots).some((robot) => robot && (robot.throttle !== 0 || robot.steering !== 0));
  if (moving && delta > ROBOT_MAX_MOVING_CATCHUP_MS) {
    throw new RobotMatchClockError("This match needs recovery after a long interruption. No action or winner was recorded.");
  }
  let advanced = state;
  if (!moving) {
    advanced = { ...state, elapsedMs: target };
  } else {
    for (let elapsed = state.elapsedMs; elapsed < target; elapsed += ROBOT_SIMULATION_STEP_MS) {
      const step = applyRobotMatchCommand(advanced, { type: "TICK", elapsedMs: ROBOT_SIMULATION_STEP_MS });
      if (!step.event.accepted) throw new RobotMatchClockError("The match clock could not advance safely.");
      advanced = step.state;
    }
  }
  // Persist one aggregate server transition, not one database write per step.
  const event: RobotMatchEvent = {
    sequence: state.nextSequence,
    type: "TICK",
    accepted: true,
    message: "Match state refreshed.",
    atElapsedMs: target,
    metadata: { source: "SERVER_CLOCK", fromElapsedMs: state.elapsedMs, stepMs: ROBOT_SIMULATION_STEP_MS },
  };
  return { state: { ...advanced, nextSequence: state.nextSequence + 1, lastEvent: event }, event };
}

/**
 * Return the clock transition separately from a player's possibly rejected
 * command. A rejected command must retain equal before/after state hashes.
 */
export function applyClockedRobotCommand(state: RobotMatchState, command: RobotMatchCommand, serverAtMs: number): RobotClockApplication {
  checkedServerTime(serverAtMs);
  const resetting = command.type === "RESET_TEST" && state.mode === "PRIVATE_TEST";
  const clock = resetting ? undefined : advanceRobotServerClock(state, serverAtMs);
  const current = clock?.state ?? state;
  // Browser deltas are compatibility input only; they never drive simulation.
  // Even a browser refresh retains its own receipt after the server clock
  // event. The server event stores the observation used for replay.
  const applied = applyRobotMatchCommand(current, command.type === "TICK" ? { type: "TICK", elapsedMs: 0 } : command);
  if (applied.event.accepted && applied.state.phase === "ACTIVE"
    && (current.phase !== "ACTIVE" || resetting)) {
    applied.state = startRobotServerClock(applied.state, serverAtMs);
  }
  return { ...applied, ...(clock ? { clock } : {}) };
}
