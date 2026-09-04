import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createReadStream: vi.fn(),
  requireAdminRoles: vi.fn(),
  stat: vi.fn(),
  toWeb: vi.fn(() => new ReadableStream<Uint8Array>()),
}));

vi.mock("@/lib/admin-access", () => ({ requireAdminRoles: mocks.requireAdminRoles }));
vi.mock("node:fs", () => ({ createReadStream: mocks.createReadStream }));
vi.mock("node:fs/promises", () => ({ stat: mocks.stat }));
vi.mock("node:stream", () => ({ Readable: { toWeb: mocks.toWeb } }));

import { GET, HEAD, POST } from "./route";

const directToken = "a".repeat(64);

function directRequest(method: "GET" | "HEAD" = "GET", token = directToken) {
  return new Request(
    `http://localhost/admin/platynum/download?access=${token}`,
    { method },
  );
}

async function confirmationTicket(response: Response) {
  const html = await response.text();
  const match = html.match(/name="ticket" value="([A-Za-z0-9_-]+)"/);
  if (!match) throw new Error("The confirmation page did not contain a ticket.");
  return match[1];
}

function postTicket(ticket: string) {
  return new Request("http://localhost/admin/platynum/download", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ticket }),
  });
}

describe("Platynum Windows app download", () => {
  beforeEach(() => {
    process.env.P47_DOWNLOAD_TOKEN = directToken;
    mocks.createReadStream.mockReset();
    mocks.requireAdminRoles.mockReset().mockResolvedValue({ adminRoles: ["SUPER_ADMIN"] });
    mocks.stat.mockReset();
    mocks.toWeb.mockClear();
  });

  afterEach(() => {
    delete process.env.P47_DOWNLOAD_TOKEN;
  });

  it("requires the owner gate when no private token is supplied", async () => {
    mocks.requireAdminRoles.mockRejectedValue(new Error("redirect:/auth/login"));

    await expect(GET()).rejects.toThrow("redirect:/auth/login");
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.createReadStream).not.toHaveBeenCalled();
  });

  it("rejects an incorrect private link without opening the archive", async () => {
    const response = await GET(directRequest("GET", "b".repeat(64)));

    expect(response.status).toBe(404);
    expect(mocks.requireAdminRoles).not.toHaveBeenCalled();
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.createReadStream).not.toHaveBeenCalled();
  });

  it("answers repeated link-preview HEAD checks without streaming the ZIP", async () => {
    const first = await HEAD(directRequest("HEAD"));
    const second = await HEAD(directRequest("HEAD"));

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.createReadStream).not.toHaveBeenCalled();
  });

  it("turns a valid private GET into a confirmation page instead of a download", async () => {
    const response = await GET(directRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.text()).toContain("Download Platynum-47 once");
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.createReadStream).not.toHaveBeenCalled();
  });

  it("streams exactly one ZIP after the confirmation button is submitted", async () => {
    mocks.stat.mockResolvedValue({ isFile: () => true, size: 42 });
    mocks.createReadStream.mockReturnValue({ stream: true });
    const ticket = await confirmationTicket(await GET(directRequest()));

    const first = await POST(postTicket(ticket));
    const repeated = await POST(postTicket(ticket));

    expect(first.status).toBe(200);
    expect(first.headers.get("content-disposition")).toBe(
      'attachment; filename="Platynum-47-0.2.0-windows-x64.zip"',
    );
    expect(first.headers.get("content-length")).toBe("42");
    expect(first.headers.get("content-type")).toBe("application/zip");
    expect(repeated.status).toBe(409);
    expect(mocks.stat).toHaveBeenCalledTimes(1);
    expect(mocks.createReadStream).toHaveBeenCalledTimes(1);
  });

  it("keeps the Super Admin path but also requires explicit confirmation", async () => {
    const response = await GET();

    expect(mocks.requireAdminRoles).toHaveBeenCalledWith(["SUPER_ADMIN"]);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(mocks.createReadStream).not.toHaveBeenCalled();
  });

  it("rejects a POST that was not issued by the confirmation page", async () => {
    const response = await POST(postTicket("not-a-real-ticket"));

    expect(response.status).toBe(409);
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.createReadStream).not.toHaveBeenCalled();
  });
});
