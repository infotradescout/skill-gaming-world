import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { runtimePlayerProjection } from "@/lib/runtime-player-projection";

export default async function PlayerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");

  const projection = await runtimePlayerProjection(user.id);
  const activePractice = projection.recentSessions.find(
    (session) => session.mode === "PRACTICE" && session.status === "ACTIVE",
  );
  const monetaireHref = activePractice
    ? "/app/monetaire/practice?session=" + encodeURIComponent(activePractice.id)
    : "/app/monetaire/practice";
  const achievementCount = projection.achievements.filter((item) => item.awardedAt).length;

  return (
    <div className="world-lobby">
      {welcome === "1" ? (
        <div className="lobby-welcome" role="status">
          <span>Welcome in.</span>
          <p>Your table and workshop are ready when you are.</p>
        </div>
      ) : null}

      <header className="lobby-heading">
        <div>
          <p className="eyebrow">The lobby</p>
          <h1>Pick your next game.</h1>
          <p>
            One table game. One build-and-battle game. Start with whichever kind of
            challenge you want right now.
          </p>
        </div>
        <div className="lobby-heading-mark" aria-hidden="true">
          <span>PLAY</span>
          <strong>01</strong>
        </div>
      </header>

      <section className="lobby-stage" aria-label="Choose a game">
        <Link className="lobby-game lobby-game-monetaire" href={monetaireHref}>
          <div className="lobby-game-topline">
            <span>01</span>
            <span>Table game · Draw 3</span>
          </div>
          <div className="lobby-game-visual lobby-visual-cards" aria-hidden="true">
            <span className="lobby-card-shadow" />
            <span className="lobby-card lobby-card-back"><b>MON</b></span>
            <span className="lobby-card lobby-card-queen"><b>Q</b><i>♥</i></span>
            <span className="lobby-card lobby-card-ace"><b>A</b><i>♠</i></span>
            <span className="lobby-suit-orbit">♠ &nbsp; ♥ &nbsp; ♦ &nbsp; ♣</span>
          </div>
          <div className="lobby-game-footer">
            <div>
              <span className="lobby-game-kicker">{activePractice ? "Hand waiting" : "Table open"}</span>
              <h2>Monetaire</h2>
              <p>Draw three cards, build the foundations, and find the line through the deal.</p>
            </div>
            <span className="lobby-game-cta">{activePractice ? "Resume hand" : "Play Draw 3"} <b>↗</b></span>
          </div>
        </Link>

        <Link className="lobby-game lobby-game-robot" href="/app/robot-combat">
          <div className="lobby-game-topline">
            <span>02</span>
            <span>Workshop · Free arena</span>
          </div>
          <div className="lobby-game-visual lobby-visual-robot" aria-hidden="true">
            <span className="lobby-robot-ring lobby-robot-ring-one" />
            <span className="lobby-robot-ring lobby-robot-ring-two" />
            <span className="lobby-robot-wheel lobby-robot-wheel-left" />
            <span className="lobby-robot-wheel lobby-robot-wheel-right" />
            <span className="lobby-robot-body">
              <span className="lobby-robot-wedge" />
              <span className="lobby-robot-weapon" />
              <span className="lobby-robot-light" />
            </span>
            <span className="lobby-robot-label">BAY 13</span>
          </div>
          <div className="lobby-game-footer">
            <div>
              <span className="lobby-game-kicker">Workshop open</span>
              <h2>Robot Combat</h2>
              <p>Choose the build, test the consequence, and put your machine on the line.</p>
            </div>
            <span className="lobby-game-cta">Enter workshop <b>↗</b></span>
          </div>
        </Link>
      </section>

      <section className="lobby-bottom">
        <div className="lobby-continue">
          <div className="lobby-section-label">
            <span>Your place</span>
            <span>Progress stays with you</span>
          </div>
          <div className="lobby-continue-row">
            <div>
              <strong>{activePractice ? "Continue your Draw 3 hand" : "Your first move is waiting"}</strong>
              <p>
                {activePractice
                  ? "Your active hand is saved on this account."
                  : "Open either game to create your first saved session."}
              </p>
            </div>
            <Link className="lobby-inline-action" href={monetaireHref}>
              {activePractice ? "Return to table" : "Start playing"} <span>→</span>
            </Link>
          </div>
        </div>

        <div className="lobby-quick-links">
          <div className="lobby-section-label">
            <span>At a glance</span>
            <span>Account-backed</span>
          </div>
          <div className="lobby-stat-row">
            <span><strong>{projection.completedGames}</strong><small>games</small></span>
            <span><strong>{achievementCount}</strong><small>achievements</small></span>
            <span><strong>{projection.playCoinBalanceMinor.toLocaleString()}</strong><small>coins</small></span>
          </div>
        </div>
      </section>

      <div className="lobby-trust-line">
        <span>Free play is available now.</span>
        <span>Play Coins have no cash value.</span>
        <Link href="/legal/play-coins">Read the rules →</Link>
      </div>
    </div>
  );
}
