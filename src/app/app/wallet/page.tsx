import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { WalletSandbox } from "@/components/player-panels";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { playCoinBalance, playCoinHistory } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import { persistentPlayCoinProjection } from "@/lib/persistent-projections";

export default async function WalletPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    redirect("/auth/login");
  }
  const env = getRuntimeEnv();
  const projection = env.DEMO_MODE
    ? {
        balanceMinor: playCoinBalance(user.id),
        entries: playCoinHistory(user.id),
      }
    : await persistentPlayCoinProjection(user.id);
  const entries = projection.entries
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((entry) => ({
      id: entry.id,
      direction: entry.direction,
      amountMinor: entry.amountMinor,
      balanceAfterMinor: entry.balanceAfterMinor,
      reason: entry.reason,
      createdAt: entry.createdAt,
    }));
  return (
    <>
      <AppPageHeader eyebrow="Entertainment ledger" title="Play Coins">
        <p>Play Coins are nonredeemable entertainment units—not money, winnings, or stored value.</p>
      </AppPageHeader>
      <WalletSandbox initialBalance={projection.balanceMinor} initialEntries={entries} />
    </>
  );
}
