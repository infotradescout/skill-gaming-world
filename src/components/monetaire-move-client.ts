import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import {
  canAdoptGameSnapshot, isMoveIntent, isRecord, isServerGameSession,
  type MoveIntent, type ServerGameSession,
} from "./monetaire-session-types";

export const GAME_REQUEST_TIMEOUT_MS = 10_000;
export const MAX_MOVE_ATTEMPTS = 2;
export type PendingMonetaireMove = Readonly<{
  sessionId: string;
  actionId: string;
  sequence: number;
  priorStateHash: string;
  intent: Readonly<MoveIntent>;
}>;
export type JsonReply = { status: number; ok: boolean; body: unknown };
export type MoveResolution =
  | { kind: "confirmed"; accepted: boolean; session: ServerGameSession; command: PendingMonetaireMove; message?: string }
  | { kind: "uncertain"; message: string }
  | { kind: "busy" }
  | { kind: "nothing-to-recover" };

export class GameRequestTimeout extends Error {
  constructor() { super("The reply did not arrive. Check your saved hand before trying again."); }
}

/** One deadline covers BOTH response headers and response-body consumption. */
export async function requestGameJson(
  url: string,
  init: RequestInit,
  options: { fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<JsonReply> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? GAME_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid request deadline");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCancelled: ((reason: Error) => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
  const cancel = () => {
    controller.abort();
    rejectCancelled?.(new Error("Request interrupted; its saved outcome still needs checking."));
  };
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GameRequestTimeout());
    }, timeoutMs);
  });
  try {
    const work = (async () => {
      if (options.signal?.aborted) throw new Error("Request interrupted.");
      const response = await (options.fetcher ?? fetch)(url, {
        ...init, credentials: "same-origin", signal: controller.signal,
      });
      const body: unknown = await response.json();
      return { status: response.status, ok: response.ok, body };
    })();
    return await Promise.race([work, deadline, cancelled]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}

export function gameReplyMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  if (isRecord(body.rejection) && typeof body.rejection.message === "string") return body.rejection.message;
  if (isRecord(body.error) && typeof body.error.message === "string") return body.error.message;
  return typeof body.error === "string" ? body.error : fallback;
}

export function pendingMoveKey(sessionId: string): string {
  return `monetaire.pending-move.v1:${sessionId}`;
}

export function parsePendingMove(raw: string | null, sessionId: string): PendingMonetaireMove | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.sessionId !== sessionId ||
        typeof value.actionId !== "string" || value.actionId.length < 12 || value.actionId.length > 128 ||
        value.actionId.trim() !== value.actionId || value.actionId.includes("\u0000") ||
        !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1 ||
        (value.sequence as number) > 2_147_483_647 ||
        typeof value.priorStateHash !== "string" || !/^[a-f0-9]{64}$/.test(value.priorStateHash) ||
        !isMoveIntent(value.intent)) return null;
    return Object.freeze({
      sessionId, actionId: value.actionId, sequence: value.sequence as number,
      priorStateHash: value.priorStateHash, intent: Object.freeze({ ...value.intent }),
    });
  } catch { return null; }
}

/** Serialized commands are retained until an explicit accepted/rejected outcome. */
export class MonetaireMoveClient {
  private unresolved: PendingMonetaireMove | null = null;
  private inFlight = false;
  private readonly restoredSessions = new Set<string>();
  private activeCancellation: AbortController | null = null;
  constructor(private readonly options: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
    createActionId?: () => string;
    readPending?: (key: string) => string | null;
    writePending?: (key: string, value: string | null) => void;
  } = {}) {}

  get busy(): boolean { return this.inFlight; }
  get pending(): PendingMonetaireMove | null { return this.unresolved; }

  private write(command: PendingMonetaireMove, value: string | null) {
    try {
      if (this.options.writePending) this.options.writePending(pendingMoveKey(command.sessionId), value);
      else writeBrowserStorage("sessionStorage", pendingMoveKey(command.sessionId), value);
    } catch { /* The in-memory original still survives a denied/full browser store. */ }
  }

  restore(sessionId: string): PendingMonetaireMove | null {
    if (this.unresolved) return this.unresolved.sessionId === sessionId ? this.unresolved : null;
    if (this.restoredSessions.has(sessionId)) return null;
    this.restoredSessions.add(sessionId);
    let raw: string | null = null;
    try {
      raw = this.options.readPending
        ? this.options.readPending(pendingMoveKey(sessionId))
        : readBrowserStorage("sessionStorage", pendingMoveKey(sessionId)).value;
    } catch { /* Memory-only operation remains available. */ }
    this.unresolved = parsePendingMove(raw, sessionId);
    return this.unresolved;
  }

  dispose(): void {
    this.activeCancellation?.abort();
    // Never erase an unresolved command merely because its view unmounted.
  }

  async submit(session: ServerGameSession, intent: MoveIntent): Promise<MoveResolution> {
    if (this.inFlight) return { kind: "busy" };
    this.restore(session.id);
    if (this.unresolved) return {
      kind: "uncertain", message: "Check the saved move before making another move.",
    };
    if (session.status !== "ACTIVE" || !isServerGameSession(session) ||
        !isMoveIntent(intent) || session.sequence >= 2_147_483_647) {
      return { kind: "uncertain", message: "Reload this hand before making another move." };
    }
    const command = parsePendingMove(JSON.stringify({
      sessionId: session.id,
      actionId: (this.options.createActionId ?? (() => crypto.randomUUID()))(),
      sequence: session.sequence + 1,
      priorStateHash: session.stateHash,
      intent,
    }), session.id);
    if (!command) throw new Error("Could not create a valid move identifier.");
    this.unresolved = command;
    this.write(command, JSON.stringify(command));
    return this.resolve(session);
  }

  async recover(session: ServerGameSession): Promise<MoveResolution> {
    if (this.inFlight) return { kind: "busy" };
    this.restore(session.id);
    if (!this.unresolved) return { kind: "nothing-to-recover" };
    if (this.unresolved.sessionId !== session.id) return {
      kind: "uncertain", message: "Open the original hand to check its saved move.",
    };
    return this.resolve(session);
  }

  private async resolve(session: ServerGameSession): Promise<MoveResolution> {
    const command = this.unresolved!;
    this.inFlight = true;
    const cancellation = new AbortController();
    this.activeCancellation = cancellation;
    const { sessionId, ...payload } = command;
    const serialized = JSON.stringify(payload);
    let message = "We could not confirm the move. Check the saved move before continuing.";
    try {
      for (let attempt = 0; attempt < MAX_MOVE_ATTEMPTS; attempt += 1) {
        if (cancellation.signal.aborted) break;
        try {
          const reply = await requestGameJson(`/api/game/sessions/${encodeURIComponent(sessionId)}/moves`, {
            method: "POST", headers: { "content-type": "application/json" }, body: serialized,
          }, { ...this.options, signal: cancellation.signal });
          const body = reply.body;
          if (isRecord(body) && typeof body.accepted === "boolean" &&
              (body.accepted ? reply.ok : reply.status === 409) &&
              isServerGameSession(body.currentSession) &&
              canAdoptGameSnapshot(session, body.currentSession) &&
              (!body.accepted || body.currentSession.sequence >= command.sequence)) {
            this.unresolved = null;
            this.write(command, null);
            return {
              kind: "confirmed", accepted: body.accepted,
              session: body.currentSession, command,
              message: body.accepted ? undefined : gameReplyMessage(body, "That move is not legal here."),
            };
          }
          message = gameReplyMessage(body, message);
          // Authentication/restriction/rate failures are not evidence of the first
          // request's outcome. Retain it, and do not hammer these endpoints.
          if ([400, 401, 403, 404, 429].includes(reply.status)) break;
        } catch (error) {
          if (error instanceof GameRequestTimeout) message = error.message;
        }
      }
      return { kind: "uncertain", message };
    } finally {
      this.inFlight = false;
      if (this.activeCancellation === cancellation) this.activeCancellation = null;
    }
  }
}
