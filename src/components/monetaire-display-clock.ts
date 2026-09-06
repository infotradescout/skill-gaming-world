import type { ServerGameSession } from "./monetaire-session-types";

export type DisplayClockAnchor = Readonly<{
  verifiedMs: number;
  receivedAtMonotonicMs: number;
  running: boolean;
}>;

/** This projection is cosmetic. It is never sent back as an official time. */
export function createDisplayClockAnchor(
  session: Pick<ServerGameSession, "verifiedActivePlayMs" | "status" | "activityClockStatus">,
  receivedAtMonotonicMs: number,
): DisplayClockAnchor {
  if (!Number.isFinite(receivedAtMonotonicMs) || receivedAtMonotonicMs < 0 ||
      !Number.isSafeInteger(session.verifiedActivePlayMs) || session.verifiedActivePlayMs < 0) {
    throw new Error("Invalid display-clock observation");
  }
  return Object.freeze({
    verifiedMs: session.verifiedActivePlayMs,
    receivedAtMonotonicMs,
    running: session.status === "ACTIVE" && session.activityClockStatus === "RUNNING",
  });
}

export function displayElapsedMs(anchor: DisplayClockAnchor, nowMonotonicMs: number): number {
  if (!anchor.running || !Number.isFinite(nowMonotonicMs)) return anchor.verifiedMs;
  return Math.min(Number.MAX_SAFE_INTEGER, anchor.verifiedMs +
    Math.floor(Math.max(0, nowMonotonicMs - anchor.receivedAtMonotonicMs)));
}

export function formatGameTime(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
