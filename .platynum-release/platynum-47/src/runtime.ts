/**
 * Client contract for the local Platynum runtime.
 *
 * The browser never receives a model key or a shell command. It talks to the
 * loopback runtime, which owns path validation, Codex authentication, sandbox
 * selection, process lifetime, and the durable run record.
 */

export type RuntimeJobKind = "understand" | "build" | "check";

export type RuntimeJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface RuntimeProject {
  id: string;
  name: string;
  root: string;
  kind: "git" | "folder";
  branch: string | null;
  dirty: boolean;
  changedFiles: number;
  scripts: string[];
  lastOpenedAt?: string;
}

export interface RuntimeBrowseEntry {
  name: string;
  path: string;
  kind: "directory" | "project";
  project?: RuntimeProject;
}

export interface RuntimeStatus {
  enabled: boolean;
  host: string;
  codex: {
    installed: boolean;
    signedIn: boolean;
    command: string | null;
    authMessage?: string;
  };
  projects: RuntimeProject[];
}

export interface RuntimeFileEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
  language?: "html" | "css" | "javascript" | "text";
}

export interface RuntimeProjectSnapshot extends RuntimeProject {
  files: RuntimeFileEntry[];
  readme?: string | null;
  previewUrl?: string | null;
}

export interface RuntimeFile {
  path: string;
  content: string;
  language: "html" | "css" | "javascript" | "text";
  sha256: string;
}

export interface RuntimeCheckpoint {
  title: "What I understand you want";
  understanding: string;
  recommendations: string[];
  consensus: string;
  wildcard: string;
  acceptance: string[];
  humanActions: string[];
}

export interface RuntimeJob {
  id: string;
  kind: RuntimeJobKind;
  status: RuntimeJobStatus;
  stage: string;
  createdAt: string;
  updatedAt: string;
  events: string[];
  checkpoint?: RuntimeCheckpoint | null;
  result?: RuntimeBuildResult | null;
  check?: { checks: RuntimeCheckResult[] } | null;
  error?: string | null;
  threadId?: string | null;
  resumedFrom?: string | null;
  resumeAvailable?: boolean;
}

export interface RuntimeBuildResult {
  summary: string;
  changedFiles: string[];
  checks: RuntimeCheckResult[];
  remaining: string[];
  diffStat?: string;
  previewUrl?: string | null;
}

export interface RuntimeCheckResult {
  name: string;
  command?: string;
  passed: boolean;
  output: string;
  durationMs?: number;
}

export interface RuntimePreviewStatus {
  status: "idle" | "starting" | "running" | "stopped" | "failed";
  previewUrl: string | null;
  message?: string;
}

export interface RuntimeAuthStatus {
  installed: boolean;
  signedIn: boolean;
  command: string | null;
  state: "idle" | "running" | "completed" | "failed";
  message: string;
}

interface RuntimeErrorPayload {
  error?: string;
  code?: string;
}

async function runtimeFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-platynum-local": "1",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const payload = (body ?? {}) as RuntimeErrorPayload;
    throw new Error(payload.error || `Platynum runtime returned ${response.status}.`);
  }
  return body as T;
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  return runtimeFetch<RuntimeStatus>("/api/runtime/status");
}

export async function discoverRuntimeProjects(): Promise<{ projects: RuntimeProject[]; entries: RuntimeBrowseEntry[] }> {
  return runtimeFetch<{ projects: RuntimeProject[]; entries: RuntimeBrowseEntry[] }>("/api/runtime/projects?discover=true");
}

export async function browseRuntimeFolders(path = ""): Promise<{ path: string; entries: RuntimeBrowseEntry[] }> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return runtimeFetch<{ path: string; entries: RuntimeBrowseEntry[] }>(`/api/runtime/browse${query}`);
}

export async function openRuntimeProject(root: string): Promise<RuntimeProject> {
  const response = await runtimeFetch<{ project?: RuntimeProject } & RuntimeProject>("/api/runtime/projects/open", {
    method: "POST",
    body: JSON.stringify({ root }),
  });
  return response.project ?? response;
}

export async function getRuntimeProject(projectId: string): Promise<RuntimeProjectSnapshot> {
  const response = await runtimeFetch<RuntimeProjectSnapshot | { project: RuntimeProject; files: RuntimeFileEntry[]; readme?: string | null; previewUrl?: string | null }>(
    `/api/runtime/projects/${encodeURIComponent(projectId)}`,
  );
  if ("project" in response && response.project) return { ...response.project, files: response.files || [], readme: response.readme, previewUrl: response.previewUrl };
  return response as RuntimeProjectSnapshot;
}

export async function readRuntimeFile(projectId: string, filePath: string): Promise<RuntimeFile> {
  return runtimeFetch<RuntimeFile>(
    `/api/runtime/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(filePath)}`,
  );
}

export async function saveRuntimeFile(
  projectId: string,
  filePath: string,
  content: string,
  expectedSha256?: string,
): Promise<{ path: string; sha256: string }> {
  return runtimeFetch<{ path: string; sha256: string }>(
    `/api/runtime/projects/${encodeURIComponent(projectId)}/file`,
    {
      method: "PUT",
      body: JSON.stringify({ path: filePath, content, expectedSha256 }),
    },
  );
}

export async function startRuntimeUnderstanding(projectId: string, idea: string): Promise<{ jobId: string }> {
  return runtimeFetch<{ jobId: string }>(
    `/api/runtime/projects/${encodeURIComponent(projectId)}/understand`,
    { method: "POST", body: JSON.stringify({ idea }) },
  );
}

export async function startRuntimeBuild(
  projectId: string,
  idea: string,
  checkpoint: RuntimeCheckpoint,
): Promise<{ jobId: string }> {
  return runtimeFetch<{ jobId: string }>(`/api/runtime/projects/${encodeURIComponent(projectId)}/build`, {
    method: "POST",
    body: JSON.stringify({ idea, checkpoint }),
  });
}

export async function startRuntimeCheck(projectId: string, kind = "test"): Promise<{ jobId: string }> {
  return runtimeFetch<{ jobId: string }>(`/api/runtime/projects/${encodeURIComponent(projectId)}/check`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}

export async function setRuntimePreview(
  projectId: string,
  action: "start" | "stop",
): Promise<RuntimePreviewStatus> {
  return runtimeFetch<RuntimePreviewStatus>(`/api/runtime/projects/${encodeURIComponent(projectId)}/preview`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function getRuntimeJob(jobId: string): Promise<RuntimeJob> {
  return runtimeFetch<RuntimeJob>(`/api/runtime/jobs/${encodeURIComponent(jobId)}`);
}

export async function listRuntimeJobs(projectId?: string): Promise<{ jobs: RuntimeJob[] }> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return runtimeFetch<{ jobs: RuntimeJob[] }>(`/api/runtime/jobs${query}`);
}

export async function cancelRuntimeJob(jobId: string): Promise<{ ok: boolean }> {
  return runtimeFetch<{ ok: boolean }>(`/api/runtime/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function resumeRuntimeJob(jobId: string): Promise<{ jobId: string }> {
  return runtimeFetch<{ jobId: string }>(`/api/runtime/jobs/${encodeURIComponent(jobId)}/resume`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function startRuntimeAuth(): Promise<{ jobId: string; message: string }> {
  return runtimeFetch<{ jobId: string; message: string }>("/api/runtime/auth/start", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getRuntimeAuthStatus(jobId?: string): Promise<RuntimeAuthStatus> {
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return runtimeFetch<RuntimeAuthStatus>(`/api/runtime/auth/status${query}`);
}
