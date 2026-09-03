// GitHub connector (T1). Bring-your-own token, entirely client-side: the token
// is held in the browser and sent straight to api.github.com (which supports CORS).
// No backend, no central credential store — matches the BYO-connector architecture.
//
// Uses the Contents API for the simple single-file open/commit loop:
//   GET  /repos/{owner}/{repo}/contents/{path}  -> { content(base64), sha }
//   PUT  /repos/{owner}/{repo}/contents/{path}  -> commit (message, content, sha, branch)

const API = "https://api.github.com";
const TOKEN_KEY = "platynum47:github:token:v1";

export interface GitHubRepo {
  full_name: string; // owner/repo
  default_branch: string;
  private: boolean;
}

export interface GitHubEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  sha: string;
}

export function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

// One-click OAuth: capture the token the broker handed back in the URL fragment,
// store it on-device, and scrub it from the URL. Call once on app load.
export function captureOAuthToken(): boolean {
  const hash = window.location.hash;
  const match = hash.match(/gh_token=([^&]+)/);
  if (!match) return false;
  saveToken(decodeURIComponent(match[1]));
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}

// Is the one-click broker configured on this deployment?
export async function oauthConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/github/oauth/status");
    if (!res.ok) return false;
    const data = (await res.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

export function saveToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — connector still works for the session */
  }
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function req<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(token), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

// UTF-8 safe base64 (btoa/atob are latin1-only).
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function validateToken(token: string): Promise<string> {
  const user = await req<{ login: string }>(token, "/user");
  return user.login;
}

export async function listRepos(token: string): Promise<GitHubRepo[]> {
  const repos = await req<GitHubRepo[]>(token, "/user/repos?per_page=100&sort=updated");
  return repos.map((r) => ({ full_name: r.full_name, default_branch: r.default_branch, private: r.private }));
}

export async function listBranches(token: string, fullName: string): Promise<string[]> {
  const branches = await req<{ name: string }[]>(token, `/repos/${fullName}/branches?per_page=100`);
  return branches.map((b) => b.name);
}

export async function listDir(
  token: string,
  fullName: string,
  branch: string,
  dir = "",
): Promise<GitHubEntry[]> {
  const path = dir ? `/${encodeURIComponent(dir).replace(/%2F/g, "/")}` : "";
  const entries = await req<GitHubEntry[]>(
    token,
    `/repos/${fullName}/contents${path}?ref=${encodeURIComponent(branch)}`,
  );
  return entries
    .map((e) => ({ name: e.name, path: e.path, type: e.type, sha: e.sha }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

export async function getFile(
  token: string,
  fullName: string,
  branch: string,
  path: string,
): Promise<GitHubFile> {
  const data = await req<{ content: string; sha: string; encoding: string }>(
    token,
    `/repos/${fullName}/contents/${path}?ref=${encodeURIComponent(branch)}`,
  );
  return { path, sha: data.sha, content: decodeBase64(data.content) };
}

export async function commitFile(
  token: string,
  fullName: string,
  branch: string,
  path: string,
  content: string,
  sha: string,
  message: string,
): Promise<string> {
  const data = await req<{ content: { sha: string } }>(token, `/repos/${fullName}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: encodeBase64(content), sha, branch }),
  });
  return data.content.sha; // new blob sha
}

