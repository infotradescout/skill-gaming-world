import Link from "next/link";

const games = [
  {
    badge: "Flagship",
    title: "Monetaire",
    copy: "Competitive solitaire where every player faces the same deal.",
    href: "/app/monetaire/practice",
    action: "Play now",
    art: "cards",
  },
  {
    badge: "On hold",
    title: "Fortune Dice",
    copy: "Casino-style game execution is not available in the current product.",
    href: "/casino",
    action: "View status",
    art: "dice",
  },
  {
    badge: "Ranked",
    title: "Daily Deal",
    copy: "One board. One clock. The cleanest score climbs.",
    href: "/app/monetaire/competitions",
    action: "View challenge",
    art: "crown",
  },
];

const standards = [
  ["Same rules", "The published rules never change mid-game."],
  ["Visible odds", "Every chance-based game shows how outcomes work."],
  ["No paid edge", "Coins never buy better odds, easier deals, hints, or time."],
  ["Verifiable rounds", "Game records make disputed results reviewable."],
];

export default function HomePage() {
  return (
    <>
      <section className="world-hero">
        <div className="world-hero-glow" />
        <div className="shell world-hero-grid">
          <div className="world-hero-copy">
            <div className="live-kicker"><span /> Games are open</div>
            <p className="eyebrow">Skill Gaming World</p>
            <h1>Play where <em>fair means provable.</em></h1>
            <p className="world-lead">
              Original games. Transparent rules. No bought advantage. Build your
              record in Monetaire and climb ranked challenges. Casino modes remain
              unavailable unless their separate legal and operating gates are approved.
            </p>
            <div className="button-row">
              <Link className="button button-primary button-large" href="/auth/register">
                Create player profile
              </Link>
              <Link className="button button-glass button-large" href="#games">
                Explore games
              </Link>
            </div>
            <div className="hero-proof">
              <span><b>100%</b> player-earned rank</span>
              <span><b>0</b> paid advantages</span>
              <span><b>Every</b> result reviewable</span>
            </div>
          </div>

          <div className="hero-table" aria-label="Monetaire game preview">
            <div className="table-topline">
              <span>Monetaire · Live table</span>
              <span className="table-verified">✓ Deal verified</span>
            </div>
            <div className="mini-board">
              <div className="deck-stack"><span>SGW</span></div>
              <div className="playing-card red-card card-a"><b>A</b><i>♥</i></div>
              <div className="playing-card card-k"><b>K</b><i>♠</i></div>
              <div className="playing-card red-card card-q"><b>Q</b><i>♦</i></div>
              <div className="playing-card card-j"><b>J</b><i>♣</i></div>
              <div className="foundation-slot">A</div>
              <div className="foundation-slot">A</div>
            </div>
            <div className="table-score">
              <div><small>Current score</small><strong>4,280</strong></div>
              <div><small>Moves</small><strong>63</strong></div>
              <div><small>Rank pace</small><strong>#12</strong></div>
            </div>
            <Link href="/app/monetaire/practice" className="table-play">
              Take the table <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="lobby-section shell" id="games">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Game floor</p>
            <h2>Choose your table.</h2>
          </div>
          <Link href="/fairness">How we prove fair play →</Link>
        </div>
        <div className="game-grid">
          {games.map((game) => (
            <Link className={`game-tile game-${game.art}`} href={game.href} key={game.title}>
              <div className="game-tile-art" aria-hidden="true">
                {game.art === "cards" && <><span>A♠</span><span>Q♥</span><span>J♣</span></>}
                {game.art === "dice" && <><span>⚄</span><span>⚅</span></>}
                {game.art === "crown" && <span>♛</span>}
              </div>
              <div className="game-tile-copy">
                <small>{game.badge}</small>
                <h3>{game.title}</h3>
                <p>{game.copy}</p>
                <strong>{game.action} <span>→</span></strong>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="trust-band">
        <div className="shell">
          <div className="trust-band-heading">
            <p className="eyebrow">The house standard</p>
            <h2>Trust should be built into the game.</h2>
            <p>
              We do not ask players to take fairness on faith. Rules, scoring,
              timing, and outcome records are part of the product.
            </p>
          </div>
          <div className="standards-grid">
            {standards.map(([title, copy], index) => (
              <div key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="join-banner shell">
        <div>
          <p className="eyebrow">Your record starts here</p>
          <h2>Find your game. Prove your skill.</h2>
        </div>
        <Link className="button button-primary button-large" href="/auth/register">
          Join Skill Gaming World
        </Link>
      </section>
    </>
  );
}
