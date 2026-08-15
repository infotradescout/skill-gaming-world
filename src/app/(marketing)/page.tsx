import Link from "next/link";
import { CardStudy } from "@/components/card-art";

export default function HomePage() {
  return (
    <div className="launcher-home">
      <section className="launcher-home-intro shell">
        <div>
          <p className="launcher-kicker"><span /> GAME SELECT</p>
          <h1>Choose your game.</h1>
          <p className="launcher-intro-copy">
            Two free games. One place to play.
          </p>
        </div>
        <div className="launcher-mode-line" aria-label="Current play mode">
          <span>FREE PLAY</span>
          <span>2 GAMES</span>
          <span>NO PAID ADVANTAGE</span>
        </div>
      </section>

      <section className="launcher-game-grid shell" aria-label="Choose a game">
        <Link className="launcher-game-tile launcher-monetaire-tile" href="/monetaire">
          <div className="launcher-tile-meta">
            <span>01 / TABLE</span>
            <span className="launcher-tile-live">OPEN</span>
          </div>
          <div className="launcher-card-art">
            <CardStudy />
          </div>
          <div className="launcher-tile-footer">
            <div>
              <span className="launcher-tile-kicker">MONETAIRE</span>
              <h2>Draw 3</h2>
              <p>Read the deal. Build the line.</p>
            </div>
            <span className="launcher-tile-action">PLAY <b>↗</b></span>
          </div>
        </Link>

        <Link className="launcher-game-tile launcher-robot-tile" href="/robot-combat">
          <div className="launcher-tile-meta">
            <span>02 / ARENA</span>
            <span className="launcher-tile-live">OPEN</span>
          </div>
          <div className="launcher-image-art">
            <img src="/games/bay-13/index.png" alt="Bay 13 robot combat arena" />
            <span className="launcher-image-tag">BAY 13</span>
          </div>
          <div className="launcher-tile-footer">
            <div>
              <span className="launcher-tile-kicker">ROBOT COMBAT</span>
              <h2>Build &amp; fight</h2>
              <p>Assemble a machine. Take it through the gate.</p>
            </div>
            <span className="launcher-tile-action">ENTER <b>↗</b></span>
          </div>
        </Link>
      </section>

      <section className="launcher-bottom-line shell">
        <p>Pick a game and start playing.</p>
        <Link href="/fairness">See the rules behind the play <span>↗</span></Link>
      </section>
    </div>
  );
}
