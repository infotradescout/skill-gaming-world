import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="public-hero">
        <div className="public-hero-grid shell">
          <div className="public-hero-copy">
            <p className="public-kicker">
              <span className="public-kicker-dot" />
              Skill Gaming World
            </p>
            <h1>
              Pick a game.
              <br />
              <em>Make the next move.</em>
            </h1>
            <p className="public-hero-lead">
              A small world of skill games with rules you can understand before
              you play and choices you can feel while you play.
            </p>
            <div className="public-action-row">
              <Link className="public-primary-button" href="#games">
                Enter the game floor
              </Link>
              <Link className="public-text-link" href="/fairness">
                See the fair-play promise <span>↗</span>
              </Link>
            </div>
            <div className="public-hero-rhythm" aria-label="What stays true">
              <span><b>Clear</b> rules</span>
              <span><b>Free</b> practice</span>
              <span><b>No</b> paid edge</span>
            </div>
          </div>

          <div className="public-hero-mark" aria-hidden="true">
            <div className="public-hero-orbit public-hero-orbit-one" />
            <div className="public-hero-orbit public-hero-orbit-two" />
            <div className="public-hero-token public-hero-token-one">A</div>
            <div className="public-hero-token public-hero-token-two">⚙</div>
            <div className="public-hero-token public-hero-token-three">3</div>
            <div className="public-hero-mark-core">
              <span>SG</span>
              <small>PLAY<br />WELL</small>
            </div>
          </div>
        </div>
      </section>

      <section className="public-game-floor shell" id="games">
        <div className="public-section-intro">
          <div>
            <p className="public-kicker">The game floor</p>
            <h2>Two games. Different kinds of focus.</h2>
          </div>
          <p>
            Start with the table, or head to the garage. Both paths are built
            around the next decision—not a wall of menus.
          </p>
        </div>

        <div className="public-game-door-grid">
          <Link className="public-game-door public-monetaire-door" href="/monetaire">
            <div className="public-door-topline">
              <span>01 / Table game</span>
              <span className="public-door-status">Play free</span>
            </div>
            <div className="public-door-art public-card-door-art" aria-hidden="true">
              <span className="public-door-card public-door-card-back" />
              <span className="public-door-card public-door-card-red">Q<span>♥</span></span>
              <span className="public-door-card public-door-card-black">K<span>♠</span></span>
              <span className="public-door-card public-door-card-gold">3<span>♦</span></span>
            </div>
            <div className="public-door-copy">
              <p>Monetaire</p>
              <h3>Read the board. Build the line.</h3>
              <span>Draw 3 solitaire with a sharper rhythm <b>↗</b></span>
            </div>
          </Link>

          <Link className="public-game-door public-robot-door" href="/robot-combat">
            <div className="public-door-topline">
              <span>02 / Workshop game</span>
              <span className="public-door-status">Try the garage</span>
            </div>
            <div className="public-door-art public-robot-door-art" aria-hidden="true">
              <div className="public-robot-silhouette">
                <span className="public-robot-eye" />
                <span className="public-robot-arm public-robot-arm-left" />
                <span className="public-robot-arm public-robot-arm-right" />
                <span className="public-robot-wheel public-robot-wheel-left" />
                <span className="public-robot-wheel public-robot-wheel-right" />
              </div>
              <span className="public-robot-spark public-robot-spark-one">+</span>
              <span className="public-robot-spark public-robot-spark-two">×</span>
            </div>
            <div className="public-door-copy">
              <p>Robot Combat</p>
              <h3>Build a machine. Find its edge.</h3>
              <span>Assemble, tune, test, then take the arena <b>↗</b></span>
            </div>
          </Link>
        </div>
      </section>

      <section className="public-standard-band">
        <div className="public-standard-grid shell">
          <div className="public-standard-lead">
            <p className="public-kicker">The house standard</p>
            <h2>Nothing important hides behind the interface.</h2>
          </div>
          <div className="public-standard-list">
            <div><span>01</span><p><b>Rules first.</b> Know what counts before the round begins.</p></div>
            <div><span>02</span><p><b>Choices matter.</b> Skill changes the route, not the price tag.</p></div>
            <div><span>03</span><p><b>Controls stay yours.</b> Practice, pause, and play on your terms.</p></div>
          </div>
        </div>
      </section>

      <section className="public-join-strip shell">
        <div>
          <p className="public-kicker">Your turn</p>
          <h2>Start with a free practice game.</h2>
        </div>
        <Link className="public-primary-button" href="/auth/register">
          Create a player profile <span>↗</span>
        </Link>
      </section>
    </>
  );
}
