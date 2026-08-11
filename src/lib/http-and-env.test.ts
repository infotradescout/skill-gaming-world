import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { configuredDatabaseFingerprint, getRuntimeEnv } from "./env";
import { enforceSameOrigin } from "./http";

const originalNodeEnv = process.env.NODE_ENV;
const originalDemoMode = process.env.DEMO_MODE;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalSessionSecret = process.env.SESSION_SECRET;
const originalCompetitionKey = process.env.COMPETITION_SEED_ENCRYPTION_KEY;
const originalRenderExternalUrl = process.env.RENDER_EXTERNAL_URL;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
  if (originalCompetitionKey === undefined) {
    delete process.env.COMPETITION_SEED_ENCRYPTION_KEY;
  } else {
    process.env.COMPETITION_SEED_ENCRYPTION_KEY = originalCompetitionKey;
  }
  if (originalRenderExternalUrl === undefined) {
    delete process.env.RENDER_EXTERNAL_URL;
  } else {
    process.env.RENDER_EXTERNAL_URL = originalRenderExternalUrl;
  }
});

describe("mutation request boundaries", () => {
  it("rejects missing and cross-site origin evidence", async () => {
    const missing = enforceSameOrigin(
      new NextRequest("http://localhost:3000/api/example", {
        method: "POST",
      }),
    );
    const crossSite = enforceSameOrigin(
      new NextRequest("http://localhost:3000/api/example", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );

    expect(missing?.status).toBe(403);
    expect(crossSite?.status).toBe(403);
    await expect(missing?.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_REJECTED" },
    });
  });

  it("accepts exact Origin or same-origin Fetch Metadata", () => {
    const exact = enforceSameOrigin(
      new NextRequest("http://localhost:3000/api/example", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      }),
    );
    const fetchMetadata = enforceSameOrigin(
      new NextRequest("http://localhost:3000/api/example", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
      }),
    );

    expect(exact).toBeNull();
    expect(fetchMetadata).toBeNull();
  });

  it("accepts HTTPS same-host Origin behind a production TLS proxy", () => {
    mutableEnv.NODE_ENV = "production";

    const forwarded = enforceSameOrigin(
      new NextRequest("http://preview.example/api/example", {
        method: "POST",
        headers: { origin: "https://preview.example" },
      }),
    );
    const crossSite = enforceSameOrigin(
      new NextRequest("http://preview.example/api/example", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );

    expect(forwarded).toBeNull();
    expect(crossSite?.status).toBe(403);
  });

  it("accepts Render's public Origin when the runtime URL is internal", () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.RENDER_EXTERNAL_URL = "https://skill-gaming-world.onrender.com";

    const publicOrigin = enforceSameOrigin(
      new NextRequest("https://localhost:10000/api/example", {
        method: "POST",
        headers: { origin: "https://skill-gaming-world.onrender.com" },
      }),
    );
    const crossSite = enforceSameOrigin(
      new NextRequest("https://localhost:10000/api/example", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );

    expect(publicOrigin).toBeNull();
    expect(crossSite?.status).toBe(403);
  });

  it("accepts equivalent loopback hosts outside production only", () => {
    expect(
      enforceSameOrigin(
        new NextRequest("http://localhost:3000/api/example", {
          method: "POST",
          headers: { origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBeNull();

    expect(
      enforceSameOrigin(
        new NextRequest("http://localhost:3000/api/example", {
          method: "POST",
          headers: { origin: "http://127.0.0.1:3001" },
        }),
      )?.status,
    ).toBe(403);
  });

});

describe("runtime configuration", () => {
  it("fingerprints the database target without including credentials", () => {
    const first = configuredDatabaseFingerprint(
      "postgresql://user:secret-a@preview-branch.example:5432/app?sslmode=require",
    );
    const rotatedSecret = configuredDatabaseFingerprint(
      "postgresql://user:secret-b@preview-branch.example:5432/app?sslmode=require",
    );
    const productionBranch = configuredDatabaseFingerprint(
      "postgresql://user:secret-b@production-branch.example:5432/app?sslmode=require",
    );

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(rotatedSecret).toBe(first);
    expect(productionBranch).not.toBe(first);
  });

  it("rejects the in-memory demo adapter in a production runtime", () => {
    mutableEnv.NODE_ENV = "production";
    process.env.DEMO_MODE = "true";
    process.env.DATABASE_URL =
      "postgresql://configured:configured@127.0.0.1:5432/configured";
    process.env.SESSION_SECRET =
      "configured-session-secret-at-least-32-characters";
    process.env.COMPETITION_SEED_ENCRYPTION_KEY =
      "configured-ranked-seed-key-at-least-32-characters";

    expect(() => getRuntimeEnv()).toThrow(
      "DEMO_MODE cannot be enabled in a production runtime",
    );
  });
});
