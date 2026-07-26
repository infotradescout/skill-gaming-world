import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { WalletSandbox } from "@/components/player-panels";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { playCoinBalance, playCoinHistory } from "@/lib/demo-store";

export default async function WalletPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    redirect("/auth/login");
  }
  const entries = playCoinHistory(user.id)
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
      <WalletSandbox initialBalance={playCoinBalance(user.id)} initialEntries={entries} />
    </>
  );
}
