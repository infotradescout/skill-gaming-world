import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { SolitaireBoard } from "@/components/solitaire-board";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { runtimeEligibilitySnapshot } from "@/lib/runtime-eligibility";

export default async function PracticePage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    redirect("/auth/login");
  }
  const eligibility = await runtimeEligibilitySnapshot(user);
  if (eligibility.monetairePlay.decision !== "ALLOW") {
    redirect("/app/responsible-play");
  }
  return (
    <>
      <AppPageHeader eyebrow="Monetaire Play" title="Practice board">
        <p>Tap or click a face-up card, then choose its destination. Keyboard shortcuts are shown below the board.</p>
      </AppPageHeader>
      <SolitaireBoard />
    </>
  );
}
