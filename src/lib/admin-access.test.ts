import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: "owner-session",
  redirect: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
  runtimeUserFromToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => (mocks.cookieValue ? { value: mocks.cookieValue } : undefined)),
  })),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("./auth", () => ({
  SESSION_COOKIE: "sgw_session",
  runtimeUserFromToken: mocks.runtimeUserFromToken,
}));

import { requireAdminRoles } from "./admin-access";

describe("requireAdminRoles", () => {
  beforeEach(() => {
    mocks.cookieValue = "owner-session";
    mocks.redirect.mockClear();
    mocks.runtimeUserFromToken.mockReset();
  });

  it("redirects an anonymous request before protected content can render", async () => {
    mocks.runtimeUserFromToken.mockResolvedValue(null);

    await expect(requireAdminRoles(["SUPER_ADMIN"])).rejects.toThrow("redirect:/auth/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("redirects an ordinary admin who does not have the owner role", async () => {
    mocks.runtimeUserFromToken.mockResolvedValue({ adminRoles: ["SUPPORT"] });

    await expect(requireAdminRoles(["SUPER_ADMIN"])).rejects.toThrow("redirect:/admin?authorization=denied");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin?authorization=denied");
  });

  it("allows the owner role", async () => {
    const owner = { adminRoles: ["SUPER_ADMIN"] };
    mocks.runtimeUserFromToken.mockResolvedValue(owner);

    await expect(requireAdminRoles(["SUPER_ADMIN"])).resolves.toBe(owner);
    expect(mocks.runtimeUserFromToken).toHaveBeenCalledWith("owner-session");
  });
});
