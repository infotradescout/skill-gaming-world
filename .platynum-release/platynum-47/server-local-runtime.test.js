import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const children = [];
const tempDirs = [];

afterEach(async () => {
  while (children.length) {
    const child = children.pop();
    if (!child.killed) child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }
  while (tempDirs.length) await fs.rm(tempDirs.pop(), { recursive: true, force: true });
});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(origin, child) {
  let lastError = "";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/model/status`);
      if (response.status === 410) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (child.exitCode !== null) throw new Error(`Local server exited before it was ready: ${lastError}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Local server did not start: ${lastError}`);
}

describe("Windows local runtime server", () => {
  it("issues a fresh local capability and blocks the legacy model proxy", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "p47-local-server-"));
    tempDirs.push(root);
    await fs.writeFile(path.join(root, "package.json"), "{}\n");
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["server.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        P47_LOCAL_RUNTIME: "1",
        P47_PROJECT_ROOTS: root,
        PORT: String(port),
      },
      stdio: "ignore",
    });
    children.push(child);
    await waitForServer(origin, child);

    const page = await fetch(origin, { headers: { accept: "text/html" } });
    const setCookie = page.headers.get("set-cookie") || "";
    expect(setCookie).toContain("p47_runtime=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");

    expect((await fetch(`${origin}/api/runtime/status`)).status).toBe(401);
    const cookie = setCookie.split(";")[0];
    expect((await fetch(`${origin}/api/runtime/status`, { headers: { cookie } })).status).toBe(200);
    expect((await fetch(`${origin}/api/model/status`, { headers: { cookie } })).status).toBe(410);
  });
});
