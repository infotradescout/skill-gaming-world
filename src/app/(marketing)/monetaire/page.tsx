import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Monetaire · Skill Gaming World",
  description: "Draw 3 solitaire with a clear board and a deliberate pace.",
};

export default function MonetairePage() {
  return (
    <div className="public-game-page public-monetaire-page">
      <section className="public-game-hero shell">
        <div className="public-game-copy">
          <p className="public-kicker">Monetaire / Table game</p>
          <h1>
            Read the board.
            <br />
            <em>Build the line.</em>
          </h1>
          <p className="public-game-lead">
            Draw 3 Klondike for players who like the quiet part of competition:
            seeing the move, weighing the cost, and finishing cleanly.
          </p>
          <div className="public-action-row">
            <Link className="public-primary-button" href="/auth/register">
              Play free
            </Link>
            <Link className="public-text-link" href="/monetaire/how-it-works">
              How the table works <span>↗</span>
            </Link>
          </div>
          <p className="public-small-note">
            Practice is free. Play Coins are entertainment points only.
          </p>
        </div>

        <div className="public-table-stage" aria-label="Monetaire table preview">
          <div className="public-table-label">
            <span>MONETAIRE</span>
            <span>DRAW 3</span>
          </div>
          <div className="public-table-board">
            <div className="public-table-stack public-table-stock"><span>SG</span></div>
            <div className="public-table-slot"><span>A</span></div>
            <div className="public-table-slot"><span>A</span></div>
            <div className="public-table-slot"><span>A</span></div>
            <div className="public-table-slot"><span>A</span></div>
            <div className="public-table-card public-table-card-one"><b>7</b><span>♣</span></div>
            <div className="public-table-card public-table-card-two public-table-red"><b>Q</b><span>♥</span></div>
            <div className="public-table-card public-table-card-three"><b>J</b><span>♠</span></div>
            <div className="public-table-card public-table-card-four public-table-red"><b>10</b><span>♦</span></div>
          </div>
          <div className="public-table-footer">
            <span>Same rules every hand</span>
            <strong>NO PAID EDGE</strong>
          </div>
        </div>
      </section>

      <section className="public-rule-strip shell">
        <div><span>01</span><b>Build</b><small>Descending ranks, alternating colors.</small></div>
        <div><span>02</span><b>Open</b><small>Turn the hidden cards and find the route.</small></div>
        <div><span>03</span><b>Finish</b><small>Move every suit from Ace to King.</small></div>
      </section>

      <section className="public-game-bottom shell">
        <div>
          <p className="public-kicker">A better kind of replay</p>
          <h2>One board teaches more than ten menus.</h2>
        </div>
        <p>
          Start a practice hand, learn the controls, and come back to the same
          familiar rhythm whenever you want. Rankings and achievements are
          recognition—not a purchase.
        </p>
        <Link className="public-outline-button" href="/monetaire/play">
          See the play rules <span>↗</span>
        </Link>
      </section>
    </div>
  );
}
