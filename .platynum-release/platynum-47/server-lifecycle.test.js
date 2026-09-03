import { describe, expect, it } from "vitest";
import { startPlatynumServer, stopPlatynumServer } from "./server.js";

describe("Platynum server lifecycle", () => {
  it("starts only when asked, binds loopback, and can stop twice", async () => {
    const server = await startPlatynumServer({ port: 0, host: "127.0.0.1" });
    const address = server.address();
    expect(typeof address).toBe("object");
    expect(address.address).toBe("127.0.0.1");
    const page = await fetch(`http://127.0.0.1:${address.port}`, { headers: { accept: "text/html" } });
    expect(page.status).toBe(200);
    expect(page.headers.get("set-cookie")).toContain("p47_runtime=");
    await stopPlatynumServer();
    await stopPlatynumServer();
  });
});
