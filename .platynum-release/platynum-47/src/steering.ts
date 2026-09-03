/**
 * Live intent steering — run-loop protocol for Platynum-47.
 *
 * First checkpoint is always "What I understand you want". Side-effecting
 * work stays gated until Approve/Continue clears the SI approval transaction
 * for the current checkpoint id + intent hash, or until Correct → interrupt →
 * RETRACT/REPLACE → new checkpoint → re-approve.
 *
 * Correct invokes SI interrupt (session-state) via the product gateway; local UI
 * also freezes and cancels pending dispatch. No tool call, edit, branch op, or
 * background task may start while approval is pending.
 *
 * Claim scope: product wiring calls SI interrupt/approve. Until proven that model
 * generation, tool dispatch, and external workers actually stop, treat SI interrupt
 * as session-state control.
 *
 * Doctrine: checkpoints are the pre-action drift catch that keeps SI outcomes
 * interchangeable across models/agents. Corrections continue the same task —
 * they must not invent halt / restart / new-branch / new-policy.
 * Canonical lock: .selective-intelligence/live-intent-steering.md
 */

export type CheckpointKind = "intent_understanding" | "reasoning_summary" | "planned_action";

export type CheckpointStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "awaiting_correction"
  | "revised";

export type RunPhase =
  | "idle"
  | "awaiting_intent_gate"
  | "running"
  | "interrupted"
  | "complete";

export interface IntentCheckpoint {
  id: string;
  kind: CheckpointKind;
  /** User-facing title. First intent checkpoint is always this exact string. */
  title: string;
  summary: string;
  status: CheckpointStatus;
  correction?: string;
  revisedSummary?: string;
  createdAt: string;
  /** SI runtime checkpoint id when known (for interrupt/approve binding). */
  siCheckpointId?: string;
  /** SI intent hash bound to this checkpoint (approve must send current hash). */
  siIntentHash?: string;
  /** Last SI intent operation from interrupt (RETRACT / REPLACE / …). */
  siOperation?: string | null;
}

export interface PlannedSideEffect {
  id: string;
  label: string;
  /** True once the effect would mutate files, call build, or otherwise change the project. */
  mutates: boolean;
  status: "queued" | "cancelled" | "executed";
}

export interface RunLoopState {
  phase: RunPhase;
  task: string;
  understanding: string;
  checkpoints: IntentCheckpoint[];
  pendingSideEffects: PlannedSideEffect[];
  cancelledSideEffects: PlannedSideEffect[];
  activeCorrectionId: string | null;
  /** Rejected summaries removed from downstream planning. */
  rejectedDirections: string[];
  generationId: number;
  /** Latest SI checkpoint id for interrupt/approve calls. */
  siCheckpointId: string | null;
  /** Latest SI intent hash for approve fail-closed binding. */
  siIntentHash: string | null;
  /** Last SI correction operation (RETRACT / REPLACE / …). */
  lastSiOperation: string | null;
}

export const FIRST_INTENT_TITLE = "What I understand you want";

const FORBIDDEN_ON_CORRECTION = [
  /\bhalt (all|the|this|everything)\b/i,
  /\brestart (the )?project\b/i,
  /\bcreate (a )?new branch\b/i,
  /\bnew policy\b/i,
  /\binvent(ed)? a halt\b/i,
];

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createIdleRun(): RunLoopState {
  return {
    phase: "idle",
    task: "",
    understanding: "",
    checkpoints: [],
    pendingSideEffects: [],
    cancelledSideEffects: [],
    activeCorrectionId: null,
    rejectedDirections: [],
    generationId: 0,
    siCheckpointId: null,
    siIntentHash: null,
    lastSiOperation: null,
  };
}

/**
 * Start a run: emit the first intent checkpoint and block side effects.
 * Understanding may come from the SI plan; no mutating work is queued yet.
 */
export function startRunWithIntent(
  task: string,
  understanding: string,
  siCheckpointId?: string | null,
  siIntentHash?: string | null,
): RunLoopState {
  const summary = understanding.trim() || "SI is ready to confirm what you want.";
  const first: IntentCheckpoint = {
    id: makeId("cp"),
    kind: "intent_understanding",
    title: FIRST_INTENT_TITLE,
    summary,
    status: "pending",
    createdAt: nowIso(),
    siCheckpointId: siCheckpointId || undefined,
    siIntentHash: siIntentHash || undefined,
  };
  return {
    phase: "awaiting_intent_gate",
    task: task.trim(),
    understanding: summary,
    checkpoints: [first],
    pendingSideEffects: [],
    cancelledSideEffects: [],
    activeCorrectionId: null,
    rejectedDirections: [],
    generationId: 1,
    siCheckpointId: siCheckpointId || null,
    siIntentHash: siIntentHash || null,
    lastSiOperation: null,
  };
}

export function canExecuteSideEffects(state: RunLoopState): boolean {
  return state.phase === "running" || state.phase === "complete";
}

export function isIntentGateOpen(state: RunLoopState): boolean {
  return state.phase === "awaiting_intent_gate" || state.phase === "interrupted";
}

/** Approval pending — no tool call, edit, branch op, or background task may start. */
export function isApprovalPending(state: RunLoopState): boolean {
  return state.phase === "awaiting_intent_gate" || state.phase === "interrupted";
}

/**
 * Approve clears the intent gate only after the SI approve transaction succeeds
 * for the current checkpoint. Local status follows the successful transaction.
 */
export function approveCheckpoint(state: RunLoopState, checkpointId: string): RunLoopState {
  const checkpoints = state.checkpoints.map((cp) =>
    cp.id === checkpointId && (cp.status === "pending" || cp.status === "revised")
      ? { ...cp, status: "approved" as const }
      : cp,
  );
  const cleared = clearIntentGateIfReady({ ...state, checkpoints }, checkpointId);
  return cleared;
}

/**
 * Explicit Continue / proceed — clears the first-intent gate so side effects may run.
 * Prefer this (or Approve) before any mutating tool call.
 * Does not clear while awaiting an inline correction after Correct.
 */
export function continuePastIntentGate(state: RunLoopState): RunLoopState {
  if (state.phase !== "awaiting_intent_gate") {
    return state;
  }
  return {
    ...state,
    phase: "running",
    activeCorrectionId: null,
  };
}

/**
 * Correct: local hard interrupt — cancel queued side effects, open correction UI.
 * Product layer must also call SI interrupt (session-state) before further mutations.
 */
export function dislikeCheckpoint(state: RunLoopState, checkpointId: string): RunLoopState {
  const target = state.checkpoints.find((cp) => cp.id === checkpointId);
  if (!target) return state;

  const cancelled = state.pendingSideEffects.map((fx) => ({ ...fx, status: "cancelled" as const }));
  const checkpoints = state.checkpoints.map((cp) =>
    cp.id === checkpointId ? { ...cp, status: "awaiting_correction" as const } : cp,
  );

  return {
    ...state,
    phase: "interrupted",
    generationId: state.generationId + 1,
    checkpoints,
    pendingSideEffects: [],
    cancelledSideEffects: [...state.cancelledSideEffects, ...cancelled],
    activeCorrectionId: checkpointId,
  };
}

/**
 * Turn a user correction into one revised-understanding sentence.
 * Continues the SAME task — never invents halt / restart / new-branch / new-policy.
 */
export function reviseUnderstandingFromCorrection(correction: string): string {
  let body = correction.trim().replace(/^no[.!]?\s*/i, "").trim();
  if (!body) body = "continue the current task with the correction applied";
  body = body.replace(/\s+/g, " ");
  // Drop any invented halt/restart/branch/policy phrases the model might add later;
  // this pure path only echoes the person's correction.
  for (const pattern of FORBIDDEN_ON_CORRECTION) {
    if (pattern.test(body) && !/\b(do not|don't|never)\b/i.test(body)) {
      // User said "halt" affirmatively — still do not expand into project restart / new branch.
      body = body
        .replace(/\brestart (the )?project\b/gi, "continue the current task")
        .replace(/\bcreate (a )?new branch\b/gi, "stay on the current work")
        .replace(/\bnew policy\b/gi, "the existing direction");
    }
  }
  if (!/[.!?]$/.test(body)) body = `${body}.`;
  const one = body.split(/(?<=[.!?])\s+/)[0] ?? body;
  return `Revised understanding: ${one.charAt(0).toLowerCase()}${one.slice(1)}`.replace(
    /\.\.$/,
    ".",
  );
}

export function correctionIntroducesForbiddenPolicy(revisedLine: string): boolean {
  const lower = revisedLine.toLowerCase();
  const inventsHalt = /\brevised understanding:.*\bhalt\b/i.test(revisedLine) && !/\b(no halt|do not halt|don't halt|never halt)\b/i.test(lower);
  const inventsRestart = /\brestart (the )?project\b/i.test(revisedLine);
  const inventsBranch = /\b(create|switch to) (a )?new branch\b/i.test(revisedLine);
  const inventsPolicy = /\badd(s|ed)? a new policy\b/i.test(revisedLine);
  return inventsHalt || inventsRestart || inventsBranch || inventsPolicy;
}

/**
 * Apply correction after SI interrupt returned a new checkpoint (RETRACT/REPLACE).
 * Continues only after that new checkpoint is approved.
 */
export function submitCorrection(
  state: RunLoopState,
  checkpointId: string,
  correction: string,
  siCheckpointId?: string | null,
  siIntentHash?: string | null,
  siOperation?: string | null,
): RunLoopState {
  if (state.activeCorrectionId !== checkpointId) return state;
  const trimmed = correction.trim();
  if (!trimmed) return state;

  const target = state.checkpoints.find((cp) => cp.id === checkpointId);
  if (!target) return state;

  const revisedSummary = reviseUnderstandingFromCorrection(trimmed);
  if (correctionIntroducesForbiddenPolicy(revisedSummary)) {
    // Safety net: never ship a forbidden invented direction.
    const safe = `Revised understanding: continue the current task with this correction: ${trimmed.replace(/\s+/g, " ").replace(/[.!?]$/, "")}.`;
    return finishCorrection(
      state,
      checkpointId,
      trimmed,
      safe,
      target.summary,
      siCheckpointId,
      siIntentHash,
      siOperation,
    );
  }
  return finishCorrection(
    state,
    checkpointId,
    trimmed,
    revisedSummary,
    target.summary,
    siCheckpointId,
    siIntentHash,
    siOperation,
  );
}

function finishCorrection(
  state: RunLoopState,
  checkpointId: string,
  correction: string,
  revisedSummary: string,
  rejectedSummary: string,
  siCheckpointId?: string | null,
  siIntentHash?: string | null,
  siOperation?: string | null,
): RunLoopState {
  const understanding = revisedSummary.replace(/^Revised understanding:\s*/i, "").trim();
  const checkpoints = state.checkpoints.map((cp) =>
    cp.id === checkpointId
      ? {
          ...cp,
          status: "rejected" as const,
          correction,
          revisedSummary,
          siOperation: siOperation ?? cp.siOperation,
        }
      : cp,
  );
  // Append a fresh pending intent checkpoint with the revised understanding for re-approval.
  const followUp: IntentCheckpoint = {
    id: makeId("cp"),
    kind: "intent_understanding",
    title: FIRST_INTENT_TITLE,
    summary: understanding,
    status: "revised",
    revisedSummary,
    createdAt: nowIso(),
    siCheckpointId: siCheckpointId || undefined,
    siIntentHash: siIntentHash || undefined,
    siOperation: siOperation || undefined,
  };

  return {
    ...state,
    // Re-approval required after SI interrupt / revised checkpoint.
    phase: "awaiting_intent_gate",
    understanding,
    checkpoints: [...checkpoints, followUp],
    pendingSideEffects: [],
    activeCorrectionId: null,
    rejectedDirections: [...state.rejectedDirections, rejectedSummary],
    generationId: state.generationId + 1,
    siCheckpointId: siCheckpointId ?? state.siCheckpointId,
    siIntentHash: siIntentHash ?? state.siIntentHash,
    lastSiOperation: siOperation ?? state.lastSiOperation,
  };
}

export function bindSiCheckpoint(
  state: RunLoopState,
  siCheckpointId: string | null | undefined,
  siIntentHash?: string | null,
  siOperation?: string | null,
): RunLoopState {
  if (!siCheckpointId && !siIntentHash && siOperation == null) return state;
  const checkpoints = state.checkpoints.map((cp, index) =>
    index === state.checkpoints.length - 1
      ? {
          ...cp,
          ...(siCheckpointId ? { siCheckpointId } : {}),
          ...(siIntentHash ? { siIntentHash } : {}),
          ...(siOperation != null ? { siOperation } : {}),
        }
      : cp,
  );
  return {
    ...state,
    ...(siCheckpointId ? { siCheckpointId } : {}),
    ...(siIntentHash ? { siIntentHash } : {}),
    ...(siOperation != null ? { lastSiOperation: siOperation } : {}),
    checkpoints,
  };
}

function clearIntentGateIfReady(state: RunLoopState, checkpointId: string): RunLoopState {
  const actionable = [...state.checkpoints]
    .reverse()
    .find((cp) => cp.kind === "intent_understanding" && (cp.status === "approved" || cp.id === checkpointId));
  if (!actionable || actionable.id !== checkpointId) return state;
  if (state.phase !== "awaiting_intent_gate") return state;
  return { ...state, phase: "running", activeCorrectionId: null };
}

/**
 * Queue a side-effecting action. Rejected if the intent gate is still closed.
 * Returns null when blocked (acceptance: no wrong action before interrupt).
 */
export function queueSideEffect(
  state: RunLoopState,
  label: string,
  mutates = true,
): { state: RunLoopState; queued: PlannedSideEffect | null; blocked: boolean } {
  if (!canExecuteSideEffects(state) || isApprovalPending(state)) {
    return { state, queued: null, blocked: true };
  }
  const fx: PlannedSideEffect = {
    id: makeId("fx"),
    label,
    mutates,
    status: "queued",
  };
  return {
    state: { ...state, pendingSideEffects: [...state.pendingSideEffects, fx] },
    queued: fx,
    blocked: false,
  };
}

/** Cancel everything still queued (used when generation stops). */
export function cancelPendingWork(state: RunLoopState): RunLoopState {
  const cancelled = state.pendingSideEffects.map((fx) => ({ ...fx, status: "cancelled" as const }));
  return {
    ...state,
    generationId: state.generationId + 1,
    pendingSideEffects: [],
    cancelledSideEffects: [...state.cancelledSideEffects, ...cancelled],
    phase: state.phase === "running" ? "interrupted" : state.phase,
  };
}

export function emitReasoningCheckpoint(
  state: RunLoopState,
  summary: string,
  kind: Exclude<CheckpointKind, "intent_understanding"> = "reasoning_summary",
): RunLoopState {
  if (!canExecuteSideEffects(state) && state.phase !== "awaiting_intent_gate") {
    return state;
  }
  // Reasoning / planned-action cards may appear after the first intent gate is shown,
  // but mutating side effects remain gated separately.
  const cp: IntentCheckpoint = {
    id: makeId("cp"),
    kind,
    title: kind === "planned_action" ? "Planned next step" : "Working on it",
    summary: summary.trim(),
    status: "pending",
    createdAt: nowIso(),
  };
  return { ...state, checkpoints: [...state.checkpoints, cp] };
}

export function markComplete(state: RunLoopState): RunLoopState {
  return {
    ...state,
    phase: "complete",
    pendingSideEffects: state.pendingSideEffects.map((fx) =>
      fx.status === "queued" ? { ...fx, status: "executed" as const } : fx,
    ),
  };
}

/** Planning helper: drop rejected directions from a plan text list. */
export function filterRejectedFromPlan(planLines: string[], rejected: string[]): string[] {
  const rejectedNorm = rejected.map((r) => r.trim().toLowerCase());
  return planLines.filter((line) => !rejectedNorm.includes(line.trim().toLowerCase()));
}

