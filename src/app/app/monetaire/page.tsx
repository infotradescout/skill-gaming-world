import Link from "next/link";
import { competitionView } from "@/lib/competition-snapshot";
import { runtimeCompetitionSnapshot } from "@/lib/runtime-competition";

export default async function MonetaireLobbyPage() {
  const snapshot = await runtimeCompetitionSnapshot().catch(() => null);
  const competition = snapshot ? competitionView(snapshot) : null;
  const competitionLabel = competition?.status === "OPEN" ? "Open this week" : "Available";

  return (
    <div className="game-room monetaire-room">
      <div className="room-topline">
        <Link href="/app">← Lobby</Link>
        <span>MONETAIRE · DRAW 3</span>
      </div>

      <header className="room-header">
        <div>
          <p className="eyebrow">The table</p>
          <h1>Deal. Think. Clear the table.</h1>
          <p>
            A focused Draw 3 solitaire room with a hand that starts in one tap and
            rules you can see while you play.
          </p>
        </div>
        <Link className="button button-primary button-large" href="/app/monetaire/practice">
          Play Draw 3
        </Link>
      </header>

      <section className="monetaire-room-stage">
        <div className="monetaire-room-art" aria-hidden="true">
          <div className="monetaire-room-table-mark">
            <span>MONETAIRE</span>
            <strong>DRAW 3</strong>
          </div>
          <span className="room-card room-card-back"><b>MON</b></span>
          <span className="room-card room-card-ace"><b>A</b><i>♠</i></span>
          <span className="room-card room-card-queen"><b>Q</b><i>♥</i></span>
          <span className="room-card room-card-ten"><b>10</b><i>♦</i></span>
          <div className="monetaire-room-suits">♠　♥　♦　♣</div>
        </div>

        <div className="monetaire-room-copy">
          <span className="room-status room-status-open">Practice table open</span>
          <p className="eyebrow">Your next move</p>
          <h2>Start with a clean deal.</h2>
          <p>
            Move cards down in alternating colors, reveal the hidden cards, and build
            each suit from Ace to King. Your progress is saved as you play.
          </p>
          <div className="room-action-row">
            <Link className="button button-primary" href="/app/monetaire/practice">Open the table</Link>
            <Link className="room-text-action" href="/monetaire/how-it-works">How to play <span>→</span></Link>
          </div>
        </div>
      </section>

      <section className="monetaire-room-lower">
        <div className="room-path">
          <div className="room-path-label">The rhythm</div>
          <div className="room-path-step">
            <span>01</span>
            <div><strong>Draw three</strong><small>Read the hand before you commit.</small></div>
          </div>
          <div className="room-path-step">
            <span>02</span>
            <div><strong>Open the board</strong><small>Build descending runs in alternating colors.</small></div>
          </div>
          <div className="room-path-step">
            <span>03</span>
            <div><strong>Finish the suits</strong><small>Move from Ace to King and close the deal.</small></div>
          </div>
        </div>

        <aside className="room-side-stack">
          <section className="room-side-block">
            <span className="room-side-label">Competition board</span>
            {competition ? (
              <>
                <h3>{competition.name}</h3>
                <p>
                  {competition.entryCostPlayCoins} Play Coins · no cash or valuable
                  prizes · {competitionLabel.toLowerCase()}.
                </p>
                <Link className="room-text-action" href="/app/monetaire/competitions">View the board <span>→</span></Link>
              </>
            ) : (
              <>
                <h3>Practice comes first.</h3>
                <p>The competition board is not available right now. The free table is ready.</p>
              </>
            )}
          </section>

          <details className="room-disclosure">
            <summary>Play Coin rules</summary>
            <p>Play Coins are for entertainment only. They have no cash value and cannot be withdrawn or redeemed.</p>
            <Link href="/legal/play-coins">Read the full terms →</Link>
          </details>
        </aside>
      </section>
    </div>
  );
}
