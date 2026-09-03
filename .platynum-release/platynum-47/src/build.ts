// T2 client: the end user connects their own AI (bring-your-own model). The key is held
// on this device and sent with each request; the server proxies the call and never stores
// it. This is the user's own third-party source — a legitimate human-layer connect step —
// presented in plain language, not a developer wall.

const MODEL_KEY_STORAGE = "platynum47:model:key:v1";

export function loadModelKey(): string {
  try {
    return localStorage.getItem(MODEL_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveModelKey(key: string): void {
  try {
    if (key) localStorage.setItem(MODEL_KEY_STORAGE, key);
    else localStorage.removeItem(MODEL_KEY_STORAGE);
  } catch {
    /* storage unavailable — the session still works */
  }
}

export function hasModelKey(): boolean {
  return Boolean(loadModelKey());
}

function modelHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = loadModelKey();
  if (key) headers["x-user-model-key"] = key;
  return headers;
}

export interface ModelStatus {
  configured: boolean;
  model: string | null;
}

export interface CheckpointResponse {
  sessionId: string;
  checkpoint: string;
  humanActions: string[];
  model: string | null;
  siCheckpointId: string;
  siIntentHash: string;
  executionLocked: boolean;
  claimScope: "si_session_state";
}

export interface BuildFiles {
  [filename: string]: string;
}

export interface BuildResponse {
  files: BuildFiles;
  humanActions: string[];
  note: string;
  model: string | null;
}

export interface InterruptResponse {
  sessionId: string;
  interruptedCheckpointId: string | null;
  newCheckpoint: {
    checkpoint_id?: string;
    intent_summary?: string;
    status?: string;
    intent_hash?: string;
  } | null;
  siCheckpointId: string;
  siIntentHash: string;
  operation: string | null;
  resumeRequiresApproval: boolean;
  mutationFrozen: boolean;
  generationAuthority: boolean;
  executionLocked: boolean;
  claimScope: "si_session_state";
  note: string;
}

export interface ApproveResponse {
  sessionId: string;
  siCheckpointId: string;
  siIntentHash: string;
  executionLocked: boolean;
  generationAuthority: boolean;
  alreadyApproved?: boolean;
  claimScope: "si_session_state";
}

// Ready to build when the user has connected their own AI (or, as a fallback, the host has).
export async function modelStatus(): Promise<ModelStatus> {
  const hasUserKey = hasModelKey();
  try {
    const res = await fetch("/api/model/status");
    const data = res.ok ? ((await res.json()) as { configured?: boolean; model?: string | null }) : {};
    return { configured: hasUserKey || Boolean(data.configured), model: data.model ?? null };
  } catch {
    return { configured: hasUserKey, model: null };
  }
}

export async function getCheckpoint(idea: string): Promise<CheckpointResponse> {
  const res = await fetch("/api/model/checkpoint", {
    method: "POST",
    headers: modelHeaders(),
    body: JSON.stringify({ idea }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    sessionId?: string;
    checkpoint?: string;
    humanActions?: unknown[];
    model?: string | null;
    siCheckpointId?: string;
    siIntentHash?: string;
    executionLocked?: boolean;
    error?: string;
    code?: string;
  };
  if (!res.ok || !data.checkpoint) {
    throw new Error(data.error || `checkpoint failed (${res.status})`);
  }
  return {
    sessionId: data.sessionId || "",
    checkpoint: data.checkpoint,
    humanActions: Array.isArray(data.humanActions)
      ? data.humanActions.filter((item): item is string => typeof item === "string")
      : [],
    model: data.model ?? null,
    siCheckpointId: typeof data.siCheckpointId === "string" ? data.siCheckpointId : "",
    siIntentHash: typeof data.siIntentHash === "string" ? data.siIntentHash : "",
    executionLocked: Boolean(data.executionLocked),
    claimScope: "si_session_state",
  };
}

export async function buildFromSession(sessionId: string): Promise<BuildResponse> {
  const res = await fetch("/api/model/build", {
    method: "POST",
    headers: modelHeaders(),
    body: JSON.stringify({ sessionId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    files?: unknown;
    humanActions?: unknown[];
    note?: string;
    model?: string | null;
    error?: string;
  };
  if (!res.ok || !data.files || typeof data.files !== "object" || data.files === null) {
    throw new Error(data.error || `build failed (${res.status})`);
  }
  return {
    files: data.files as BuildFiles,
    humanActions: Array.isArray(data.humanActions)
      ? data.humanActions.filter((item): item is string => typeof item === "string")
      : [],
    note: typeof data.note === "string" ? data.note : "Build complete.",
    model: data.model ?? null,
  };
}

/**
 * Call SI interrupt (session-state). Product wiring invokes this on Correct.
 * Does not prove external model/tool/worker stop by itself.
 * SI classifies the correction as RETRACT / REPLACE / … and emits a new checkpoint.
 */
export async function interruptSession(
  sessionId: string,
  correction: string,
  checkpointId?: string,
): Promise<InterruptResponse> {
  const res = await fetch("/api/model/interrupt", {
    method: "POST",
    headers: modelHeaders(),
    body: JSON.stringify({
      sessionId,
      correction,
      ...(checkpointId ? { checkpointId } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<InterruptResponse> & {
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    // Surface SI fail-closed errors (stale checkpoint, etc.) — do not swallow.
    throw new Error(data.error || `interrupt failed (${res.status})`);
  }
  const newHash =
    data.siIntentHash ||
    data.newCheckpoint?.intent_hash ||
    "";
  return {
    sessionId: data.sessionId || sessionId,
    interruptedCheckpointId: data.interruptedCheckpointId ?? null,
    newCheckpoint: data.newCheckpoint ?? null,
    siCheckpointId: data.siCheckpointId || data.newCheckpoint?.checkpoint_id || "",
    siIntentHash: newHash,
    operation: data.operation ?? null,
    resumeRequiresApproval: true,
    mutationFrozen: data.mutationFrozen !== false,
    generationAuthority: false,
    executionLocked: data.executionLocked !== false,
    claimScope: "si_session_state",
    note:
      data.note ||
      "SI session-state interrupt invoked. External model/tool/worker stop is not proven by this call alone.",
  };
}

/**
 * Call SI approve for the current checkpoint id + intent hash.
 * Stale id or hash must fail closed (SI error surfaced to the UI).
 */
export async function approveSession(
  sessionId: string,
  checkpointId?: string,
  intentHash?: string,
): Promise<ApproveResponse> {
  const res = await fetch("/api/model/approve", {
    method: "POST",
    headers: modelHeaders(),
    body: JSON.stringify({
      sessionId,
      ...(checkpointId ? { checkpointId } : {}),
      ...(intentHash ? { intentHash } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<ApproveResponse> & {
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `approve failed (${res.status})`);
  }
  return {
    sessionId: data.sessionId || sessionId,
    siCheckpointId: data.siCheckpointId || checkpointId || "",
    siIntentHash: data.siIntentHash || intentHash || "",
    executionLocked: Boolean(data.executionLocked),
    generationAuthority: data.generationAuthority !== false,
    alreadyApproved: Boolean(data.alreadyApproved),
    claimScope: "si_session_state",
  };
}

