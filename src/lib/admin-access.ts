import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  runtimeUserFromToken,
  SESSION_COOKIE,
} from "./auth";
import type { DemoAdminRole } from "./demo-store";

export async function requireAdminRoles(
  allowedRoles: readonly DemoAdminRole[],
) {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    redirect("/auth/login");
  }
  if (!user.adminRoles.some((role) => allowedRoles.includes(role))) {
    redirect("/admin?authorization=denied");
  }
  return user;
}
