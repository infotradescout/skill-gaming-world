import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("Platynum Windows app download", () => {
  beforeEach(() => {
    mocks.createReadStream.mockReset();
    mocks.requireAdminRoles.mockReset().mockResolvedValue({ adminRoles: ["SUPER_ADMIN"] });
    mocks.stat.mockReset();
    mocks.toWeb.mockClear();
  });

  it("requires the owner gate before opening the Windows app", async () => {
    mocks.requireAdminRoles.mockRejectedValue(new Error("redirect:/auth/login"));

    await expect(GET()).rejects.toThrow("redirect:/auth/login");
    expect(mocks.stat).not.toHaveBeenCalled();
  });

  it("downloads only the fixed Windows app artifact with private response headers", async () => {
    mocks.stat.mockResolvedValue({ isFile: () => true, size: 42 });
    mocks.createReadStream.mockReturnValue({ stream: true });

    const response = await GET();

    expect(mocks.requireAdminRoles).toHaveBeenCalledWith(["SUPER_ADMIN"]);
    expect(mocks.createReadStream).toHaveBeenCalledTimes(1);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Platynum-47-0.2.0.exe"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-length")).toBe("42");
  });
});
