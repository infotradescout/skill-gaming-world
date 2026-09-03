import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const companionPage = resolve(
  process.cwd(),
  "src",
  "app",
  "admin",
  "platynum",
  "page.tsx",
);
const downloadRoute = resolve(
  process.cwd(),
  "src",
  "app",
  "admin",
  "platynum",
  "download",
  "route.ts",
);
const releaseBuilder = resolve(process.cwd(), "tools", "build-platynum-installer.mjs");

describe("Platynum companion boundary", () => {
  it("requires the owner role and never turns the game service into a remote work engine", () => {
    const source = readFileSync(companionPage, "utf8");
    const downloadSource = readFileSync(downloadRoute, "utf8");

    expect(source).toContain('requireAdminRoles(["SUPER_ADMIN"])');
    expect(source).toContain('href="/admin/platynum/download"');
    expect(source).toContain('robots: { index: false, follow: false }');
    expect(source).not.toMatch(/<iframe|fetch\(|\/api\/(runtime|model|pair)|github\/oauth|archive\//i);
    expect(downloadSource).toContain('requireAdminRoles(["SUPER_ADMIN"])');
    expect(downloadSource).toContain('Platynum-47-0.2.0-windows-x64.zip');
    expect(downloadSource).not.toMatch(/searchParams|params|\[\.\.\./i);
  });

  it("keeps the release decryption key out of package and packaging child processes", () => {
    const source = readFileSync(releaseBuilder, "utf8");

    expect(source).toContain("const sourceKey = process.env.P47_SOURCE_KEY;");
    expect(source).toContain("delete process.env.P47_SOURCE_KEY;");
    expect(source).toContain("{ env: { P47_ARCHIVE_KEY: key } }");
    expect(source).toContain('"--dir"');
    expect(source).not.toContain('"portable"');
    expect(source).toContain('const desktopArchiveName = `Platynum-47-${version}-windows-x64.zip`;');
    expect(source).toContain('["-q", "-r", "-1", desktopArchive, desktopDirectoryName]');
    expect(source).toContain('await run("unzip", ["-tq", desktopArchive]);');
    expect(source).toContain('`${desktopDirectoryName}/${desktopExecutableName}`');
    expect(source).toContain('heartbeat: "Packaging the Windows desktop app"');
    expect(source).toContain('heartbeat: "Archiving the Windows desktop app"');
    expect(source).toContain('process.once("SIGTERM"');
    expect(source).toContain("await cleanActiveWorkDirectory();");
  });
});
