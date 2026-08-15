import Link from "next/link";
import { AppPageHeader } from "@/components/app-shell";
import { StatusPill } from "@/components/page-elements";
import { competitionView } from "@/lib/competition-snapshot";
import { runtimeCompetitionSnapshot } from "@/lib/runtime-competition";

export default async function MonetaireLobbyPage() {
  const snapshot = await runtimeCompetitionSnapshot().catch(() => null);
  const competition = snapshot ? competitionView(snapshot) : null;
  const competitionLabel = competition?.status === "OPEN" ? "Open this week" : "Available";

  return (
    <>
      <AppPageHeader
        eyebrow="Monetaire · Draw 3"
        title="Make the next move."
        actions={<Link className="button button-primary" href="/app/monetaire/practice">Play Draw 3</Link>}
      >
        <p>Focused solitaire, clear scoring, and a practice hand that starts in one tap.</p>
      </AppPageHeader>

      <div className="monetaire-lobby">
        <section className="monetaire-feature surface">
          <div className="monetaire-feature-art" aria-hidden="true">
            <div className="lobby-card-stack"><span /><span /><span /></div>
            <div className="monetaire-suit-line"><span>♠</span><b>♥</b><span>♦</span><b>♣</b></div>
            <span className="monetaire-art-label">DRAW 3</span>
          </div>
          <div className="monetaire-feature-copy">
            <StatusPill tone="live">Ready to play</StatusPill>
            <p className="eyebrow">Practice table</p>
            <h2>Play a hand without the pressure.</h2>
            <p>
              Try a fresh Draw 3 hand, learn the rhythm, and see your score as you
              play. Practice is free and does not affect a competition result.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/app/monetaire/practice">Play Draw 3</Link>
              <Link className="text-link" href="/monetaire/how-it-works">How it works →</Link>
            </div>
          </div>
        </section>

        <aside className="monetaire-side">
          <section className="lobby-competition surface-soft">
            {competition ? (
              <>
                <StatusPill tone="live">Noncash competition</StatusPill>
                <h2>{competition.name}</h2>
                <p>
                  {competition.entryCostPlayCoins} Play Coins to enter · no cash or
                  valuable prizes · {competitionLabel.toLowerCase()}.
                </p>
                <Link className="button button-secondary" href="/app/monetaire/competitions">
                  View leaderboard
                </Link>
              </>
            ) : (
              <>
                <StatusPill tone="blocked">Not available</StatusPill>
                <h2>Competition board</h2>
                <p>
                  The noncash competition board is not available right now. Practice
                  is still ready whenever you are.
                </p>
              </>
            )}
          </section>
          <div className="callout monetaire-disclosure">
            <p>Play Coins are for entertainment only. They have no cash value and cannot be withdrawn or redeemed.</p>
            <Link className="text-link" href="/legal/play-coins">Read the Play Coin terms →</Link>
          </div>
        </aside>
      </div>
    </>
  );
}
