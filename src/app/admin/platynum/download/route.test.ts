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

import { GET } from "./route";

const directToken = "a".repeat(64);

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

  it("requires the owner gate when no direct access token is supplied", async () => {
    mocks.requireAdminRoles.mockRejectedValue(new Error("redirect:/auth/login"));

    await expect(GET()).rejects.toThrow("redirect:/auth/login");
    expect(mocks.stat).not.toHaveBeenCalled();
  });

  it("does not accept an incorrect direct access token", async () => {
    mocks.requireAdminRoles.mockRejectedValue(new Error("redirect:/auth/login"));
    const request = new Request(
      `http://localhost/admin/platynum/download?access=${"b".repeat(64)}`,
    );

    await expect(GET(request)).rejects.toThrow("redirect:/auth/login");
    expect(mocks.stat).not.toHaveBeenCalled();
  });

  it("accepts the private direct access token without sending the owner through login", async () => {
    mocks.stat.mockResolvedValue({ isFile: () => true, size: 42 });
    mocks.createReadStream.mockReturnValue({ stream: true });
    const request = new Request(
      `http://localhost/admin/platynum/download?access=${directToken}`,
    );

    const response = await GET(request);

    expect(mocks.requireAdminRoles).not.toHaveBeenCalled();
    expect(mocks.createReadStream).toHaveBeenCalledTimes(1);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Platynum-47-0.2.0-windows-x64.zip"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-length")).toBe("42");
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("keeps the Super Admin download path working without a direct token", async () => {
    mocks.stat.mockResolvedValue({ isFile: () => true, size: 42 });
    mocks.createReadStream.mockReturnValue({ stream: true });

    const response = await GET();

    expect(mocks.requireAdminRoles).toHaveBeenCalledWith(["SUPER_ADMIN"]);
    expect(response.status).toBe(200);
  });
});
