import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows launcher", () => {
  it("keeps the local runtime and bundled Codex worker together", async () => {
    const source = await readFile(resolve(process.cwd(), "start-platynum-47.cmd"), "utf8");

    expect(source).toContain('set "P47_LOCAL_RUNTIME=1"');
    expect(source).toContain('set "APP_URL=http://127.0.0.1:5173"');
    expect(source).toContain('call npm ci --no-audit --no-fund');
    expect(source).toContain('if not exist "node_modules\\express\\package.json" set "P47_NEEDS_SETUP=1"');
    expect(source).toContain('if not exist "node_modules\\.bin\\codex.cmd" set "P47_NEEDS_SETUP=1"');
    expect(source).toContain('set "P47_CODEX_BIN=%CD%\\node_modules\\.bin\\codex.cmd"');
    expect(source).toContain('set "PATH=%CD%\\node_modules\\.bin;%PATH%"');
    expect(source).not.toContain("npm install -g");
  });
});
