import type { Metadata } from "next";
import Link from "next/link";
import { CardStudy } from "@/components/card-art";

export const metadata: Metadata = {
  title: "Monetaire · Skill Gaming World",
  description: "Draw 3 solitaire in Skill Gaming World.",
};

export default function MonetairePage() {
  return (
    <div className="launcher-game-page launcher-monetaire-page">
      <section className="launcher-game-hero shell">
        <div className="launcher-game-copy">
          <p className="launcher-kicker"><span /> MONETAIRE / DRAW 3</p>
          <h1>Read the deal.</h1>
          <p>
            Draw three cards, open the board, and build every suit from Ace to King.
          </p>
          <div className="launcher-action-row">
            <Link className="launcher-play-button launcher-play-button-large" href="/auth/register">
              Play free
            </Link>
            <Link className="launcher-secondary-link" href="/monetaire/how-it-works">
              How it works <span>↗</span>
            </Link>
          </div>
          <div className="launcher-rule-line">
            <span>DRAW 3</span>
            <span>FREE PRACTICE</span>
            <span>NO PAID EDGE</span>
          </div>
        </div>
        <div className="launcher-game-showcase launcher-card-showcase">
          <CardStudy />
          <span className="launcher-showcase-label">MONETAIRE / TABLE 01</span>
        </div>
      </section>

      <section className="launcher-game-rail shell">
        <div><b>01</b><strong>Draw three</strong><span>Read the hand before you commit.</span></div>
        <div><b>02</b><strong>Open the board</strong><span>Build descending runs in alternating colors.</span></div>
        <div><b>03</b><strong>Finish the suits</strong><span>Move from Ace through King.</span></div>
      </section>
    </div>
  );
}
