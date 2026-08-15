import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Play Monetaire · Skill Gaming World",
};

const rules = [
  ["Build the tableau", "Stack descending ranks in alternating colors. Only face-up cards can move."],
  ["Open the board", "Turn hidden cards and use the stock when the next route is not visible yet."],
  ["Complete the suits", "Move each suit from Ace through King into its foundation."],
];

export default function MonetairePlayPage() {
  return (
    <div className="public-info-page public-play-page">
      <section className="public-info-hero shell">
        <p className="public-kicker">Monetaire / First hand</p>
        <h1>
          Draw, build,
          <br />
          <em>finish cleanly.</em>
        </h1>
        <p>
          Practice is the quickest way to learn the controls. Start a hand,
          make a legal move, and let the board teach you its rhythm.
        </p>
        <div className="public-action-row">
          <Link className="public-primary-button" href="/auth/register">
            Open the practice table
          </Link>
          <Link className="public-text-link" href="/monetaire">
            Back to Monetaire <span>↗</span>
          </Link>
        </div>
      </section>

      <section className="public-rule-list shell">
        {rules.map(([title, copy], index) => (
          <div key={title}>
            <span>0{index + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="public-info-note shell">
        <div>
          <p className="public-kicker">Practice boundary</p>
          <h2>Learn without buying an advantage.</h2>
        </div>
        <p>
          Practice does not award cash or valuable prizes. Play Coins are
          entertainment points only, and the game never sells easier deals,
          hints, or extra time.
        </p>
        <Link className="public-outline-button" href="/auth/register">
          Join free <span>↗</span>
        </Link>
      </section>
    </div>
  );
}
