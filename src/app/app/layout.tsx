import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { playCoinBalance } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import { persistentPlayCoinProjection } from "@/lib/persistent-projections";
import "@/components/player-app.css";
import "@/components/game-launcher.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PlayerAppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    redirect("/auth/login");
  }
  const initialPlayCoinBalance = getRuntimeEnv().DEMO_MODE
    ? playCoinBalance(user.id)
    : (await persistentPlayCoinProjection(user.id)).balanceMinor;
  return (
    <AppShell
      user={{ displayName: user.displayName, status: user.status }}
      initialPlayCoinBalance={initialPlayCoinBalance}
    >
      {children}
    </AppShell>
  );
}
