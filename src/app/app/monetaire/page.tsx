import Link from "next/link";
import { CardStudy } from "@/components/card-art";
import { competitionView } from "@/lib/competition-snapshot";
import { runtimeCompetitionSnapshot } from "@/lib/runtime-competition";

export default async function MonetaireLobbyPage() {
  const snapshot = await runtimeCompetitionSnapshot().catch(() => null);
  const competition = snapshot ? competitionView(snapshot) : null;

  return (
    <div className="app-game-room app-monetaire-room">
      <div className="app-room-topline">
        <Link href="/app">← Games</Link>
        <span>MONETAIRE / DRAW 3</span>
      </div>

      <section className="app-room-hero">
        <div className="app-room-copy">
          <p className="launcher-kicker"><span /> TABLE 01</p>
          <h1>Draw three.</h1>
          <p>Every card changes the route. Open the table and find the cleanest line through the deal.</p>
          <div className="launcher-action-row">
            <Link className="launcher-play-button launcher-play-button-large" href="/app/monetaire/practice">
              Start a hand
            </Link>
            <Link className="launcher-secondary-link" href="/monetaire/how-it-works">
              Rules <span>↗</span>
            </Link>
          </div>
        </div>
        <div className="app-room-visual app-card-visual">
          <CardStudy />
          <span>MONETAIRE / FREE TABLE</span>
        </div>
      </section>

      <section className="app-room-rail">
        <div><b>DRAW 3</b><span>Top waste card only.</span></div>
        <div><b>ACE → KING</b><span>Complete every foundation.</span></div>
        <div><b>YOUR MOVE</b><span>Practice is saved to your account.</span></div>
      </section>

      <section className="app-room-side">
        <div>
          <span className="app-side-label">Competition</span>
          <strong>{competition?.name ?? "Practice first"}</strong>
          <p>{competition ? "Noncash ranking is available from the competition board." : "The free practice table is ready."}</p>
          {competition ? <Link href="/app/monetaire/competitions">Open board <span>↗</span></Link> : null}
        </div>
        <div>
          <span className="app-side-label">Play Coin boundary</span>
          <p>Play Coins are entertainment points only. They do not change the deal or buy an advantage.</p>
        </div>
      </section>
    </div>
  );
}
