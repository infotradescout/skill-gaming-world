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
const nextConfig = resolve(process.cwd(), "next.config.ts");

describe("Platynum companion boundary", () => {
  it("requires the owner role and never turns the game service into a remote work engine", () => {
    const source = readFileSync(companionPage, "utf8");

    expect(source).toContain('requireAdminRoles(["SUPER_ADMIN"])');
    expect(source).toContain('href="http://127.0.0.1:5173"');
    expect(source).toContain('archive/ffe03e12b6ddad52a9c127bb15d05598911e4231.zip');
    expect(source).toContain('robots: { index: false, follow: false }');
    expect(source).not.toMatch(/<iframe|fetch\(|\/api\/(runtime|model|pair)|github\/oauth|archive\/refs\/heads/i);
  });

  it("keeps the one loopback launch link usable without weakening other routes", () => {
    const source = readFileSync(nextConfig, "utf8");

    expect(source).toContain('source: "/admin/platynum"');
    expect(source).toContain("platynumCompanionContentSecurityPolicy");
    expect(source).toContain('"; upgrade-insecure-requests"');
  });
});
