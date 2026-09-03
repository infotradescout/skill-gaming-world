import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";

const IGNORED = new Set([".git", "node_modules", ".DS_Store", "dist", "build", ".next", ".turbo", "coverage", "out", "target"]);
const PROTECTED_NAMES = new Set(["credentials.json", "secrets.json", "id_rsa", "id_ed25519"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_OUTPUT = 512 * 1024;
const COMMAND_TIMEOUT_MS = 120 * 1000;
const CHILD_SHUTDOWN_TIMEOUT_MS = 3 * 1000;
const TEXT_EXTENSIONS = new Set([".html", ".htm", ".css", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".json", ".md", ".txt", ".yml", ".yaml", ".toml", ".env", ".svg"]);
const childTerminations = new WeakMap();

export function isPathContained(root, target) {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(`${r}${path.sep}`);
}

export function sanitizeRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("A file path is required.");
  const raw = value.replaceAll("\\", "/");
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) throw new Error("Absolute paths are not allowed.");
  const parts = raw.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === ".." || part === ".git" || part.startsWith(".git/"))) throw new Error("Unsafe path.");
  const clean = path.posix.normalize(parts.join("/"));
  if (clean === "." || clean.startsWith("../") || clean.includes("/.git/")) throw new Error("Unsafe path.");
  return clean;
}

function isProtectedPath(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  return normalized.split("/").some((part) => PROTECTED_NAMES.has(part) || /^\.env(?:\.|$)/i.test(part) || /\.(?:pem|key|p12|pfx)$/i.test(part));
}

export function projectId(root) {
  return crypto.createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 20);
}

export function summarizeCodexEvent(event) {
  if (!event || typeof event !== "object") return null;
  const type = event.type || event.event || "";
  const text = event.text || event.message || event.content || event.delta || event.output_text;
  if (typeof text === "string" && text.trim()) return { type: String(type || "message"), text: text.trim().slice(0, 2000) };
  if (type === "turn.completed" || type === "completed" || type === "done") return { type: "completed", text: "Codex finished." };
  if (type === "error" || event.error) return { type: "error", text: String(event.error || "Codex reported an error.").slice(0, 2000) };
  return type ? { type: String(type), text: "" } : null;
}

export function parseCheckpoint(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* plain text is still useful */ }
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match) { try { return JSON.parse(match[1]); } catch { /* fall through */ } }
  return { text };
}

function languageFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html" || ext === ".htm") return "html";
  if (ext === ".css") return "css";
  if ([".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(ext)) return "javascript";
  return "text";
}

function envRoots() {
  if (process.env.P47_PROJECT_ROOTS) return process.env.P47_PROJECT_ROOTS.split(path.delimiter).flatMap((v) => v.split(",")).map((v) => path.resolve(v.trim())).filter(Boolean);
  const home = os.homedir();
  return ["Documents", "Desktop", "projects", "code", "source"].map((name) => path.join(home, name)).concat(process.cwd());
}

async function readPackageManifest(root, fsApi = fs) {
  try {
    const text = await fsApi.readFile(path.join(root, "package.json"), "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function isLikelyProject(dir, fsApi = fs) {
  try {
    const items = await fsApi.readdir(dir, { withFileTypes: true });
    if (items.some((item) => item.isFile() && ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "index.html"].includes(item.name))) return true;
    return items.some((item) => item.isDirectory() && item.name === ".git");
  } catch {
    return false;
  }
}

function execFileResult(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { ...options, maxBuffer: MAX_COMMAND_OUTPUT }, (error, stdout, stderr) => {
      resolve({
        code: error?.code === "ETIMEDOUT" ? null : (typeof error?.code === "number" ? error.code : error ? 1 : 0),
        stdout: String(stdout || "").slice(-MAX_COMMAND_OUTPUT),
        stderr: String(stderr || "").slice(-MAX_COMMAND_OUTPUT),
        error,
      });
    });
  });
}

async function gitMetadata(root) {
  const top = await execFileResult("git", ["-C", root, "rev-parse", "--show-toplevel"], { timeout: 5000 });
  if (top.code !== 0 || path.resolve(top.stdout.trim()) !== path.resolve(root)) return { kind: "folder", branch: null, dirty: false, changedFiles: 0 };
  const branch = await execFileResult("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 5000 });
  if (branch.code !== 0 || !branch.stdout.trim()) return { kind: "folder", branch: null, dirty: false, changedFiles: 0 };
  const status = await execFileResult("git", ["-C", root, "status", "--porcelain", "--untracked-files=all"], { timeout: 5000 });
  const changedFiles = status.stdout.split(/\r?\n/).filter(Boolean).length;
  return {
    kind: "git",
    branch: branch.stdout.trim(),
    dirty: changedFiles > 0,
    changedFiles,
  };
}

async function projectMetadata(root, fsApi = fs) {
  const manifest = await readPackageManifest(root, fsApi);
  const git = await gitMetadata(root);
  return {
    id: projectId(root),
    root,
    name: manifest?.name || path.basename(root) || root,
    ...git,
    scripts: manifest?.scripts && typeof manifest.scripts === "object" ? Object.keys(manifest.scripts) : [],
  };
}

async function discoverProjects(roots, fsApi = fs) {
  const result = [];
  const seen = new Set();
  for (const root of roots) {
    let stat;
    try { stat = await fsApi.stat(root); } catch { continue; }
    if (!stat.isDirectory() || path.basename(root) === ".git") continue;
    const add = async (dir) => {
      const resolved = path.resolve(dir);
      if (seen.has(resolved) || !(await isLikelyProject(resolved, fsApi))) return;
      seen.add(resolved);
      result.push(await projectMetadata(resolved, fsApi));
      let items = [];
      try { items = await fsApi.readdir(resolved, { withFileTypes: true }); } catch { return; }
      for (const item of items) {
        if (!item.isDirectory() || IGNORED.has(item.name) || item.name.startsWith(".")) continue;
        const child = path.join(resolved, item.name);
        // Discover one level of likely projects; avoid walking arbitrary trees.
        if (await isLikelyProject(child, fsApi)) {
          const childProject = await projectMetadata(child, fsApi);
          if (!seen.has(child)) {
            seen.add(child);
            result.push(childProject);
          }
        }
      }
    };
    await add(root);
  }
  return result;
}

function safeProject(root) {
  const resolved = path.resolve(root);
  if (path.basename(resolved) === ".git" || resolved === path.parse(resolved).root) throw new Error("Invalid project root.");
  return resolved;
}

async function realPath(fsApi, target) {
  try {
    if (typeof fsApi.realpath === "function") return await fsApi.realpath(target);
    return fssync.realpathSync(target);
  } catch (error) {
    if (error.code === "ENOENT") return path.resolve(target);
    throw error;
  }
}

async function tree(root, fsApi = fs, dir = "", depth = 3) {
  if (depth < 0) return [];
  let entries = [];
  try { entries = await fsApi.readdir(path.join(root, dir), { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED.has(entry.name) || entry.name.startsWith(".git") || isProtectedPath(entry.name)) continue;
    const rel = dir ? path.posix.join(dir.replaceAll(path.sep, "/"), entry.name) : entry.name;
    if (entry.isDirectory()) out.push({ path: rel, type: "directory", children: await tree(root, fsApi, rel, depth - 1) });
    else out.push({ path: rel, type: "file" });
  }
  return out;
}

async function flatFiles(root, fsApi = fs, dir = "", depth = 8) {
  if (depth < 0) return [];
  let entries = [];
  try { entries = await fsApi.readdir(path.join(root, dir), { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED.has(entry.name) || entry.name.startsWith(".git") || isProtectedPath(entry.name)) continue;
    const rel = dir ? path.posix.join(dir.replaceAll(path.sep, "/"), entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...await flatFiles(root, fsApi, rel, depth - 1));
    else { let size; try { size = (await fsApi.stat(path.join(root, rel))).size; } catch { size = undefined; } out.push({ path: rel, name: entry.name, kind: "file", size, language: languageFor(rel) }); }
  }
  return out;
}

function hasCodexAuth(codexHome) {
  for (const file of [path.join(codexHome, "auth.json"), path.join(codexHome, "config.json")]) {
    try {
      const parsed = JSON.parse(fssync.readFileSync(file, "utf8"));
      if (parsed && (parsed.tokens || parsed.access_token || parsed.chatgptAccountId || parsed.auth)) return true;
    } catch { /* unavailable */ }
  }
  return false;
}

function readAuth(home = os.homedir()) {
  const provided = path.resolve(home);
  const codexHome = path.basename(provided) === ".codex"
    ? provided
    : (process.env.CODEX_HOME || path.join(provided, ".codex"));
  return hasCodexAuth(codexHome);
}

function commandAvailable(command) {
  if (!command) return false;
  if (path.isAbsolute(command)) return fssync.existsSync(command);
  return (process.env.PATH || "").split(path.delimiter).some((p) => fssync.existsSync(path.join(p, command)));
}
function resolveCodexCommand(command) {
  if (!command) return null;
  const candidates = path.extname(command) ? [command] : [command, `${command}.cmd`, `${command}.exe`];
  if (command === "codex") {
    const homeCandidates = [
      path.join(os.homedir(), ".local", "bin", "codex"),
      path.join(os.homedir(), ".codex", "bin", "codex"),
      path.join(os.homedir(), ".codex", "bin", "codex.cmd"),
      path.join(os.homedir(), ".codex", "bin", "codex.exe"),
    ];
    candidates.push(...homeCandidates);
  }
  return candidates.find((candidate) => commandAvailable(candidate)) || null;
}

function runnerEnvironment(runtimeNode, runtimeNodeDir) {
  const environment = { ...process.env };
  let inheritedPath = "";
  for (const key of Object.keys(environment)) {
    const normalized = key.toUpperCase();
    if (normalized === "PATH") {
      inheritedPath ||= environment[key] || "";
      delete environment[key];
    }
    if (normalized === "NODE_OPTIONS" || normalized === "NODE_EXTRA_CA_CERTS") delete environment[key];
  }
  environment[process.platform === "win32" ? "Path" : "PATH"] = runtimeNodeDir
    ? `${runtimeNodeDir}${path.delimiter}${inheritedPath}`
    : inheritedPath;
  environment.ELECTRON_RUN_AS_NODE = "1";
  environment.P47_ELECTRON_EXECUTABLE = runtimeNode;
  return environment;
}

function resolveNpmInvocation() {
  const npmCli = process.env.P47_NPM_CLI;
  const runtimeNode = process.env.P47_NODE_BIN;
  const runtimeNodeDir = process.env.P47_RUNTIME_NODE_DIR;
  if (npmCli && runtimeNode && fssync.existsSync(npmCli) && fssync.existsSync(runtimeNode)) {
    return {
      command: runtimeNode,
      args: [npmCli],
      environment: runnerEnvironment(runtimeNode, runtimeNodeDir),
      label: "Platynum's built-in project runner",
    };
  }
  if (process.env.P47_DESKTOP_RUNTIME === "1") return null;
  const candidates = process.platform === "win32" ? ["npm.cmd", "npm.exe", "npm"] : ["npm"];
  const command = candidates.find((candidate) => commandAvailable(candidate));
  return command ? { command, args: [], environment: { ...process.env }, label: command } : null;
}

function spawnCommand(command, args, options = {}) {
  const shell = options.shell ?? (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command));
  return spawn(command, args, { ...options, shell, windowsHide: options.windowsHide ?? true });
}

function childHasExited(child) {
  return child?.exitCode !== null && child?.exitCode !== undefined
    || child?.signalCode !== null && child?.signalCode !== undefined;
}

function waitForChildExit(child, timeoutMs) {
  if (childHasExited(child)) return Promise.resolve(true);
  if (!child?.pid || typeof child.once !== "function") return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    timer.unref?.();
    child.once("close", finish);
    child.once("exit", finish);
    child.once("error", finish);
  });
}

/**
 * End a child process without leaving a Windows npm.cmd process tree behind.
 * taskkill /T reaches the dev server spawned underneath npm.cmd; POSIX receives
 * a normal SIGTERM and a short wait for its close event.
 */
export function terminateChild(child, options = {}) {
  if (!child || typeof child !== "object") return Promise.resolve();
  const pending = childTerminations.get(child);
  if (pending) return pending;
  const pid = Number(child.pid);
  if (!Number.isInteger(pid) || pid <= 0 || childHasExited(child)) return Promise.resolve();
  const platform = options.platform || process.platform;
  const timeoutMs = options.timeoutMs ?? CHILD_SHUTDOWN_TIMEOUT_MS;
  const waitForExit = options.waitForExit !== false;
  const execFileApi = options.execFileApi || execFile;
  const exitWait = waitForExit ? waitForChildExit(child, timeoutMs) : null;
  const terminate = platform === "win32"
    ? new Promise((resolve) => {
      execFileApi("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, (error) => error ? resolve({ error }) : resolve({ error: null }));
    })
    : Promise.resolve().then(() => {
      try { child.kill?.("SIGTERM"); } catch { /* already exited */ }
      return { error: null };
    });
  const result = terminate.then(async ({ error }) => {
    const exited = exitWait ? await exitWait : childHasExited(child);
    if (error && !exited && !childHasExited(child)) throw error;
    if (waitForExit && !exited && !childHasExited(child)) throw new Error(`Process ${pid} did not stop in time.`);
  });
  const finalResult = result.finally(() => childTerminations.delete(child));
  childTerminations.set(child, finalResult);
  return finalResult;
}

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || COMMAND_TIMEOUT_MS;
  const { timeoutMs: _ignored, onSpawn, ...spawnOptions } = options;
  return new Promise((resolve) => {
    const child = spawnCommand(command, args, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] });
    onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (current, chunk) => `${current}${String(chunk)}`.slice(-MAX_COMMAND_OUTPUT);
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { timedOut = true; void terminateChild(child).catch(() => undefined); }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}`.slice(-MAX_COMMAND_OUTPUT), timedOut, error });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: typeof code === "number" ? code : 1, stdout, stderr, timedOut });
    });
  });
}

function checkpointFromParsed(value) {
  const parsed = parseCheckpoint(value) || {};
  const stringValue = (candidate, fallback) => typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
  const listValue = (candidate) => Array.isArray(candidate) ? candidate.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()).slice(0, 8) : [];
  return {
    title: "What I understand you want",
    understanding: stringValue(parsed.understanding || parsed.product_intent || parsed.summary || parsed.text, "I understand the project direction and will inspect it before editing."),
    recommendations: listValue(parsed.recommendations),
    consensus: stringValue(parsed.consensus, "The strongest path is to make the smallest safe change that proves this outcome."),
    wildcard: stringValue(parsed.wildcard, "I’ll surface a useful alternative if the project evidence supports one."),
    acceptance: listValue(parsed.acceptance || parsed.acceptanceCriteria || parsed.checks),
    humanActions: listValue(parsed.humanActions || parsed.human_actions),
  };
}

function resultFromParsed(value, changedFiles = [], checks = []) {
  const parsed = parseCheckpoint(value);
  if (!parsed || typeof parsed !== "object") {
    return { summary: String(parsed || "Build completed."), changedFiles, checks, remaining: [] };
  }
  const parsedChecks = Array.isArray(parsed.checks) ? parsed.checks : [];
  const normalizedChecks = parsedChecks.map((check, index) => ({
    name: typeof check?.name === "string" ? check.name : `Check ${index + 1}`,
    command: typeof check?.command === "string" ? check.command : undefined,
    passed: typeof check?.passed === "boolean" ? check.passed : Boolean(check?.ok),
    output: typeof check?.output === "string" ? check.output : "",
    durationMs: typeof check?.durationMs === "number" ? check.durationMs : undefined,
  }));
  const declaredFiles = Array.isArray(parsed.changedFiles)
    ? parsed.changedFiles.filter((file) => typeof file === "string")
    : Object.keys(parsed.files || {});
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : (typeof parsed.text === "string" ? parsed.text : "Build completed."),
    changedFiles: Array.from(new Set([...changedFiles, ...declaredFiles])),
    checks: normalizedChecks.length ? normalizedChecks : checks,
    remaining: Array.isArray(parsed.remaining) ? parsed.remaining.filter((item) => typeof item === "string") : [],
    diffStat: typeof parsed.diffStat === "string" ? parsed.diffStat : "",
    previewUrl: typeof parsed.previewUrl === "string" ? parsed.previewUrl : null,
  };
}

function extractAgentMessage(event) {
  if (!event || typeof event !== "object") return null;
  const candidates = [
    event.text,
    event.output_text,
    event.item?.text,
    event.item?.output_text,
    event.item?.message,
    event.message,
  ];
  for (const candidate of candidates) if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  const content = event.item?.content || event.content;
  if (Array.isArray(content)) {
    const text = content.map((part) => part?.text || part?.value || "").filter(Boolean).join("\n").trim();
    if (text) return text;
  }
  return null;
}

function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
  }[ext] || "application/octet-stream";
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function createStaticPreview(root, port) {
  const server = http.createServer(async (request, response) => {
    try {
      const rawPath = String(request.url || "/").split("?")[0];
      let decoded;
      try { decoded = decodeURIComponent(rawPath); } catch { response.writeHead(400); response.end("Bad path"); return; }
      const relative = decoded.replace(/^\/+/, "");
      if (isProtectedPath(relative)) { response.writeHead(403); response.end("Protected file"); return; }
      const target = path.resolve(root, relative);
      if (!isPathContained(root, target)) { response.writeHead(403); response.end("Forbidden"); return; }
      let file = target;
      let stat;
      try { stat = await fs.stat(file); } catch { stat = null; }
      if (stat?.isDirectory()) file = path.join(file, "index.html");
      try { stat = await fs.stat(file); } catch { stat = null; }
      // A single-page app should still render its shell for client-side routes.
      if (!stat?.isFile()) {
        const fallback = path.join(root, "index.html");
        try { stat = await fs.stat(fallback); file = fallback; } catch { stat = null; }
      }
      if (!stat?.isFile()) { response.writeHead(404); response.end("Not found"); return; }
      const realRoot = await realPath(fs, root);
      const realFile = await realPath(fs, file);
      if (!isPathContained(realRoot, realFile)) { response.writeHead(403); response.end("Forbidden"); return; }
      if (stat.size > MAX_FILE_BYTES) { response.writeHead(413); response.end("File is too large"); return; }
      response.writeHead(200, { "content-type": contentTypeFor(realFile), "cache-control": "no-store" });
      response.end(await fs.readFile(realFile));
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end("Preview failed");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function changedFilesFor(root) {
  const status = await execFileResult("git", ["-C", root, "status", "--porcelain", "--untracked-files=all"], { timeout: 5000 });
  if (status.code !== 0) return [];
  return status.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const value = line.slice(3).trim();
    const rename = value.includes(" -> ") ? value.split(" -> ").pop() : value;
    return rename?.replaceAll("\\", "/");
  }).filter(Boolean);
}

function cookieValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return value.join("=");
    }
  }
  return "";
}

function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;
  const actualBytes = Buffer.from(String(actual));
  const expectedBytes = Buffer.from(String(expected));
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}

function requestHostname(req) {
  const host = String(req.get("host") || "").trim().toLowerCase();
  if (!host) return "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 0 ? host.slice(1, end) : host;
  }
  return host.split(":")[0];
}

export function createRuntimeRouter(options = {}) {
  const router = express.Router();
  const fsApi = options.fs || fs;
  const roots = Array.from(new Set((options.roots?.length ? options.roots : envRoots()).map((root) => path.resolve(root))));
  const projects = new Map();
  const jobs = new Map();
  const previews = new Map();
  const authJobs = new Map();
  const activeChildren = new Set();
  const codexBin = options.codexBin || process.env.P47_CODEX_BIN || "codex";
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const recordDir = options.recordDir || path.join(os.homedir(), ".platynum-47", "runs");
  const accessToken = typeof options.accessToken === "string" ? options.accessToken : "";
  const accessCookieName = options.accessCookieName || "p47_runtime";
  const expectedHost = typeof options.expectedHost === "string" ? options.expectedHost.toLowerCase() : "";
  if (options.enabled && !accessToken) throw new Error("The local runtime needs a per-launch access capability.");
  const persistQueues = new Map();
  let lastAuthJobId = null;
  let disposed = false;
  const trackChild = (child) => {
    activeChildren.add(child);
    const untrack = () => activeChildren.delete(child);
    child.once?.("error", untrack);
    child.once?.("close", untrack);
    child.once?.("exit", untrack);
    return child;
  };
  const assertAllowed = async (target) => {
    const realTarget = await realPath(fsApi, target);
    const allowed = await Promise.all(roots.map((root) => realPath(fsApi, root)));
    if (!allowed.some((root) => isPathContained(root, realTarget))) throw new Error("Path is outside the allowed project roots.");
    return realTarget;
  };
  const addProjectRoot = async (root) => {
    if (disposed) throw new Error("The local runtime is closing.");
    const requested = safeProject(root);
    const realRoot = await realPath(fsApi, requested);
    if (realRoot === path.parse(realRoot).root) throw new Error("Choose a project folder, not a drive.");
    const stat = await fsApi.stat(realRoot);
    if (!stat.isDirectory()) throw new Error("That location is not a folder.");
    if (!roots.includes(realRoot)) roots.push(realRoot);
    const project = await projectMetadata(realRoot, fsApi);
    projects.set(project.id, project);
    return project;
  };

  const persistJob = async (job) => {
    const previous = persistQueues.get(job.id) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      try {
        await fs.mkdir(recordDir, { recursive: true });
        await fs.writeFile(path.join(recordDir, `${job.id}.json`), JSON.stringify({ ...publicJob(job), root: job.root, request: job.request }, null, 2), "utf8");
      } catch {
        // Recovery records are best-effort; a locked-down machine still gets an in-memory run.
      }
    });
    persistQueues.set(job.id, next);
    await next;
    if (persistQueues.get(job.id) === next) persistQueues.delete(job.id);
  };
  const loadJob = async (id) => {
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(recordDir, `${id}.json`), "utf8"));
      if (!parsed || parsed.id !== id) return null;
      return { ...parsed, events: Array.isArray(parsed.events) ? parsed.events : [] };
    } catch {
      return null;
    }
  };
  const touchJob = (job, changes = {}) => {
    Object.assign(job, changes, { updatedAt: new Date().toISOString() });
    void persistJob(job);
  };
  const refresh = async () => {
    const found = await discoverProjects(roots, fsApi);
    projects.clear();
    for (const project of found) projects.set(project.id, project);
    return found;
  };
  const getProject = async (id) => { if (!projects.has(id)) await refresh(); const p = projects.get(id); if (!p) throw new Error("Project not found."); return p; };
  const fail = (res, err, status = 400) => res.status(err?.statusCode || status).json({ error: err.message || String(err) });
  router.use((req, res, next) => {
    if (disposed) return res.status(503).json({ error: "Platynum is closing its local workspace." });
    const ip = String(req.ip || req.socket?.remoteAddress || "");
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) {
      return res.status(403).json({ error: "Loopback requests only." });
    }
    next();
  });
  router.use((req, res, next) => {
    // Direct test adapters may omit a capability. The production server always
    // passes one and fails closed if it does not.
    if (!accessToken) return next();
    const host = String(req.get("host") || "").trim().toLowerCase();
    if (!host || (expectedHost && requestHostname(req) !== expectedHost)) {
      return res.status(403).json({ error: "This local runtime only accepts its own loopback host." });
    }
    if (!tokenMatches(cookieValue(req.get("cookie"), accessCookieName), accessToken)) {
      return res.status(401).json({ error: "This local runtime needs its current launcher capability." });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = String(req.get("origin") || "").trim().toLowerCase();
      if (origin !== `http://${host}`) {
        return res.status(403).json({ error: "Changes must come from this local Platynum page." });
      }
    }
    next();
  });
  router.use(express.json({ limit: "2mb" }));
  // This is intentionally not an HTTP endpoint. Electron calls it only after
  // Windows' native chooser returns a directory, so a renderer cannot widen
  // the filesystem boundary by submitting an arbitrary path.
  router.addProjectRoot = addProjectRoot;
  router.dispose = async () => {
    if (disposed) return;
    disposed = true;
    for (const job of jobs.values()) {
      if (!["completed", "failed", "cancelled"].includes(job.status)) {
        touchJob(job, { status: "cancelled", stage: "stopped because Platynum closed" });
      }
      job.cancel?.();
    }
    for (const job of authJobs.values()) job.cancel?.();
    const closers = [];
    const terminations = new Set();
    for (const preview of previews.values()) {
      if (preview.process) terminations.add(terminateChild(preview.process));
      if (preview.server) {
        preview.server.closeAllConnections?.();
        closers.push(new Promise((resolve) => preview.server.close(() => resolve())));
      }
    }
    previews.clear();
    for (const child of activeChildren) {
      terminations.add(terminateChild(child));
    }
    await Promise.all([...closers, ...terminations]);
  };

  router.get("/status", async (_req, res) => {
    try {
      const command = resolveCodexCommand(codexBin);
      res.json({ enabled: true, host: "127.0.0.1", codex: { installed: Boolean(command), signedIn: hasCodexAuth(codexHome), command }, projects: await refresh() });
    } catch (error) { fail(res, error, 500); }
  });
  router.get("/projects", async (req, res) => {
    try {
      const list = await refresh();
      res.json({ projects: list, entries: req.query.discover === "true" ? list.map((project) => ({ name: project.name, path: project.root, kind: "project", project })) : [] });
    } catch (error) { fail(res, error, 500); }
  });
  router.get("/browse", async (req, res) => {
    try {
      let requested = req.query.path ? safeProject(String(req.query.path)) : null;
      if (!requested) {
        requested = roots.find((root) => {
          try { return fssync.statSync(root).isDirectory(); } catch { return false; }
        }) || process.cwd();
      }
      requested = await assertAllowed(requested);
      const stat = await fsApi.stat(requested);
      if (!stat.isDirectory()) throw new Error("That location is not a folder.");
      const children = await fsApi.readdir(requested, { withFileTypes: true });
      const entries = [];
      for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!child.isDirectory() || IGNORED.has(child.name) || child.name.startsWith(".")) continue;
        const childPath = path.resolve(requested, child.name);
        if (await isLikelyProject(childPath, fsApi)) entries.push({ name: child.name, path: childPath, kind: "project", project: await projectMetadata(childPath, fsApi) });
        else entries.push({ name: child.name, path: childPath, kind: "directory" });
      }
      res.json({ path: requested, entries });
    } catch (error) { fail(res, error); }
  });
  router.post("/projects/open", async (req, res) => {
    try {
      const root = safeProject(req.body?.root);
      const realRoot = await assertAllowed(root);
      const stat = await fsApi.stat(realRoot);
      if (!stat.isDirectory()) throw new Error("Project root is not a directory.");
      const project = await projectMetadata(realRoot, fsApi);
      projects.set(project.id, project);
      res.json(project);
    } catch (error) { fail(res, error); }
  });
  router.get("/projects/:id", async (req, res) => {
    try {
      const current = await getProject(req.params.id);
      const project = await projectMetadata(current.root, fsApi);
      projects.set(project.id, project);
      let readme = null;
      try { readme = (await fsApi.readFile(path.join(project.root, "README.md"), "utf8")).slice(0, 4000); } catch { /* optional */ }
      const preview = previews.get(project.id);
      res.json({ ...project, files: await flatFiles(project.root, fsApi), readme, previewUrl: preview && ["starting", "running"].includes(preview.status) ? preview.url : null });
    } catch (error) { fail(res, error, 404); }
  });
  router.get("/projects/:id/file", async (req, res) => {
    try {
      const p = await getProject(req.params.id);
      const rel = sanitizeRelativePath(String(req.query.path || ""));
      if (isProtectedPath(rel)) throw new Error("Protected files are kept out of the local workspace view.");
      const file = path.resolve(p.root, rel);
      if (!isPathContained(p.root, file)) throw new Error("Unsafe path.");
      const realFile = await assertAllowed(file);
      if (!isPathContained(await realPath(fsApi, p.root), realFile)) throw new Error("Unsafe path.");
      const stat = await fsApi.stat(realFile);
      if (stat.size > MAX_FILE_BYTES) throw new Error("File is too large to read.");
      const content = await fsApi.readFile(realFile, "utf8");
      res.json({ path: rel, content, language: languageFor(rel), sha256: crypto.createHash("sha256").update(content).digest("hex") });
    } catch (error) { fail(res, error, 404); }
  });
  router.put("/projects/:id/file", async (req, res) => {
    try {
      const p = await getProject(req.params.id);
      const rel = sanitizeRelativePath(req.body?.path);
      if (isProtectedPath(rel)) throw new Error("Protected files cannot be edited from Platynum.");
      if (typeof req.body?.content !== "string" || Buffer.byteLength(req.body.content) > MAX_FILE_BYTES) throw new Error("File content is missing or too large.");
      const file = path.resolve(p.root, rel);
      if (!isPathContained(p.root, file)) throw new Error("Unsafe path.");
      const realRoot = await realPath(fsApi, p.root);
      const parent = await assertAllowed(path.dirname(file));
      if (!isPathContained(realRoot, parent)) throw new Error("Unsafe path.");
      if (await fsApi.stat(file).then(() => true).catch(() => false)) {
        const realFile = await assertAllowed(file);
        if (!isPathContained(realRoot, realFile)) throw new Error("Unsafe path.");
      }
      const expected = req.body.expectedSha256 || req.body.expectedSha;
      if (expected) {
        try {
          const old = await fsApi.readFile(file, "utf8");
          const sha = crypto.createHash("sha256").update(old).digest("hex");
          if (sha !== expected) return res.status(409).json({ error: "File changed since it was read.", sha256: sha });
        } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      await fsApi.mkdir(path.dirname(file), { recursive: true });
      await fsApi.writeFile(file, req.body.content, "utf8");
      res.json({ path: rel, sha256: crypto.createHash("sha256").update(req.body.content).digest("hex") });
    } catch (error) { fail(res, error); }
  });
  router.post("/projects/:id/understand", (req, res) => startJob(req, res, "understand"));
  router.post("/projects/:id/build", (req, res) => startJob(req, res, "build"));
  router.get("/jobs/:id", async (req, res) => {
    const job = jobs.get(req.params.id) || await loadJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found." });
    res.json(publicJob(job));
  });
  router.get("/jobs", async (req, res) => {
    const current = [...jobs.values()];
    try {
      const files = await fs.readdir(recordDir);
      for (const file of files.filter((name) => name.endsWith(".json"))) {
        const id = file.slice(0, -5);
        if (jobs.has(id)) continue;
        const record = await loadJob(id);
        if (record) current.push(record);
      }
    } catch { /* no recovery directory yet */ }
    const projectFilter = req.query.projectId ? String(req.query.projectId) : "";
    const filtered = current.filter((job) => !projectFilter || job.project === projectFilter).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({ jobs: filtered.slice(0, 25).map(publicJob) });
  });
  router.post("/jobs/:id/cancel", async (req, res) => {
    const job = jobs.get(req.params.id) || await loadJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found." });
    job.cancel?.();
    if (!["completed", "failed", "cancelled"].includes(job.status)) touchJob(job, { status: "cancelled", stage: "cancelled" });
    res.json({ ok: true, ...publicJob(job) });
  });
  router.post("/jobs/:id/resume", async (req, res) => {
    try {
      const previous = jobs.get(req.params.id) || await loadJob(req.params.id);
      if (!previous) return res.status(404).json({ error: "Run record not found." });
      if (!["failed", "cancelled"].includes(previous.status)) return res.status(409).json({ error: "Only a stopped or failed run can be resumed." });
      if (!previous.root || !previous.request) return res.status(409).json({ error: "This older run has no resumable request record." });
      const root = await assertAllowed(previous.root);
      const project = await projectMetadata(root, fsApi);
      projects.set(project.id, project);
      const mode = previous.mode || previous.kind;
      if (!["understand", "build"].includes(mode)) return res.status(409).json({ error: "This run type cannot be resumed." });
      if (!resolveCodexCommand(codexBin)) return res.status(503).json({ error: "The local Codex worker is not installed on this computer yet." });
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const job = { id, mode, kind: mode, status: "queued", stage: "queued", events: [], createdAt: now, updatedAt: now, startedAt: Date.now(), project: project.id, root, request: previous.request, resumedFrom: previous.id };
      jobs.set(id, job);
      void persistJob(job);
      void runCodex(job, root, mode, previous.request, previous.threadId || null);
      res.status(202).json({ jobId: id, id, ...publicJob(job) });
    } catch (error) { fail(res, error, 409); }
  });
  router.post("/projects/:id/check", (req, res) => startJob(req, res, "check"));
  router.post("/projects/:id/preview", async (req, res) => {
    try {
      const p = await getProject(req.params.id);
      const action = req.body?.action || "start";
      if (action === "stop") {
        const current = previews.get(p.id);
        if (current?.process) await terminateChild(current.process);
        if (current?.server) {
          current.server.closeAllConnections?.();
          await new Promise((resolve) => current.server.close(resolve));
        }
        previews.delete(p.id);
        return res.json({ status: "stopped", previewUrl: null });
      }
      if (action !== "start") throw new Error("Preview action must be start or stop.");
      const current = previews.get(p.id);
      if (current && ["starting", "running"].includes(current.status)) return res.json({ status: current.status, previewUrl: current.url, message: current.message || "Preview is running." });
      const manifest = await readPackageManifest(p.root, fsApi);
      const scripts = manifest?.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {};
      const script = ["dev", "start", "preview"].find((name) => typeof scripts[name] === "string" && scripts[name].trim());
      const requestedPort = Number(req.body?.port);
      const port = requestedPort > 0 && requestedPort < 65536 ? requestedPort : await freePort();
      const url = `http://127.0.0.1:${port}`;
      if (script) {
        const npm = resolveNpmInvocation();
        if (!npm) {
          const error = new Error("Platynum's project runner is unavailable, so this preview cannot start yet.");
          error.statusCode = 503;
          throw error;
        }
        const child = trackChild(spawnCommand(npm.command, [...npm.args, "run", script, "--", "--host", "127.0.0.1", "--port", String(port)], { cwd: p.root, env: { ...npm.environment, BROWSER: "none" }, stdio: ["ignore", "pipe", "pipe"] }));
        const preview = { status: "starting", url, process: child, message: `Starting ${script} locally.` };
        previews.set(p.id, preview);
        child.stdout?.on("data", (chunk) => { preview.message = String(chunk).trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || preview.message; });
        child.stderr?.on("data", (chunk) => { preview.message = String(chunk).trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || preview.message; });
        child.once("error", (error) => { preview.status = "failed"; preview.message = error.message; });
        child.once("close", (code) => { if (previews.get(p.id) === preview) { preview.status = code === 0 ? "stopped" : "failed"; preview.message = code === 0 ? "Preview stopped." : `Preview command exited with code ${code ?? "unknown"}.`; } });
        // Give the process a short head start; the URL remains stable while a dev server boots.
        setTimeout(() => { if (preview.status === "starting") preview.status = "running"; }, 400);
        return res.json({ status: "starting", previewUrl: url, message: preview.message });
      }
      if (await fsApi.stat(path.join(p.root, "index.html")).then((stat) => stat.isFile()).catch(() => false)) {
        const server = await createStaticPreview(p.root, port);
        const preview = { status: "running", url, server, message: "Serving the project locally." };
        previews.set(p.id, preview);
        return res.json({ status: preview.status, previewUrl: url, message: preview.message });
      }
      const error = new Error("This project has no preview command or index.html yet.");
      error.statusCode = 409;
      throw error;
    } catch (error) { fail(res, error, 404); }
  });
  router.post("/auth/start", (_req, res) => {
    const command = resolveCodexCommand(codexBin);
    if (!command) return res.status(503).json({ error: "Codex is not installed on this computer yet." });
    const jobId = crypto.randomUUID();
    const job = { jobId, state: "running", message: "A browser sign-in window should open for your ChatGPT account." };
    authJobs.set(jobId, job);
    lastAuthJobId = jobId;
    const child = trackChild(spawnCommand(command, ["login"], { cwd: process.cwd(), env: { ...process.env, CODEX_HOME: codexHome }, stdio: ["ignore", "pipe", "pipe"] }));
    job.cancel = () => { void terminateChild(child).catch(() => undefined); };
    const captureLoginMessage = (chunk) => {
      const text = String(chunk).trim().split(/\r?\n/).filter(Boolean).slice(-1)[0];
      if (text) job.message = text.slice(0, 2000);
    };
    child.stdout?.on("data", captureLoginMessage);
    child.stderr?.on("data", captureLoginMessage);
    child.once("error", (error) => { delete job.cancel; job.state = "failed"; job.message = `Codex sign-in could not start: ${error.message}`; });
    child.once("close", (code) => { delete job.cancel; job.state = code === 0 ? "completed" : "failed"; job.message = code === 0 ? "ChatGPT sign-in completed on this computer." : "Codex sign-in did not complete."; });
    res.status(202).json({ jobId, message: job.message });
  });
  router.get("/auth/status", (req, res) => {
    const requested = req.query.jobId ? String(req.query.jobId) : lastAuthJobId;
    const job = requested ? authJobs.get(requested) : null;
    res.json({ installed: Boolean(resolveCodexCommand(codexBin)), signedIn: hasCodexAuth(codexHome), command: resolveCodexCommand(codexBin), state: job?.state || "idle", message: job?.message || "" });
  });

  async function startJob(req, res, mode) {
    try {
      const p = await getProject(req.params.id);
      if (mode !== "check" && (typeof req.body?.idea !== "string" || !req.body.idea.trim())) throw new Error("Tell Platynum what you want to happen in this project.");
      if (mode === "build" && (!req.body?.checkpoint || typeof req.body.checkpoint !== "object")) {
        const error = new Error("Platynum needs an approved understanding before it can edit this project.");
        error.statusCode = 409;
        throw error;
      }
      if (mode !== "check" && !resolveCodexCommand(codexBin)) {
        const error = new Error("The local Codex worker is not installed on this computer yet.");
        error.statusCode = 503;
        throw error;
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const job = { id, mode, kind: mode, status: "queued", stage: "queued", events: [], createdAt: now, updatedAt: now, startedAt: Date.now(), project: p.id, root: p.root, request: { idea: req.body?.idea, checkpoint: req.body?.checkpoint || null } };
      jobs.set(id, job);
      void persistJob(job);
      if (mode === "check") void runCheckJob(job, p.root, req.body?.kind);
      else void runCodex(job, p.root, mode, req.body);
      res.status(202).json({ jobId: id, id, ...publicJob(job) });
    } catch (error) { fail(res, error, 404); }
  }

  async function runCheckJob(job, root, kind) {
    touchJob(job, { status: "running", stage: "checking" });
    try {
      let cancel = null;
      job.cancel = () => cancel?.();
      const checks = await projectChecks(root, fsApi, kind, {
        onSpawn: (child) => {
          trackChild(child);
          cancel = () => { void terminateChild(child).catch(() => undefined); };
        },
      });
      if (job.status === "cancelled") return;
      job.check = { checks };
      touchJob(job, { status: checks.every((check) => check.passed) ? "completed" : "failed", stage: "checks" });
    } catch (error) {
      if (job.status !== "cancelled") touchJob(job, { status: "failed", stage: "checks", error: error.message || String(error) });
    } finally {
      delete job.cancel;
    }
  }

  async function runCodex(job, root, mode, body, resumeThreadId = null) {
    const command = resolveCodexCommand(codexBin);
    if (!command) { touchJob(job, { status: "failed", stage: "worker", error: "The local Codex worker is not installed on this computer yet." }); return; }
    const prompt = mode === "understand"
      ? [
        "You are Platynum-47's local project understanding worker.",
        "Read the actual project files in the current directory. Do not edit, create, delete, install, commit, push, merge, publish, deploy, or change credentials.",
        "Return ONLY valid JSON with this shape: {\"understanding\":\"...\",\"recommendations\":[\"...\"],\"consensus\":\"...\",\"wildcard\":\"...\",\"acceptance\":[\"...\"],\"humanActions\":[\"...\"]}.",
        "Keep it plain-language and grounded in what you found. Make the first sentence the user's requested outcome.",
        `User request: ${body.idea}`,
      ].join("\n")
      : [
        "You are Platynum-47's local project implementation worker.",
        "Work only inside the current project folder. Implement the approved request in the real project, inspect the result, and run the safest relevant existing checks.",
        "Do not git commit, push, merge, publish, deploy, change credentials, or make unrelated changes. Do not ask the person to paste a key or run a command.",
        "Return ONLY valid JSON with this shape: {\"summary\":\"...\",\"changedFiles\":[\"...\"],\"checks\":[{\"name\":\"...\",\"command\":\"...\",\"passed\":true,\"output\":\"...\"}],\"remaining\":[\"...\"],\"diffStat\":\"\"}.",
        `Approved intent checkpoint: ${JSON.stringify(body.checkpoint || {})}`,
        `User request: ${body.idea}`,
      ].join("\n");
    touchJob(job, { status: "running", stage: mode === "understand" ? "inspecting" : "editing" });
    const args = resumeThreadId
      ? ["exec", "resume", resumeThreadId, "--json", "--sandbox", mode === "build" ? "workspace-write" : "read-only", "-C", root, "--skip-git-repo-check", prompt]
      : ["exec", "--json", "--sandbox", mode === "build" ? "workspace-write" : "read-only", "-C", root, "--skip-git-repo-check", prompt];
    await new Promise((resolve) => {
      const child = trackChild(spawnCommand(command, args, { cwd: root, env: { ...process.env, CODEX_HOME: codexHome, CODEX_QUIET_MODE: "1" }, stdio: ["ignore", "pipe", "pipe"] }));
      job.cancel = () => { void terminateChild(child).catch(() => undefined); };
      let output = "";
      let pending = "";
      let stderr = "";
      let lastMessage = "";
      let settled = false;
      const append = (current, chunk) => `${current}${String(chunk)}`.slice(-MAX_COMMAND_OUTPUT);
      const handleLine = (line) => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          const event = summarizeCodexEvent(parsed);
          if (event?.text) job.events.push(event);
          const type = String(parsed.type || parsed.event || parsed.item?.type || "");
          const message = extractAgentMessage(parsed);
          if (message && !["turn.completed", "completed", "done"].includes(type)) lastMessage = message;
          if (parsed.thread_id || parsed.threadId || parsed.session_id) job.threadId = parsed.thread_id || parsed.threadId || parsed.session_id;
          job.events = job.events.slice(-100);
          job.stage = type.includes("tool") ? "checking project" : (type.includes("message") ? "reviewing result" : job.stage);
          job.updatedAt = new Date().toISOString();
        } catch {
          // Codex may write a human-readable line alongside JSONL events.
          if (line.trim()) lastMessage = line.trim().slice(-MAX_COMMAND_OUTPUT);
        }
      };
      child.stdout?.on("data", (chunk) => {
        output = append(output, chunk);
        pending += String(chunk);
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || "";
        for (const line of lines) handleLine(line);
      });
      child.stderr?.on("data", (chunk) => {
        stderr = append(stderr, chunk);
        const text = String(chunk).trim();
        if (text) job.events.push({ type: "stderr", text: text.slice(0, 2000) });
      });
      const finish = async (code, error) => {
        if (settled) return;
        settled = true;
        if (pending.trim()) handleLine(pending);
        if (job.status !== "cancelled") {
          const changedFiles = mode === "build" ? await changedFilesFor(root) : [];
          if (mode === "understand") job.checkpoint = checkpointFromParsed(lastMessage || output.trim());
          else job.result = resultFromParsed(lastMessage || output.trim(), changedFiles, await projectChecks(root, fsApi, "test").catch(() => []));
          if (error) touchJob(job, { status: "failed", stage: "worker", error: error.message || String(error) });
          else if (code === 0) touchJob(job, { status: "completed", stage: mode === "understand" ? "checkpoint ready" : "complete" });
          else touchJob(job, { status: "failed", stage: "worker", error: stderr.trim() || `Codex exited with code ${code ?? "unknown"}.` });
        } else touchJob(job, { stage: "cancelled" });
        delete job.cancel;
        resolve();
      };
      child.once("error", (error) => { void finish(1, error); });
      child.once("close", (code) => { void finish(code, null); });
    });
  }
  return router;
}

async function projectChecks(root, fsApi = fs, kind = "test", options = {}) {
  const manifest = await readPackageManifest(root, fsApi);
  const scripts = manifest?.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {};
  const requested = String(kind || "test").toLowerCase();
  const script = requested === "build"
    ? (scripts.build ? "build" : null)
    : requested === "lint"
      ? (scripts.lint ? "lint" : null)
      : requested === "typecheck" || requested === "types"
        ? (scripts.typecheck ? "typecheck" : (scripts.types ? "types" : null))
        : (scripts.test ? "test" : (scripts.check ? "check" : null));
  const checks = [];
  if (script) {
    const npm = resolveNpmInvocation();
    if (!npm) {
      checks.push({
        name: `npm run ${script}`,
        command: `npm run ${script}`,
        passed: false,
        output: "Platynum's project runner is unavailable.",
        durationMs: 0,
        ok: false,
      });
      return checks;
    }
    const started = Date.now();
    const result = await runCommand(npm.command, [...npm.args, "run", script], { cwd: root, env: { ...npm.environment, CI: "1" }, timeoutMs: COMMAND_TIMEOUT_MS, onSpawn: options.onSpawn });
    const output = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim().slice(-MAX_COMMAND_OUTPUT);
    checks.push({ name: `npm run ${script}`, command: `${npm.label} run ${script}`, passed: result.code === 0 && !result.timedOut, output, durationMs: Date.now() - started, ok: result.code === 0 && !result.timedOut });
    return checks;
  }
  const files = ["package.json", "index.html", "README.md"];
  for (const file of files) {
    try {
      const stat = await fsApi.stat(path.join(root, file));
      if (stat.isFile()) checks.push({ name: file, command: "file exists", passed: true, output: "Found.", durationMs: 0, ok: true });
    } catch { /* optional project files are not failures by themselves */ }
  }
  if (!checks.length) checks.push({ name: "Project files", command: "file scan", passed: false, output: "No readable project entry files were found.", durationMs: 0, ok: false });
  return checks;
}

function publicJob(job) {
  return {
    id: job.id,
    jobId: job.id,
    kind: job.kind || job.mode,
    mode: job.mode,
    status: job.status,
    stage: job.stage || job.status,
    events: (job.events || []).slice(-50).map((event) => typeof event === "string" ? event : event.text || ""),
    checkpoint: job.checkpoint || null,
    result: job.result || null,
    check: job.check || null,
    error: job.error || null,
    project: job.project,
    threadId: job.threadId || null,
    resumedFrom: job.resumedFrom || null,
    resumeAvailable: Boolean(job.root && job.request && ["failed", "cancelled"].includes(job.status)),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
  };
}

export { discoverProjects, projectChecks, readAuth, resolveNpmInvocation, tree };
export default createRuntimeRouter;
