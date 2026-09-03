import { describe, expect, it, afterEach, vi } from "vitest";
import express from "express";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRuntimeRouter, isPathContained, sanitizeRelativePath, summarizeCodexEvent, parseCheckpoint, projectId, resolveNpmInvocation, terminateChild } from "./runtime-server.js";

const tempDirs = [];
afterEach(async () => { while (tempDirs.length) await fs.rm(tempDirs.pop(), { recursive: true, force: true }); });

function rawStatus(url, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { headers }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    request.once("error", reject);
    request.end();
  });
}

describe("runtime-server helpers", () => {
  it("contains paths and rejects traversal or git paths", () => {
    expect(isPathContained("/tmp/project", "/tmp/project/src/a.js")).toBe(true);
    expect(isPathContained("/tmp/project", "/tmp/project-other/a.js")).toBe(false);
    expect(sanitizeRelativePath("src\\main.js")).toBe("src/main.js");
    expect(() => sanitizeRelativePath("../secret")).toThrow();
    expect(() => sanitizeRelativePath(".git/config")).toThrow();
  });

  it("parses checkpoint JSON and summarizes event lines", () => {
    expect(parseCheckpoint('{"checkpoint":"ready"}')).toEqual({ checkpoint: "ready" });
    expect(parseCheckpoint("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
    expect(parseCheckpoint("plain checkpoint")).toEqual({ text: "plain checkpoint" });
    expect(summarizeCodexEvent({ type: "message", text: "hello" })).toEqual({ type: "message", text: "hello" });
    expect(summarizeCodexEvent({ type: "turn.completed" })).toEqual({ type: "completed", text: "Codex finished." });
  });

  it("uses Platynum's bundled project runner when the desktop shell provides it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "p47-runtime-runner-")); tempDirs.push(root);
    const npmCli = path.join(root, "npm-cli.js");
    const runtimeNode = path.join(root, "Platynum-47.exe");
    await Promise.all([fs.writeFile(npmCli, "// runner\n"), fs.writeFile(runtimeNode, "runner\n")]);
    const previous = Object.fromEntries(["P47_DESKTOP_RUNTIME", "P47_NPM_CLI", "P47_NODE_BIN", "P47_RUNTIME_NODE_DIR", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS"].map((key) => [key, process.env[key]]));
    try {
      process.env.P47_NPM_CLI = npmCli;
      process.env.P47_NODE_BIN = runtimeNode;
      process.env.P47_RUNTIME_NODE_DIR = root;
      process.env.P47_DESKTOP_RUNTIME = "1";
      process.env.NODE_OPTIONS = "--inspect";
      process.env.NODE_EXTRA_CA_CERTS = "untrusted.pem";
      expect(resolveNpmInvocation()).toMatchObject({ command: runtimeNode, args: [npmCli], label: "Platynum's built-in project runner" });
      expect(resolveNpmInvocation().environment).toMatchObject({ ELECTRON_RUN_AS_NODE: "1", P47_ELECTRON_EXECUTABLE: runtimeNode });
      expect(resolveNpmInvocation().environment.NODE_OPTIONS).toBeUndefined();
      expect(resolveNpmInvocation().environment.NODE_EXTRA_CA_CERTS).toBeUndefined();
      expect(process.env.NODE_OPTIONS).toBe("--inspect");
      process.env.P47_NPM_CLI = path.join(root, "missing-npm-cli.js");
      expect(resolveNpmInvocation()).toBeNull();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("uses Windows taskkill for the whole preview or check process tree", async () => {
    const taskkill = vi.fn((_command, _args, _options, callback) => callback(null));
    const child = { pid: 4242, exitCode: null, once: vi.fn() };
    await terminateChild(child, { platform: "win32", execFileApi: taskkill, waitForExit: false });
    expect(taskkill).toHaveBeenCalledWith("taskkill", ["/pid", "4242", "/T", "/F"], { windowsHide: true }, expect.any(Function));
  });

  it("does not issue duplicate Windows taskkill calls and reports a denied stop", async () => {
    let callback;
    const taskkill = vi.fn((_command, _args, _options, done) => { callback = done; });
    const child = { pid: 4243, exitCode: null, once: vi.fn() };
    const first = terminateChild(child, { platform: "win32", execFileApi: taskkill, waitForExit: false });
    const second = terminateChild(child, { platform: "win32", execFileApi: taskkill, waitForExit: false });
    expect(taskkill).toHaveBeenCalledOnce();
    callback(null);
    await Promise.all([first, second]);
    const denied = { pid: 4244, exitCode: null, once: vi.fn() };
    await expect(terminateChild(denied, { platform: "win32", execFileApi: (_command, _args, _options, done) => done(new Error("access denied")), waitForExit: false })).rejects.toThrow("access denied");
  });

  it("discovers, opens, reads and writes a selected project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "p47-runtime-")); tempDirs.push(root);
    await fs.writeFile(path.join(root, "package.json"), "{}\n");
    await fs.writeFile(path.join(root, "hello.txt"), "hello");
    await fs.writeFile(path.join(root, ".env"), "SECRET=do-not-show\n");
    const app = express(); app.use(express.json()); app.use("/api/runtime", createRuntimeRouter({ roots: [root], codexBin: "/does/not/exist" }));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${server.address().port}/api/runtime`;
      const status = await (await fetch(`${base}/status`)).json(); expect(status.enabled).toBe(true); expect(status.projects).toHaveLength(1);
      const id = projectId(root);
      const snapshot = await (await fetch(`${base}/projects/${id}`)).json(); expect(snapshot.files.some((entry) => entry.path === ".env")).toBe(false);
      const file = await (await fetch(`${base}/projects/${id}/file?path=hello.txt`)).json(); expect(file.content).toBe("hello"); expect(file.sha256).toHaveLength(64);
      const write = await fetch(`${base}/projects/${id}/file`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "new.txt", content: "new" }) }); expect(write.status).toBe(200);
      expect(await fs.readFile(path.join(root, "new.txt"), "utf8")).toBe("new");
      expect((await (await fetch(`${base}/projects/${id}/file?path=.env`)).json()).error).toContain("Protected");
      expect((await (await fetch(`${base}/projects/${id}/file?path=../secret`)).json()).error).toBeTruthy();
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });

  it("requires the current local capability and same-origin approval before exposing a project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "p47-runtime-capability-")); tempDirs.push(root);
    await fs.writeFile(path.join(root, "package.json"), "{}\n");
    await fs.writeFile(path.join(root, "hello.txt"), "hello");
    const token = "this-is-a-fresh-local-launch-token";
    const app = express();
    app.use("/api/runtime", createRuntimeRouter({
      roots: [root],
      codexBin: "/does/not/exist",
      enabled: true,
      accessToken: token,
      accessCookieName: "p47_runtime",
      expectedHost: "127.0.0.1",
    }));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${server.address().port}/api/runtime`;
      const id = projectId(root);
      expect((await fetch(`${base}/projects/${id}`)).status).toBe(401);
      expect((await fetch(`${base}/projects/${id}`, { headers: { cookie: "p47_runtime=wrong" } })).status).toBe(401);
      expect((await fetch(`${base}/projects/${id}`, { headers: { cookie: `p47_runtime=${token}` } })).status).toBe(200);
      expect(await rawStatus(`${base}/projects/${id}`, { Cookie: `p47_runtime=${token}`, Host: "localhost" })).toBe(403);

      const rejectedChange = await fetch(`${base}/projects/${id}/file`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: `p47_runtime=${token}`, origin: "https://untrusted.example" },
        body: JSON.stringify({ path: "new.txt", content: "no" }),
      });
      expect(rejectedChange.status).toBe(403);
      expect(await fs.stat(path.join(root, "new.txt")).then(() => false).catch(() => true)).toBe(true);

      const allowedChange = await fetch(`${base}/projects/${id}/file`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: `p47_runtime=${token}`, origin: new URL(base).origin },
        body: JSON.stringify({ path: "new.txt", content: "yes" }),
      });
      expect(allowedChange.status).toBe(200);
      expect(await fs.readFile(path.join(root, "new.txt"), "utf8")).toBe("yes");
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });

  it("keeps the read-only understanding gate before a Codex build", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "p47-runtime-codex-")); tempDirs.push(root);
    await fs.writeFile(path.join(root, "package.json"), "{\"name\":\"fixture\"}\n");
    const fakeCodexScript = path.join(root, "fake-codex.mjs");
    await fs.writeFile(fakeCodexScript, `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
if (process.argv.includes("workspace-write")) {
  fs.writeFileSync(path.join(process.cwd(), "made.txt"), "ok");
  console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:JSON.stringify({summary:"Implemented the approved change",changedFiles:["made.txt"],checks:[],remaining:[]})}}));
} else {
  console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:JSON.stringify({understanding:"Build the selected project",recommendations:["Keep the change focused"],consensus:"Use the existing project structure",wildcard:"A smaller change may be enough",acceptance:["The project check passes"],humanActions:[]})}}));
}
console.log(JSON.stringify({type:"turn.completed"}));
`);
    const fakeCodex = process.platform === "win32" ? path.join(root, "fake-codex.cmd") : fakeCodexScript;
    if (process.platform === "win32") await fs.writeFile(fakeCodex, `@echo off\r\nnode "%~dp0fake-codex.mjs" %*\r\n`);
    else await fs.chmod(fakeCodex, 0o755);
    const app = express(); app.use(express.json()); app.use("/api/runtime", createRuntimeRouter({ roots: [root], codexBin: fakeCodex, recordDir: path.join(root, "runs") }));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${server.address().port}/api/runtime`;
      const id = projectId(root);
      const blockedBuild = await fetch(`${base}/projects/${id}/build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea: "Skip the checkpoint" }) });
      expect(blockedBuild.status).toBe(409);
      const start = await (await fetch(`${base}/projects/${id}/understand`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea: "Make this project useful" }) })).json();
      let job;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        job = await (await fetch(`${base}/jobs/${start.jobId}`)).json();
        if (["completed", "failed"].includes(job.status)) break;
      }
      expect(job.status).toBe("completed");
      expect(job.checkpoint.title).toBe("What I understand you want");
      expect(job.checkpoint.understanding).toBe("Build the selected project");
      const buildStart = await (await fetch(`${base}/projects/${id}/build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea: "Make this project useful", checkpoint: job.checkpoint }) })).json();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        job = await (await fetch(`${base}/jobs/${buildStart.jobId}`)).json();
        if (["completed", "failed"].includes(job.status)) break;
      }
      expect(job.status).toBe("completed");
      expect(job.result.changedFiles).toContain("made.txt");
      expect(await fs.readFile(path.join(root, "made.txt"), "utf8")).toBe("ok");
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });
});
