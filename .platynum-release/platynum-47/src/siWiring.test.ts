import { afterEach, describe, expect, it, vi } from "vitest";
import { approveSession, getCheckpoint, interruptSession } from "./build.ts";
import {
  approveCheckpoint,
  bindSiCheckpoint,
  canExecuteSideEffects,
  dislikeCheckpoint,
  isApprovalPending,
  queueSideEffect,
  startRunWithIntent,
  submitCorrection,
} from "./steering.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Platynum ↔ SI approve/correct wiring", () => {
  it("Approve hits /api/model/approve with current checkpoint id + intent hash", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, string>;
      expect(body.sessionId).toBe("sess-1");
      expect(body.checkpointId).toBe("cp-current");
      expect(body.intentHash).toBe("hash-current");
      return {
        ok: true,
        json: async () => ({
          sessionId: "sess-1",
          siCheckpointId: "cp-current",
          siIntentHash: "hash-current",
          executionLocked: false,
          generationAuthority: true,
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const approved = await approveSession("sess-1", "cp-current", "hash-current");
    expect(approved.siCheckpointId).toBe("cp-current");
    expect(approved.siIntentHash).toBe("hash-current");
    expect(approved.executionLocked).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/model/approve",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("stale checkpoint approve surfaces SI fail-closed error and does not clear the gate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: "stale checkpoint; only currentCheckpointId may be approved",
          code: "approve_failed",
        }),
      })),
    );

    let run = startRunWithIntent("task", "wrong understanding", "cp-old", "hash-old");
    await expect(approveSession("sess-1", "cp-old", "hash-old")).rejects.toThrow(/stale checkpoint/i);
    // Local gate must remain closed when SI rejects.
    expect(canExecuteSideEffects(run)).toBe(false);
    expect(isApprovalPending(run)).toBe(true);
    run = approveCheckpoint(run, run.checkpoints[0]!.id); // only after a successful SI call in product
    // Product must not call this when SI fails; prove pending gate still blocks side effects
    // if we never cleared via SI success path:
    run = startRunWithIntent("task", "wrong understanding", "cp-old", "hash-old");
    expect(queueSideEffect(run, "mutate", true).blocked).toBe(true);
  });

  it("Correct → interrupt → RETRACT/REPLACE correction → new checkpoint → blocked until approve", async () => {
    const calls: Array<{ url: string; body: Record<string, string> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}")) as Record<string, string>;
        calls.push({ url: String(url), body });
        if (String(url).includes("/interrupt")) {
          const isSubmit = /own-shell/i.test(body.correction || "");
          return {
            ok: true,
            json: async () => ({
              sessionId: "sess-1",
              interruptedCheckpointId: body.checkpointId || "cp-1",
              operation: isSubmit ? "RETRACT" : "REPLACE",
              newCheckpoint: {
                checkpoint_id: isSubmit ? "cp-2" : "cp-1b",
                intent_hash: isSubmit ? "hash-2" : "hash-1b",
                status: "proposed",
              },
              siCheckpointId: isSubmit ? "cp-2" : "cp-1b",
              siIntentHash: isSubmit ? "hash-2" : "hash-1b",
              executionLocked: true,
              mutationFrozen: true,
              resumeRequiresApproval: true,
            }),
          };
        }
        if (String(url).includes("/approve")) {
          return {
            ok: true,
            json: async () => ({
              sessionId: "sess-1",
              siCheckpointId: body.checkpointId,
              siIntentHash: body.intentHash,
              executionLocked: false,
              generationAuthority: true,
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({ error: "unexpected" }) };
      }),
    );

    let run = startRunWithIntent(
      "ISSA own-shell fix",
      "I understand that you want all ISSA work halted.",
      "cp-1",
      "hash-1",
    );
    expect(queueSideEffect(run, "halt all", true).blocked).toBe(true);

    // Correct click: local interrupt + SI interrupt (freeze).
    const firstId = run.checkpoints[0]!.id;
    run = dislikeCheckpoint(run, firstId);
    expect(run.phase).toBe("interrupted");
    expect(run.pendingSideEffects).toHaveLength(0);

    const freeze = await interruptSession("sess-1", "nope — that understanding is wrong.", "cp-1");
    run = bindSiCheckpoint(run, freeze.siCheckpointId, freeze.siIntentHash, freeze.operation);
    expect(freeze.operation).toBe("REPLACE");
    expect(canExecuteSideEffects(run)).toBe(false);

    // Submit correction: RETRACT/REPLACE + new checkpoint; still gated.
    const corrected = await interruptSession(
      "sess-1",
      "No. Continue the existing ISSA own-shell fix only. Do not halt anything.",
      run.siCheckpointId || undefined,
    );
    expect(corrected.operation).toBe("RETRACT");
    run = submitCorrection(
      run,
      firstId,
      "No. Continue the existing ISSA own-shell fix only. Do not halt anything.",
      corrected.siCheckpointId,
      corrected.siIntentHash,
      corrected.operation,
    );
    expect(run.phase).toBe("awaiting_intent_gate");
    expect(run.siCheckpointId).toBe("cp-2");
    expect(run.siIntentHash).toBe("hash-2");
    expect(run.lastSiOperation).toBe("RETRACT");
    expect(isApprovalPending(run)).toBe(true);
    expect(queueSideEffect(run, "write files", true).blocked).toBe(true);

    // Approve new checkpoint with id+hash unlocks.
    const approved = await approveSession("sess-1", run.siCheckpointId!, run.siIntentHash!);
    expect(approved.executionLocked).toBe(false);
    const followUpId = run.checkpoints[run.checkpoints.length - 1]!.id;
    run = approveCheckpoint(run, followUpId);
    expect(canExecuteSideEffects(run)).toBe(true);
    expect(queueSideEffect(run, "continue own-shell", true).blocked).toBe(false);

    expect(calls.filter((c) => c.url === "/api/model/interrupt")).toHaveLength(2);
    expect(calls.some((c) => c.url === "/api/model/approve" && c.body.intentHash === "hash-2")).toBe(
      true,
    );
  });

  it("getCheckpoint carries siCheckpointId and siIntentHash for binding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          sessionId: "sess-9",
          checkpoint: "A shared pantry board.\n\n1. Confirm this understanding before anything is built.",
          humanActions: [],
          siCheckpointId: "cp-9",
          siIntentHash: "hash-9",
          executionLocked: true,
        }),
      })),
    );
    const cp = await getCheckpoint("pantry board");
    expect(cp.siCheckpointId).toBe("cp-9");
    expect(cp.siIntentHash).toBe("hash-9");
    expect(cp.executionLocked).toBe(true);
  });

  it("pending approval gate blocks side effects before any SI approve", () => {
    const run = startRunWithIntent("x", "y", "cp", "hash");
    expect(isApprovalPending(run)).toBe(true);
    expect(canExecuteSideEffects(run)).toBe(false);
    expect(queueSideEffect(run, "tool call", true).blocked).toBe(true);
    expect(queueSideEffect(run, "branch op", true).blocked).toBe(true);
    expect(queueSideEffect(run, "background task", true).blocked).toBe(true);
  });
});

