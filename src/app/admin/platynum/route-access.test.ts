import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminRoles: vi.fn().mockResolvedValue({ adminRoles: ["SUPER_ADMIN"] }) }));

vi.mock("@/lib/admin-access", () => ({ requireAdminRoles: mocks.requireAdminRoles }));

import PlatynumCompanionPage from "./page";

describe("Platynum companion route", () => {
  it("asks the server-side owner gate for the exact Super Admin role", async () => {
    await PlatynumCompanionPage();

    expect(mocks.requireAdminRoles).toHaveBeenCalledWith(["SUPER_ADMIN"]);
  });
});
