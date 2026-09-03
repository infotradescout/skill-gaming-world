export type PairRole = "controller" | "runner";

export interface PairSession {
  pairCode: string;
  role: PairRole;
  controllerConnected: boolean;
  runnerConnected: boolean;
  paired: boolean;
}

export interface PairFilePayload {
  [filename: string]: string;
}

const DEVICE_ID_KEY = "platynum47:pair:device-id";

function randomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function pairDeviceId(): string {
  try {
    const cached = localStorage.getItem(DEVICE_ID_KEY);
    if (cached) return cached;
    const next = randomId();
    localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}

export interface PairCreateResponse {
  pairCode: string;
  role: PairRole;
  paired: boolean;
  controllerConnected: boolean;
  runnerConnected: boolean;
}

export interface PairStatusResponse {
  pairCode: string;
  role: PairRole;
  paired: boolean;
  controllerConnected: boolean;
  runnerConnected: boolean;
}

async function jsonGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `pair request failed (${res.status})`);
  return data as T;
}

async function jsonPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `pair request failed (${res.status})`);
  return data as T;
}

export async function createPairing(deviceId: string): Promise<PairCreateResponse> {
  return jsonPost<PairCreateResponse>("/api/pair/create", { deviceId });
}

export async function joinPairing(pairCode: string, deviceId: string): Promise<PairCreateResponse> {
  return jsonPost<PairCreateResponse>("/api/pair/join", { pairCode, deviceId });
}

export async function leavePairing(pairCode: string, role: PairRole, deviceId: string): Promise<void> {
  await jsonPost<void>("/api/pair/leave", { pairCode, role, deviceId });
}

export async function pairHeartbeat(pairCode: string, role: PairRole, deviceId: string): Promise<void> {
  await jsonPost<void>("/api/pair/heartbeat", { pairCode, role, deviceId });
}

export async function getPairStatus(pairCode: string, role: PairRole): Promise<PairStatusResponse> {
  return jsonGet<PairStatusResponse>(`/api/pair/status/${encodeURIComponent(pairCode)}?role=${role}`);
}

export async function sendPairWorkspace(pairCode: string, role: PairRole, deviceId: string, workspace: PairFilePayload): Promise<void> {
  await jsonPost<void>("/api/pair/workspace", { pairCode, role, deviceId, workspace });
}

export async function pullPairWorkspace(pairCode: string, role: PairRole, deviceId: string): Promise<PairFilePayload> {
  const data = await jsonGet<{ workspace?: PairFilePayload; role: PairRole }>(
    `/api/pair/workspace/${encodeURIComponent(pairCode)}?role=${role}&device=${deviceId}`,
  );
  return data.workspace || {};
}

export async function sendPairPreview(pairCode: string, role: PairRole, deviceId: string, preview: string): Promise<void> {
  await jsonPost<void>("/api/pair/preview", { pairCode, role, deviceId, preview });
}

export async function pullPairPreview(pairCode: string, role: PairRole, deviceId: string): Promise<string> {
  const data = await jsonGet<{ preview?: string }>(
    `/api/pair/preview/${encodeURIComponent(pairCode)}?role=${role}&device=${deviceId}`,
  );
  return data.preview || "";
}

