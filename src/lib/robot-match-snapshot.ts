import type { RobotMatchState } from "../domain/robot-combat";

/** A late poll or command response must never roll the visible match backward. */
export function newerRobotMatchSnapshot(current: RobotMatchState, incoming: RobotMatchState): RobotMatchState {
  if (!incoming || incoming.matchId !== current.matchId
    || !Number.isSafeInteger(incoming.nextSequence)
    || incoming.nextSequence <= current.nextSequence
    || !Number.isFinite(incoming.elapsedMs) || incoming.elapsedMs < 0) return current;
  // Sequence, not elapsed time, is authoritative: a private reset has a newer
  // sequence but legitimately returns the elapsed clock to zero.
  return incoming;
}
