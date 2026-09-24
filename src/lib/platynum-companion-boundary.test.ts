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
  it("bounds the owner and private-link download paths without a remote work engine", () => {
    const source = readFileSync(companionPage, "utf8");
    const downloadSource = readFileSync(downloadRoute, "utf8");

    expect(source).toContain('requireAdminRoles(["SUPER_ADMIN"])');
    expect(source).toContain('href="/admin/platynum/download"');
    expect(source).toContain('robots: { index: false, follow: false }');
    expect(source).not.toMatch(/<iframe|fetch\(|\/api\/(runtime|model|pair)|github\/oauth|archive\//i);
    expect(downloadSource).toContain('requireAdminRoles(["SUPER_ADMIN"])');
    expect(downloadSource).toContain('Platynum-47-0.2.0-windows-x64.zip');
    expect(downloadSource).toContain('const desktopArchivePath = resolve(process.cwd(), ".platynum-artifacts", desktopArchiveName);');
    expect(downloadSource).toContain('searchParams.get("access")?.trim()');
    expect(downloadSource).toContain('const expected = process.env.P47_DOWNLOAD_TOKEN?.trim();');
    expect(downloadSource).toContain('expected.length < 32 || !supplied || supplied.length < 32');
    expect(downloadSource).toContain('return timingSafeEqual(expectedDigest, suppliedDigest);');
    expect(downloadSource).toContain('if (supplied) return hasValidDirectAccess(supplied);');
    expect(downloadSource).toContain('return confirmationPage(issueConfirmation());');
    expect(downloadSource).toContain('if (!ticket || !consumeConfirmation(ticket))');
    expect(downloadSource).toContain('"Cache-Control": "private, no-store"');
    expect(downloadSource).not.toMatch(/\[\.\.\.|\/api\/(runtime|model|pair)|github\/oauth|archive\/\$\{/i);
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
