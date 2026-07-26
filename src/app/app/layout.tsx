import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { demoUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { playCoinBalance } from "@/lib/demo-store";
import "@/components/player-app.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PlayerAppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const user = demoUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    redirect("/auth/login");
  }
  return (
    <AppShell
      user={{ displayName: user.displayName, status: user.status }}
      initialPlayCoinBalance={playCoinBalance(user.id)}
    >
      {children}
    </AppShell>
  );
}
