import Link from "next/link";
import { AppPageHeader } from "@/components/app-shell";
import { StatusPill } from "@/components/page-elements";
import { competitionView } from "@/lib/competition-snapshot";
import { runtimeCompetitionSnapshot } from "@/lib/runtime-competition";

export default async function MonetaireLobbyPage() {
  const snapshot = await runtimeCompetitionSnapshot().catch(() => null);
  const competition = snapshot ? competitionView(snapshot) : null;
  return (
    <>
      <AppPageHeader
        eyebrow="Game lobby"
        title="Monetaire"
        actions={<Link className="button button-primary" href="/app/monetaire/practice">Start practice</Link>}
      >
        <p>Draw 3 Klondike · versioned rules · transparent scoring.</p>
      </AppPageHeader>
      <div className="lobby-grid">
        <section className="lobby-feature surface">
          <div className="lobby-card-stack" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <StatusPill tone="live">Available</StatusPill>
            <h2>Practice deal</h2>
            <p>
              A fresh server-created, unranked deal for learning the controls. It is
              not represented as a published ranked deal or a source of prizes.
            </p>
            <Link className="button button-primary" href="/app/monetaire/practice">Open board</Link>
          </div>
        </section>
        <section className="lobby-side">
          <div className="lobby-competition surface-soft">
            {competition ? (
              <>
                <StatusPill tone="live">Noncash · {competition.status}</StatusPill>
                <h2>{competition.name}</h2>
                <p>
                  {competition.entryCostPlayCoins} Play Coin entry · no valuable
                  prize
                  {competition.entryCount === null
                    ? " · entries recorded server-side"
                    : ` · ${competition.entryCount} actual ${
                        competition.entryCount === 1 ? "entry" : "entries"
                      }`}
                </p>
                <Link className="button button-secondary" href="/app/monetaire/competitions">
                  Inspect competition
                </Link>
              </>
            ) : (
              <>
                <StatusPill tone="blocked">Unavailable</StatusPill>
                <h2>No ranked publication loaded</h2>
                <p>
                  Ranked entry fails closed when the active publication source
                  is unavailable.
                </p>
              </>
            )}
          </div>
          <div className="callout">
            <p>Prize competition access is server-disabled for every player and jurisdiction.</p>
          </div>
        </section>
      </div>
    </>
  );
}
