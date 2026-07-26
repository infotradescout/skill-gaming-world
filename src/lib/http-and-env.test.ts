import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { getRuntimeEnv } from "./env";
import { enforceSameOrigin } from "./http";

const originalNodeEnv = process.env.NODE_ENV;
const originalDemoMode = process.env.DEMO_MODE;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalSessionSecret = process.env.SESSION_SECRET;
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
  it("rejects the in-memory demo adapter in a production runtime", () => {
    mutableEnv.NODE_ENV = "production";
    process.env.DEMO_MODE = "true";
    process.env.DATABASE_URL =
      "postgresql://configured:configured@127.0.0.1:5432/configured";
    process.env.SESSION_SECRET =
      "configured-session-secret-at-least-32-characters";

    expect(() => getRuntimeEnv()).toThrow(
      "DEMO_MODE cannot be enabled in a production runtime",
    );
  });
});
