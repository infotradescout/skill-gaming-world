// Platynum-47 server: serves the built app and provides the one-click OAuth broker.
//
// This is the thin backend the non-developer gate requires — connectors are one-click
// ("Connect GitHub" → authorize → done), never "paste a token". It is dependency-light
// (a single small dependency: express) and deploys as one web service on Render, a Node
// host, or Vercel. Self-hosting Platynum-47 gives you the broker automatically.
//
// Human-layer activation (one-time, only you can do it):
//   1. Register a GitHub OAuth App (Settings → Developer settings → OAuth Apps).
//      Authorization callback URL: <APP_URL>/api/github/oauth/callback
//   2. Set env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL (your deployed origin).
// After that, "Connect GitHub" is one click for every user, forever. No tokens, no scopes.

import express from "express";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import createRuntimeRouter from "./runtime-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json({ limit: "1mb" }));
const PORT = process.env.PORT || 5173;
// The local runtime is deliberately loopback-only. Hosted services expose a
// truthful disabled status until a separately authenticated controller exists.
const LOCAL_RUNTIME_ENABLED =
  process.env.P47_LOCAL_RUNTIME === "1" || (process.env.P47_LOCAL_RUNTIME !== "0" && !process.env.RENDER && process.env.NODE_ENV !== "production");
// A local runtime never inherits an externally supplied public origin. Its
// browser, cookie, and API boundary are deliberately tied to this loopback
// origin for the lifetime of one launcher process.
const LOCAL_RUNTIME_ORIGIN = `http://127.0.0.1:${PORT}`;
const APP_URL = LOCAL_RUNTIME_ENABLED
  ? LOCAL_RUNTIME_ORIGIN
  : (process.env.APP_URL || `http://localhost:${PORT}`);
const LOCAL_RUNTIME_TOKEN = LOCAL_RUNTIME_ENABLED ? crypto.randomBytes(32).toString("base64url") : "";
const LOCAL_RUNTIME_TOKEN_COOKIE = "p47_runtime";
const LOCAL_RUNTIME_ROOTS = (process.env.P47_PROJECT_ROOTS || "")
  .split(path.delimiter)
  .map((item) => item.trim())
  .filter(Boolean);
const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

// Model access: the host sets one key so the user never pastes one (the non-developer path).
// Constraint reconciliation done up front: "non-developer" + "BYO model" conflict, so the
// server proxies model calls with the host key. Human-layer activation: set MODEL_API_KEY once.
const MODEL_API_KEY = process.env.MODEL_API_KEY || "";
const MODEL_ID = process.env.MODEL_ID || "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

// SI is the build engine. Platynum is a thin gateway: it forwards the idea and the user's
// key to SI's build_engine.py and returns SI's output. It does NOT run its own planner/builder.
// Paths come from env, never hard-coded. SI owns prompts, sessions, humanActions, and the build.
const SI_ENGINE = process.env.SI_ENGINE || ""; // absolute path to SI's scripts/build_engine.py
const SI_PYTHON = process.env.SI_PYTHON || "python";
const SI_WORKSPACE = process.env.SI_WORKSPACE || path.join(os.tmpdir(), "platynum-si-workspace");

function siHttpStatus(code) {
  switch (code) {
    case "provider_unconfigured":
      return 503;
    case "invalid_session":
      return 410;
    case "bad_input":
      return 400;
    case "approve_failed":
    case "interrupt_failed":
      return 409;
    case "si_unreachable":
      return 503;
    default:
      return 502;
  }
}

/** Build a plain-language checkpoint card when SI returns structured session fields. */
function siCheckpointText(data) {
  if (typeof data?.checkpoint === "string" && data.checkpoint.trim()) return data.checkpoint;
  const intent = data?.activeIntent || {};
  const summary =
    data?.currentCheckpoint?.intent_summary ||
    intent.product_intent ||
    data?.objective ||
    "SI has a direction ready for your review.";
  const lines = [String(summary).trim(), "", "1. Confirm this understanding before anything is built."];
  const actions = Array.isArray(data?.humanActions) ? data.humanActions : [];
  if (actions.length) {
    lines.push("", "What I need from you");
    for (const action of actions) lines.push(`- ${action}`);
  }
  return lines.join("\n");
}

function siCheckpointId(data) {
  return (
    data?.currentCheckpoint?.checkpoint_id ||
    data?.newCheckpoint?.checkpoint_id ||
    data?.authorizedCheckpointId ||
    data?.authorizedCheckpoint?.checkpoint_id ||
    ""
  );
}

function siIntentHash(data) {
  return (
    data?.currentCheckpoint?.intent_hash ||
    data?.newCheckpoint?.intent_hash ||
    data?.authorizedIntentHash ||
    data?.authorizedCheckpoint?.intent_hash ||
    data?.newIntentHash ||
    ""
  );
}

// Call the SI engine as a subprocess. The user's model key is passed via env (never stored).
function runSiEngine(subcommand, extraArgs, apiKey) {
  return new Promise((resolve) => {
    if (!SI_ENGINE) {
      return resolve({ ok: false, code: "si_unreachable", error: "SI engine is not configured (set SI_ENGINE)." });
    }
    const env = { ...process.env, ANTHROPIC_API_KEY: apiKey || "", SI_MODEL: MODEL_ID };
    execFile(
      SI_PYTHON,
      [SI_ENGINE, subcommand, ...extraArgs],
      { env, timeout: 200000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        let data = null;
        try {
          data = JSON.parse(String(stdout).trim());
        } catch {
          data = null;
        }
        if (data && !data.error) return resolve({ ok: true, data });
        resolve({
          ok: false,
          code: (data && data.code) || "si_error",
          error: (data && data.error) || (err ? `SI engine error: ${err.message}` : "SI engine returned no result."),
        });
      },
    );
  });
}
const SESSION_TTL_MS = 10 * 60 * 1000;
const PAIRING_TTL_MS = 60 * 60 * 1000;
const DEPLOY_WEBHOOK_URL = process.env.DEPLOY_WEBHOOK_URL || "";
const DEPLOY_PROVIDER = process.env.DEPLOY_PROVIDER || "Deployment platform";
const DEPLOY_APP_URL = process.env.DEPLOY_APP_URL || "";
const DEPLOY_VERIFY_PATH = process.env.DEPLOY_VERIFY_PATH || "/";
const DEPLOY_WEBHOOK_SECRET_HEADER = process.env.DEPLOY_WEBHOOK_SECRET_HEADER || "x-deploy-secret";
const DEPLOY_WEBHOOK_SECRET = process.env.DEPLOY_WEBHOOK_SECRET || "";

const runtimeRouter = createRuntimeRouter({
  roots: LOCAL_RUNTIME_ROOTS.length ? LOCAL_RUNTIME_ROOTS : undefined,
  codexBin: process.env.P47_CODEX_BIN || undefined,
  codexHome: process.env.CODEX_HOME || undefined,
  recordDir: process.env.P47_RUNTIME_RECORD_DIR || undefined,
  enabled: LOCAL_RUNTIME_ENABLED,
  accessToken: LOCAL_RUNTIME_TOKEN,
  accessCookieName: LOCAL_RUNTIME_TOKEN_COOKIE,
  expectedHost: "127.0.0.1",
});

const CHECKPOINT_SYSTEM = `You are Platynum-47's build planner.
You receive one business idea and return a short, simple plan the person can follow.

Output format is strict:
1) One plain sentence: what you are building.
2) A numbered list "1, 2, 3…" of what I will build and what the person gets.
3) A short "What I need from you" section listing only real actions for the person to do.

No headers like technical breakdowns. No jargon (no "API", "repo", "token", "deploy")
unless expressed in plain words. No raw JSON or internal reasoning.
Keep it short and practical.`;

const BUILD_SYSTEM = `You are Platynum-47's execution worker.
Convert the checkpoint into three concrete files that run together in a browser.
Return ONLY valid JSON with this exact shape:
{
  "files": {
    "index.html": "...",
    "style.css": "...",
    "script.js": "..."
  },
  "humanActions": ["..."],
  "note": "..."
}

Rules:
- Keep the app focused, minimal, and mobile-friendly.
- Use plain HTML/CSS/JS only in these three files.
- If something is missing, fill it with a reasonable default, but do not invent external dependencies.
- Keep text short and readable.
- Return strict JSON only, no markdown.`;

const checkpointSessions = new Map();
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
const pairingSessions = new Map();
const PAIRING_CLEANUP_INTERVAL_MS = 60 * 1000;
const latestDeployment = {
  status: "never_started",
  provider: DEPLOY_PROVIDER,
  triggeredAt: null,
  runId: null,
  lastRequestError: null,
  lastVerify: null,
};

function makeSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function makePairCode() {
  const raw = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of checkpointSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      checkpointSessions.delete(id);
    }
  }
}

function cleanupPairingSessions() {
  const now = Date.now();
  for (const [code, session] of pairingSessions.entries()) {
    if (now - session.lastSeen > PAIRING_TTL_MS) {
      pairingSessions.delete(code);
    }
  }
}

function absoluteVerifyUrl() {
  if (!DEPLOY_APP_URL) return null;
  const trimmedUrl = String(DEPLOY_APP_URL).trim();
  const trimmedPath = String(DEPLOY_VERIFY_PATH).trim() || "/";
  return new URL(trimmedPath, trimmedUrl.endsWith("/") ? trimmedUrl : `${trimmedPath.startsWith("/") ? trimmedUrl : `${trimmedUrl}/`}`).toString();
}

function deploymentSummary() {
  return {
    status: latestDeployment.status,
    provider: latestDeployment.provider,
    triggeredAt: latestDeployment.triggeredAt,
    runId: latestDeployment.runId,
    lastRequestError: latestDeployment.lastRequestError,
    lastVerify: latestDeployment.lastVerify,
    webhookConfigured: Boolean(DEPLOY_WEBHOOK_URL),
    appUrl: DEPLOY_APP_URL || null,
    verifyUrl: absoluteVerifyUrl(),
  };
}

const sessionCleanupTimer = setInterval(cleanupSessions, SESSION_CLEANUP_INTERVAL_MS);
const pairingCleanupTimer = setInterval(cleanupPairingSessions, PAIRING_CLEANUP_INTERVAL_MS);
// Importing this module from the desktop shell must not keep a process alive
// before the actual local server starts.
sessionCleanupTimer.unref?.();
pairingCleanupTimer.unref?.();

async function runDeployWebhook(payload = {}) {
  if (!DEPLOY_WEBHOOK_URL) {
    const error = "Deploy webhook is not configured.";
    latestDeployment.status = "not_configured";
    latestDeployment.lastRequestError = error;
    throw new Error(error);
  }
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (DEPLOY_WEBHOOK_SECRET) {
    headers[DEPLOY_WEBHOOK_SECRET_HEADER] = DEPLOY_WEBHOOK_SECRET;
  }
  const res = await fetch(DEPLOY_WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: "platynum-47",
      triggeredAt: new Date().toISOString(),
      provider: DEPLOY_PROVIDER,
      ...payload,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`deploy webhook returned ${res.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
  }
  let response = null;
  try {
    response = await res.json();
  } catch {
    response = null;
  }
  latestDeployment.status = "triggered";
  latestDeployment.lastRequestError = null;
  return response;
}

function withTimeout(ms, input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms).unref();
  return { signal: controller.signal, cancel: () => clearTimeout(timer), input };
}

async function verifyDeployment() {
  const verifyUrl = absoluteVerifyUrl();
  if (!verifyUrl) {
    latestDeployment.lastVerify = {
      checkedAt: new Date().toISOString(),
      reachable: false,
      reason: "DEPLOY_APP_URL is not configured.",
    };
    latestDeployment.status = "not_configured";
    return latestDeployment.lastVerify;
  }
  const started = Date.now();
  const timeout = withTimeout(7000);
  try {
    const res = await fetch(verifyUrl, { method: "GET", signal: timeout.signal, redirect: "manual" });
    const body = await res.text().catch(() => "");
    const result = {
      checkedAt: new Date().toISOString(),
      reachable: res.ok,
      httpStatus: res.status,
      elapsedMs: Date.now() - started,
      url: verifyUrl,
      bodyPrefix: body.slice(0, 220),
    };
    latestDeployment.lastVerify = result;
    latestDeployment.status = res.ok ? "verified" : "failed";
    latestDeployment.lastRequestError = res.ok ? null : `Deployment responded with ${res.status}`;
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const result = {
      checkedAt: new Date().toISOString(),
      reachable: false,
      reason,
      elapsedMs: Date.now() - started,
      url: verifyUrl,
    };
    latestDeployment.lastVerify = result;
    latestDeployment.status = "failed";
    latestDeployment.lastRequestError = reason;
    return result;
  } finally {
    timeout.cancel();
  }
}

function nowIso() {
  return new Date().toISOString();
}

function ensureFallbackBuildFiles(files) {
  return {
    "index.html": typeof files?.["index.html"] === "string" ? files["index.html"] : "<h1>Platynum-47 build</h1>\n<p>Start with a simple page and build from your prompt.</p>",
    "style.css": typeof files?.["style.css"] === "string" ? files["style.css"] : "body { font-family: system-ui, sans-serif; padding: 1rem; }",
    "script.js": typeof files?.["script.js"] === "string" ? files["script.js"] : "",
  };
}

function parseJsonPayload(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const chunk = trimmed.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(chunk);
  } catch {
    return null;
  }
}

function normalizePairRole(role) {
  return role === "runner" ? "runner" : "controller";
}

function makePairSession() {
  return {
    pairCode: "",
    createdAt: Date.now(),
    lastSeen: Date.now(),
    controller: { deviceId: null, connected: false },
    runner: { deviceId: null, connected: false },
    workspace: {},
    preview: "",
  };
}

function pairSessionPublic(session, role) {
  return {
    pairCode: session.pairCode,
    role,
    paired: Boolean(session.controller.connected && session.runner.connected),
    controllerConnected: session.controller.connected,
    runnerConnected: session.runner.connected,
  };
}

function pairError(message, code = 400) {
  return { status: code, body: { error: message } };
}

function safePairWorkspace(payload) {
  if (!payload || typeof payload !== "object") return {};
  const files = {};
  for (const [name, value] of Object.entries(payload)) {
    if (name !== "index.html" && name !== "style.css" && name !== "script.js") continue;
    if (typeof value === "string") {
      files[name] = value;
    }
  }
  return files;
}

function extractCheckpointActions(checkpointText) {
  const lines = String(checkpointText || "").split(/\r?\n/);
  const actionsHeader = lines.findIndex((line) => /what i need from you/i.test(line));
  if (actionsHeader === -1) return [];
  return lines
    .slice(actionsHeader + 1)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("nothing"));
}

// (Platynum no longer calls a model directly — SI's build_engine owns that. The old
// CHECKPOINT_SYSTEM/BUILD_SYSTEM/session helpers above are inert and slated for cleanup.)

// The Windows runtime is Codex/ChatGPT-sign-in only. Do not let a stale client
// key or a legacy demo panel reach the hosted SI/model proxy on this path.
if (LOCAL_RUNTIME_ENABLED) {
  app.use("/api/model", (_req, res) => {
    res.status(410).json({ error: "The local Codex workspace does not use the hosted model path." });
  });
} else {
// Is model access configured on this deployment?
app.get("/api/model/status", (_req, res) => {
  res.json({ configured: Boolean(MODEL_API_KEY), model: MODEL_API_KEY ? MODEL_ID : null });
});

// One prompt in, a locked checkpoint out — no code, no key for the user.
app.post("/api/model/checkpoint", async (req, res) => {
  const apiKey = String(req.headers["x-user-model-key"] || MODEL_API_KEY || "").trim();
  const idea = String((req.body && req.body.idea) || "").trim();
  if (!idea) return res.status(400).json({ error: "Describe what you want to build." });
  // SI owns the plan, the session, and humanActions. Platynum just forwards.
  const result = await runSiEngine(
    "plan",
    ["--idea", idea, "--workspace", SI_WORKSPACE],
    apiKey,
  );
  if (!result.ok) return res.status(siHttpStatus(result.code)).json({ error: result.error, code: result.code });
  res.json({
    sessionId: result.data.sessionId,
    checkpoint: siCheckpointText(result.data),
    humanActions: Array.isArray(result.data.humanActions) ? result.data.humanActions : [],
    model: result.data.model ?? MODEL_ID,
    siCheckpointId: siCheckpointId(result.data),
    siIntentHash: siIntentHash(result.data),
    executionLocked: Boolean(result.data.executionLocked),
    generationAuthority: result.data.authorizedCheckpointId
      ? true
      : Boolean(result.data.currentCheckpoint?.generation_authority),
    claimScope: "si_session_state",
  });
});

// Turn a locked checkpoint into concrete app files.
app.post("/api/model/build", async (req, res) => {
  const apiKey = String(req.headers["x-user-model-key"] || MODEL_API_KEY || "").trim();
  const sessionId = String((req.body && req.body.sessionId) || "").trim();
  if (!sessionId) return res.status(400).json({ error: "Missing build session id." });
  // SI owns the build, using the same authoritative session it created during plan.
  const result = await runSiEngine("build", ["--session", sessionId], apiKey);
  if (!result.ok) return res.status(siHttpStatus(result.code)).json({ error: result.error, code: result.code });
  res.json({
    files: result.data.files || {},
    humanActions: Array.isArray(result.data.humanActions) ? result.data.humanActions : [],
    note: typeof result.data.note === "string" ? result.data.note : "Build complete.",
    model: result.data.model ?? MODEL_ID,
    sessionId,
  });
});

/**
 * 👎 → SI interrupt (session-state transaction).
 * Invokes SI `interrupt`; does not by itself prove external model/tool/worker stop.
 */
app.post("/api/model/interrupt", async (req, res) => {
  const apiKey = String(req.headers["x-user-model-key"] || MODEL_API_KEY || "").trim();
  const sessionId = String((req.body && req.body.sessionId) || "").trim();
  const correction = String((req.body && req.body.correction) || "").trim();
  const checkpointId = String((req.body && req.body.checkpointId) || "").trim();
  if (!sessionId) return res.status(400).json({ error: "Missing session id.", code: "bad_input" });
  if (!correction) return res.status(400).json({ error: "Correction text is required.", code: "bad_input" });
  const args = ["--session", sessionId, "--correction", correction];
  if (checkpointId) args.push("--checkpoint", checkpointId);
  const result = await runSiEngine("interrupt", args, apiKey);
  if (!result.ok) return res.status(siHttpStatus(result.code)).json({ error: result.error, code: result.code });
  res.json({
    sessionId: result.data.sessionId || sessionId,
    interruptedCheckpointId: result.data.interruptedCheckpointId || null,
    newCheckpoint: result.data.newCheckpoint || null,
    siCheckpointId: siCheckpointId(result.data),
    siIntentHash: siIntentHash(result.data),
    operation: result.data.operation || null,
    cancelledTaskIds: result.data.cancelledTaskIds || [],
    cancelRequestedTaskIds: result.data.cancelRequestedTaskIds || [],
    taintedEffectIds: result.data.taintedEffectIds || [],
    removed: result.data.removed || {},
    retained: result.data.retained || {},
    changed: result.data.changed || {},
    resumeRequiresApproval: true,
    mutationFrozen: Boolean(result.data.mutationFrozen ?? true),
    generationAuthority: false,
    executionLocked: Boolean(result.data.executionLocked ?? true),
    claimScope: "si_session_state",
    note: "SI session-state interrupt invoked. External model/tool/worker stop is not proven by this call alone.",
  });
});

/**
 * Continue/Approve → SI approve for current checkpoint id + intent hash.
 * Stale ids/hashes fail closed; SI errors are surfaced (not silently approved).
 */
app.post("/api/model/approve", async (req, res) => {
  const apiKey = String(req.headers["x-user-model-key"] || MODEL_API_KEY || "").trim();
  const sessionId = String((req.body && req.body.sessionId) || "").trim();
  const checkpointId = String((req.body && req.body.checkpointId) || "").trim();
  const intentHash = String((req.body && req.body.intentHash) || "").trim();
  if (!sessionId) return res.status(400).json({ error: "Missing session id.", code: "bad_input" });
  const args = ["--session", sessionId];
  if (checkpointId) args.push("--checkpoint", checkpointId);
  if (intentHash) args.push("--intent-hash", intentHash);
  const result = await runSiEngine("approve", args, apiKey);
  if (!result.ok) {
    // Fail closed on stale checkpoint / hash. Only treat true "already approved"
    // of the *current* checkpoint as a cleared gate — never silently approve stale ids.
    const msg = String(result.error || "");
    const isStale =
      /stale checkpoint/i.test(msg) ||
      /stale authorized_intent_hash/i.test(msg) ||
      /only currentCheckpointId/i.test(msg);
    if (isStale) {
      return res.status(siHttpStatus("approve_failed")).json({ error: result.error, code: "approve_failed" });
    }
    if (/cannot be approved from status approved/i.test(msg) && checkpointId) {
      return res.json({
        sessionId,
        siCheckpointId: checkpointId || "",
        siIntentHash: intentHash || "",
        executionLocked: false,
        generationAuthority: true,
        alreadyApproved: true,
        claimScope: "si_session_state",
      });
    }
    return res.status(siHttpStatus(result.code)).json({ error: result.error, code: result.code });
  }
  res.json({
    sessionId: result.data.sessionId || sessionId,
    siCheckpointId: siCheckpointId(result.data) || checkpointId,
    siIntentHash: siIntentHash(result.data) || intentHash,
    executionLocked: Boolean(result.data.executionLocked),
    generationAuthority: !result.data.executionLocked,
    mutationFrozen: Boolean(result.data.mutationFrozen),
    authorizedCheckpointId: result.data.authorizedCheckpointId || null,
    claimScope: "si_session_state",
  });
});
}

// Pairing state for T4: one controller and one runner in one session.
app.post("/api/pair/create", (req, res) => {
  cleanupPairingSessions();
  let code = makePairCode();
  let attempts = 0;
  while (pairingSessions.has(code) && attempts < 8) {
    code = makePairCode();
    attempts += 1;
  }
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const session = makePairSession();
  session.pairCode = code;
  session.controller = { deviceId, connected: true, lastSeen: Date.now() };
  session.lastSeen = Date.now();
  pairingSessions.set(code, session);
  res.json(pairSessionPublic(session, "controller"));
});

app.post("/api/pair/join", (req, res) => {
  const pairCode = String((req.body && req.body.pairCode) || "").trim().toUpperCase();
  if (!pairCode) return res.status(400).json({ error: "Missing pair code." });
  const session = pairingSessions.get(pairCode);
  if (!session) return res.status(404).json({ error: "No pair session found for that code." });
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const role = "runner";
  if (session.runner.connected && session.runner.deviceId !== deviceId) {
    return res.status(409).json({ error: "This pairing code already has a runner." });
  }
  session.runner = { deviceId, connected: true, lastSeen: Date.now() };
  session.lastSeen = Date.now();
  res.json(pairSessionPublic(session, role));
});

app.post("/api/pair/leave", (req, res) => {
  const pairCode = String((req.body && req.body.pairCode) || "").trim().toUpperCase();
  const role = normalizePairRole(String((req.body && req.body.role) || ""));
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  if (!pairCode) return res.status(400).json({ error: "Missing pair code." });
  const session = pairingSessions.get(pairCode);
  if (!session) return res.status(200).json({ ok: true });

  if (role === "runner" && session.runner.deviceId === deviceId) {
    session.runner = { deviceId: null, connected: false };
  }
  if (role === "controller" && session.controller.deviceId === deviceId) {
    session.controller = { deviceId: null, connected: false };
  }
  session.lastSeen = Date.now();
  if (!session.controller.connected && !session.runner.connected) {
    pairingSessions.delete(pairCode);
    return res.json({ ok: true, ended: true });
  }
  res.json({ ok: true });
});

app.post("/api/pair/heartbeat", (req, res) => {
  const pairCode = String((req.body && req.body.pairCode) || "").trim().toUpperCase();
  const role = normalizePairRole(String((req.body && req.body.role) || ""));
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  if (!pairCode) return res.status(400).json({ error: "Missing pair code." });
  const session = pairingSessions.get(pairCode);
  if (!session) return res.status(404).json({ error: "No pair session found." });
  if (role === "runner" && session.runner.deviceId === deviceId) session.runner.lastSeen = Date.now();
  if (role === "controller" && session.controller.deviceId === deviceId) session.controller.lastSeen = Date.now();
  session.lastSeen = Date.now();
  res.json({ ok: true });
});

app.get("/api/pair/status/:pairCode", (req, res) => {
  const pairCode = String(req.params.pairCode || "").trim().toUpperCase();
  const role = normalizePairRole(String(req.query.role || ""));
  const session = pairingSessions.get(pairCode);
  if (!session) return res.status(404).json({ error: "No pair session found." });
  res.json(pairSessionPublic(session, role));
});

app.post("/api/pair/workspace", (req, res) => {
  const pairCode = String((req.body && req.body.pairCode) || "").trim().toUpperCase();
  const role = normalizePairRole(String((req.body && req.body.role) || ""));
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const workspace = safePairWorkspace(req.body && req.body.workspace);
  if (!pairCode) return res.status(400).json({ error: "Missing pair code." });
  const session = pairingSessions.get(pairCode);
  if (!session) return res.status(404).json({ error: "No pair session found." });
  if (role === "controller" && session.controller.deviceId === deviceId) {
    session.workspace = workspace;
    session.lastSeen = Date.now();
    session.controller.lastSeen = Date.now();
    return res.json({ ok: true });
  }
  res.status(403).json({ error: "Only the active controller may push workspace." });
});

app.get("/api/pair/workspace/:pairCode", (req, res) => {
  const pairCode = String(req.params.pairCode || "").trim().toUpperCase();
  const role = normalizePairRole(String(req.query.role || ""));
  const session = pairingSessions.get(pairCode);
  if (!session) return res.status(404).json({ error: "No pair session found." });
  if (role === "runner" && !session.controller.connected) {
    return res.status(409).json({ error: "No active controller." });
  }
  session.lastSeen = Date.now();
  return res.json({ role, workspace: session.workspace || {} });
});

app.post("/api/pair/preview", (req, res) => {
  const pairCode = String((req.body && req.body.pairCode) || "").trim().toUpperCase();
  const role = normalizePairRole(String((req.body && req.body.role) || ""));
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const preview = String((req.body && req.body.preview) || "");
  if (!pairCode) return res.status(400).json({ error: "Missing pair code." });
  const session = pairingSessions.get(pairCode);
  if (!session) return res.status(404).json({ error: "No pair session found." });
  if (role === "runner" && session.runner.deviceId === deviceId) {
    session.preview = preview;
    session.runner.lastSeen = Date.now();
    session.lastSeen = Date.now();
    return res.json({ ok: true });
  }
  res.status(403).json({ error: "Only the active runner may publish preview." });
});

app.get("/api/pair/preview/:pairCode", (req, res) => {
  const pairCode = String(req.params.pairCode || "").trim().toUpperCase();
  const session = pairingSessions.get(pairCode);
  if (!session) return res.status(404).json({ error: "No pair session found." });
  res.json({ preview: session.preview || "", role: "controller" });
});

// Short-lived CSRF state store (in-memory; fine for a single-instance self-host).
const pendingStates = new Map();
function cleanupStates() {
  const now = Date.now();
  for (const [state, ts] of pendingStates) if (now - ts > 10 * 60 * 1000) pendingStates.delete(state);
}

// Whether the broker is configured. The client asks this so it can show one-click
// connect when ready, or an honest "not configured" message instead of a token wall.
app.get("/api/github/oauth/status", (_req, res) => {
  res.json({ configured: Boolean(CLIENT_ID && CLIENT_SECRET) });
});

// Step 1: send the user to GitHub to authorize. One click.
app.get("/api/github/oauth/start", (_req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(503).send("GitHub connect is not configured on this deployment.");
  }
  cleanupStates();
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now());
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", `${APP_URL}/api/github/oauth/callback`);
  url.searchParams.set("scope", "repo");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

// Step 2: GitHub redirects back with a code; exchange it for a token server-side,
// then hand the token to the app via the URL fragment (never a query string, so it
// is not logged), where it is held on the device.
app.get("/api/github/oauth/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!state || !pendingStates.has(String(state))) {
    return res.status(400).send("Invalid or expired authorization state.");
  }
  pendingStates.delete(String(state));
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: `${APP_URL}/api/github/oauth/callback`,
      }),
    });
    const data = await tokenRes.json();
    if (!data.access_token) {
      return res.status(502).send("GitHub did not return an access token.");
    }
    // Pass the token to the SPA in the fragment; the client stores it on-device and cleans the URL.
    res.redirect(`${APP_URL}/#gh_token=${encodeURIComponent(data.access_token)}`);
  } catch {
    res.status(502).send("Token exchange failed.");
  }
});

// Local-first repository/runtime adapter. It is mounted only as a loopback
// capability; Render and other hosted services receive an honest disabled
// response instead of an accidental arbitrary-command surface.
if (LOCAL_RUNTIME_ENABLED) {
  // The page load receives a fresh, HttpOnly, same-site capability. The token
  // is never exposed to JavaScript; every runtime request must carry it.
  app.use((req, res, next) => {
    if (
      req.method === "GET" &&
      !req.path.startsWith("/api/") &&
      req.hostname === "127.0.0.1" &&
      req.accepts("html") === "html"
    ) {
      res.cookie(LOCAL_RUNTIME_TOKEN_COOKIE, LOCAL_RUNTIME_TOKEN, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/api/runtime",
        maxAge: 12 * 60 * 60 * 1000,
      });
    }
    next();
  });
  app.use("/api/runtime", runtimeRouter);
} else {
  app.get("/api/runtime/status", (_req, res) => {
    res.json({
      enabled: false,
      host: "hosted",
      codex: { installed: false, signedIn: false, command: null },
      projects: [],
      message: "The local project runtime is available from the Windows launcher.",
    });
  });
}

// Serve the built SPA and let client routing handle the rest.
// (Express 5: "*" alone is invalid; use a named wildcard.)
const dist = path.join(__dirname, "dist");
app.use(express.static(dist));
app.get("/*splat", (_req, res) => res.sendFile(path.join(dist, "index.html")));

const LISTEN_HOST = LOCAL_RUNTIME_ENABLED ? "127.0.0.1" : "0.0.0.0";
let activeServer = null;

/** Start the one local Platynum runtime without opening a browser or shell window. */
export function startPlatynumServer({ port = PORT, host = LISTEN_HOST } = {}) {
  if (activeServer) return Promise.resolve(activeServer);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      activeServer = server;
      console.log(`Platynum-47 on ${APP_URL}  (GitHub connect ${CLIENT_ID && CLIENT_SECRET ? "configured" : "NOT configured"})`);
      resolve(server);
    });
    server.once("error", reject);
  });
}

/** Allow only Electron's native chooser to add one user-selected local project. */
export async function allowRuntimeProjectRoot(root) {
  if (!LOCAL_RUNTIME_ENABLED || typeof runtimeRouter.addProjectRoot !== "function") {
    throw new Error("The local project chooser is unavailable in this runtime.");
  }
  return runtimeRouter.addProjectRoot(root);
}

/** Close local previews and worker children before the desktop app exits. */
export async function stopPlatynumServer() {
  const server = activeServer;
  activeServer = null;
  await runtimeRouter.dispose?.();
  if (!server) return;
  await new Promise((resolve) => server.close(() => resolve()));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startPlatynumServer().catch((error) => {
    console.error("Platynum-47 could not start.", error);
    process.exitCode = 1;
  });
}
