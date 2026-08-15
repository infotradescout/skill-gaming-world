import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CardCustomization } from "@/components/card-customization";
import { SolitaireBoard } from "@/components/solitaire-board";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { runtimeEligibilitySnapshot } from "@/lib/runtime-eligibility";

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");

  const eligibility = await runtimeEligibilitySnapshot(user);
  if (eligibility.monetairePlay.decision !== "ALLOW") {
    redirect("/app/responsible-play");
  }

  return (
    <div className="game-play-screen monetaire-play-screen">
      <div className="room-topline">
        <Link href="/app/monetaire">← Monetaire</Link>
        <span>TABLE · DRAW 3</span>
      </div>
      <header className="play-heading">
        <div>
          <p className="eyebrow">At the table</p>
          <h1>Make the next move.</h1>
          <p>Free practice. Draw three cards at a time. Pick up where you left off.</p>
        </div>
        <Link className="room-text-action" href="/app/monetaire/how-it-works">How to play <span>→</span></Link>
      </header>
      <CardCustomization />
      <SolitaireBoard resumeSessionId={session} />
    </div>
  );
}
