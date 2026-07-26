import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { demoUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import "@/components/admin.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const user = demoUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    redirect("/auth/login");
  }
  if (user.adminRoles.length === 0) {
    redirect("/app");
  }
  return <AdminShell>{children}</AdminShell>;
}
