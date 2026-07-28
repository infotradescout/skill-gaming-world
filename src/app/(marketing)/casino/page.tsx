import type { Metadata } from "next";
import { FortuneDice } from "@/components/fortune-dice";

export const metadata: Metadata = {
  title: "Casino | Skill Gaming World",
  description: "Original, transparent casino-style games played with valueless Play Coins.",
};

export default function CasinoPage() {
  return (
    <div className="casino-floor">
      <section className="casino-intro shell">
        <div>
          <p className="eyebrow">Skill Gaming World Casino</p>
          <h1>Original games.<br /><em>Honest outcomes.</em></h1>
          <p>
            Play the complete casino experience with valueless Play Coins. No
            deposits, cash-out, purchases, or transferable value.
          </p>
        </div>
        <div className="casino-balance">
          <small>Practice balance</small>
          <strong>10,000 <span>PC</span></strong>
          <p>Resets locally when you refresh this preview.</p>
        </div>
      </section>
      <FortuneDice />
      <section className="casino-coming shell">
        <p className="eyebrow">In development</p>
        <h2>The floor is growing.</h2>
        <div className="game-grid casino-preview-grid">
          <div className="game-tile preview-blackjack"><div className="preview-symbol">A♠ K♥</div><h3>Blackjack</h3><p>Classic table rules with a visible shoe and round log.</p></div>
          <div className="game-tile preview-wheel"><div className="preview-symbol">◆</div><h3>Meridian Wheel</h3><p>A transparent number wheel with published probabilities.</p></div>
          <div className="game-tile preview-poker"><div className="preview-symbol">♠ ♥ ♣ ♦</div><h3>Video Poker</h3><p>Player-choice poker with the full paytable always in view.</p></div>
        </div>
      </section>
    </div>
  );
}
