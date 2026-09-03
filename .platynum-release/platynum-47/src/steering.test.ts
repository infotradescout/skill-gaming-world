import { describe, expect, it } from "vitest";
import {
  approveCheckpoint,
  bindSiCheckpoint,
  canExecuteSideEffects,
  continuePastIntentGate,
  correctionIntroducesForbiddenPolicy,
  createIdleRun,
  dislikeCheckpoint,
  filterRejectedFromPlan,
  FIRST_INTENT_TITLE,
  isApprovalPending,
  queueSideEffect,
  reviseUnderstandingFromCorrection,
  startRunWithIntent,
  submitCorrection,
} from "./steering.ts";

describe("live intent steering protocol", () => {
  it("emits What I understand you want before any side-effect can run", () => {
    const run = startRunWithIntent(
      "Fix the ISSA own-shell path",
      "I understand that you want all ISSA work halted.",
    );

    expect(run.phase).toBe("awaiting_intent_gate");
    expect(run.checkpoints[0]?.title).toBe(FIRST_INTENT_TITLE);
    expect(run.checkpoints[0]?.kind).toBe("intent_understanding");
    expect(canExecuteSideEffects(run)).toBe(false);

    const blocked = queueSideEffect(run, "halt all ISSA work", true);
    expect(blocked.blocked).toBe(true);
    expect(blocked.queued).toBeNull();
    expect(blocked.state.pendingSideEffects).toHaveLength(0);
  });

  it("acceptance: reject first checkpoint, correct, continue with no wrong action executed", () => {
    let run = startRunWithIntent(
      "ISSA own-shell fix",
      "I understand that you want all ISSA work halted.",
    );

    // Wrong mutating work must not run while gate is closed.
    const premature = queueSideEffect(run, "halt all ISSA work", true);
    expect(premature.blocked).toBe(true);

    const firstId = run.checkpoints[0]!.id;

    // Simulate a race: mutating work was queued before the interrupt landed.
    run = {
      ...run,
      pendingSideEffects: [
        { id: "fx-bad", label: "halt all ISSA work", mutates: true, status: "queued" },
      ],
    };
    run = dislikeCheckpoint(run, firstId);
    expect(run.phase).toBe("interrupted");
    expect(run.checkpoints[0]?.status).toBe("awaiting_correction");
    expect(canExecuteSideEffects(run)).toBe(false);
    expect(run.pendingSideEffects).toHaveLength(0);
    expect(run.cancelledSideEffects.some((fx) => fx.label === "halt all ISSA work")).toBe(true);

    run = submitCorrection(
      run,
      firstId,
      "No. Continue the existing ISSA own-shell fix only. Do not halt anything and do not expand scope.",
    );

    expect(run.checkpoints[0]?.status).toBe("rejected");
    expect(run.checkpoints[0]?.revisedSummary).toMatch(/^Revised understanding:/i);
    expect(run.understanding.toLowerCase()).toContain("own-shell");
    expect(run.understanding.toLowerCase()).not.toMatch(/\bhalt all\b/);
    expect(run.rejectedDirections).toContain("I understand that you want all ISSA work halted.");
    // Re-approval required after correction / SI interrupt.
    expect(run.phase).toBe("awaiting_intent_gate");
    expect(canExecuteSideEffects(run)).toBe(false);

    run = continuePastIntentGate(run);
    expect(run.phase).toBe("running");
    expect(canExecuteSideEffects(run)).toBe(true);

    const allowed = queueSideEffect(run, "continue ISSA own-shell fix only", true);
    expect(allowed.blocked).toBe(false);
    expect(allowed.queued?.label).toBe("continue ISSA own-shell fix only");
  });

  it("dislike cancels pending side effects and opens correction", () => {
    let run = startRunWithIntent("Ship a pantry board", "A shared pantry item board.");
    run = continuePastIntentGate(run);
    const queued = queueSideEffect(run, "write index.html", true);
    run = queued.state;
    expect(run.pendingSideEffects).toHaveLength(1);

    run = dislikeCheckpoint(run, run.checkpoints[0]!.id);
    expect(run.pendingSideEffects).toHaveLength(0);
    expect(run.cancelledSideEffects).toHaveLength(1);
    expect(run.cancelledSideEffects[0]?.status).toBe("cancelled");
    expect(run.activeCorrectionId).toBe(run.checkpoints[0]!.id);
  });

  it("approve is optional feedback that can clear the gate without an extra wait", () => {
    let run = startRunWithIntent("Neighborhood tool library", "A tool library for neighbors.");
    expect(canExecuteSideEffects(run)).toBe(false);
    run = approveCheckpoint(run, run.checkpoints[0]!.id);
    expect(run.checkpoints[0]?.status).toBe("approved");
    expect(canExecuteSideEffects(run)).toBe(true);
  });

  it("Continue alone clears the gate without requiring thumbs up", () => {
    let run = startRunWithIntent("Calendar", "A simple shared calendar.");
    run = continuePastIntentGate(run);
    expect(run.phase).toBe("running");
    expect(canExecuteSideEffects(run)).toBe(true);
  });

  it("correction revises understanding in one sentence and keeps the same task", () => {
    let run = startRunWithIntent("ISSA own-shell fix", "I understand that you want all ISSA work halted.");
    const task = run.task;
    const firstId = run.checkpoints[0]!.id;
    run = dislikeCheckpoint(run, firstId);
    run = submitCorrection(
      run,
      firstId,
      "No. Continue the existing ISSA own-shell fix only. Do not halt anything and do not expand scope.",
    );

    expect(run.task).toBe(task);
    expect(run.checkpoints[0]?.revisedSummary).toBe(
      reviseUnderstandingFromCorrection(
        "No. Continue the existing ISSA own-shell fix only. Do not halt anything and do not expand scope.",
      ),
    );
    expect(run.checkpoints.some((cp) => cp.status === "revised" || cp.revisedSummary)).toBe(true);
  });

  it("must not invent halt, restart, new-branch, or new-policy because of a correction", () => {
    const revised = reviseUnderstandingFromCorrection(
      "Continue the existing ISSA own-shell fix only. Do not halt anything and do not expand scope.",
    );
    expect(revised.startsWith("Revised understanding:")).toBe(true);
    expect(correctionIntroducesForbiddenPolicy(revised)).toBe(false);
    expect(revised.toLowerCase()).not.toMatch(/restart the project/);
    expect(revised.toLowerCase()).not.toMatch(/create a new branch/);
    expect(revised.toLowerCase()).not.toMatch(/add a new policy/);

    expect(
      correctionIntroducesForbiddenPolicy("Revised understanding: restart the project from scratch."),
    ).toBe(true);
    expect(
      correctionIntroducesForbiddenPolicy("Revised understanding: create a new branch for this."),
    ).toBe(true);
    expect(
      correctionIntroducesForbiddenPolicy("Revised understanding: add a new policy for steers."),
    ).toBe(true);
  });

  it("removes rejected direction from downstream planning", () => {
    const plan = filterRejectedFromPlan(
      [
        "I understand that you want all ISSA work halted.",
        "Continue the existing ISSA own-shell fix only.",
      ],
      ["I understand that you want all ISSA work halted."],
    );
    expect(plan).toEqual(["Continue the existing ISSA own-shell fix only."]);
  });

  it("does not continue while awaiting an inline correction after dislike", () => {
    let run = startRunWithIntent("Ship a pantry board", "A shared pantry item board.");
    run = dislikeCheckpoint(run, run.checkpoints[0]!.id);
    expect(run.phase).toBe("interrupted");
    run = continuePastIntentGate(run);
    expect(run.phase).toBe("interrupted");
    expect(canExecuteSideEffects(run)).toBe(false);
  });

  it("binds SI checkpoint ids and intent hashes for interrupt/approve wiring", () => {
    let run = startRunWithIntent("Calendar", "A simple shared calendar.", "cp-si-1", "hash-1");
    expect(run.siCheckpointId).toBe("cp-si-1");
    expect(run.siIntentHash).toBe("hash-1");
    expect(run.checkpoints[0]?.siCheckpointId).toBe("cp-si-1");
    expect(run.checkpoints[0]?.siIntentHash).toBe("hash-1");
    run = bindSiCheckpoint(run, "cp-si-2", "hash-2", "RETRACT");
    expect(run.siCheckpointId).toBe("cp-si-2");
    expect(run.siIntentHash).toBe("hash-2");
    expect(run.lastSiOperation).toBe("RETRACT");
  });

  it("blocks side effects while approval is pending after correction", () => {
    let run = startRunWithIntent("ISSA own-shell fix", "I understand that you want all ISSA work halted.");
    const firstId = run.checkpoints[0]!.id;
    run = dislikeCheckpoint(run, firstId);
    run = submitCorrection(
      run,
      firstId,
      "No. Continue the existing ISSA own-shell fix only.",
      "cp-new",
      "hash-new",
      "RETRACT",
    );
    expect(run.phase).toBe("awaiting_intent_gate");
    expect(run.siCheckpointId).toBe("cp-new");
    expect(run.siIntentHash).toBe("hash-new");
    expect(run.lastSiOperation).toBe("RETRACT");
    expect(isApprovalPending(run)).toBe(true);
    expect(canExecuteSideEffects(run)).toBe(false);
    const blocked = queueSideEffect(run, "write files", true);
    expect(blocked.blocked).toBe(true);
  });

  it("starts idle with no checkpoints", () => {
    expect(createIdleRun().checkpoints).toEqual([]);
    expect(canExecuteSideEffects(createIdleRun())).toBe(false);
  });
});

