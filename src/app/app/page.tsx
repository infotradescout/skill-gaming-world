import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { EmptyState, TrustDisclosure } from "@/components/page-elements";
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

  return (
    <>
      {welcome === "1" ? (
        <section className="welcome-strip surface-soft" role="status">
          <div>
            <p className="eyebrow">Welcome to Skill Gaming World</p>
            <h2>Play first. Decide what you like.</h2>
            <p>
              Start with a free game, see how it feels, and keep your progress in one
              place. Play Coins are for entertainment only and have no cash value.
            </p>
          </div>
          <Link className="text-link" href="/legal/play-coins">Read the Play Coin terms →</Link>
        </section>
      ) : null}

      <AppPageHeader eyebrow="Your game world" title="Choose what to play.">
        <p>
          Play a hand of Draw 3 solitaire, or build a machine and learn what happens
          when it reaches the arena.
        </p>
      </AppPageHeader>

      <section className="world-launchpad surface">
        <div className="world-launchpad-heading">
          <div>
            <p className="eyebrow">Start here</p>
            <h2>Two games. One place to play.</h2>
          </div>
          <span className="muted small">Free play is available now.</span>
        </div>

        <div className="app-game-grid">
          <Link className="app-game-card app-game-card-monetaire" href={monetaireHref}>
            <div className="app-game-art app-game-art-cards" aria-hidden="true">
              <span className="game-card game-card-back" />
              <span className="game-card game-card-front">
                <b>Q</b>
                <i>♠</i>
              </span>
              <span className="game-card game-card-front game-card-front-offset">
                <b>3</b>
                <i>♦</i>
              </span>
            </div>
            <div className="app-game-card-copy">
              <div className="app-game-card-meta">
                <span>Monetaire</span>
                <span>Draw 3</span>
              </div>
              <h3>Make the next move.</h3>
              <p>
                Fast, focused solitaire with a clear score and a practice hand ready
                when you are.
              </p>
              <span className="app-game-card-action">
                {activePractice ? "Resume Draw 3" : "Play Draw 3"} <span>→</span>
              </span>
            </div>
          </Link>

          <Link className="app-game-card app-game-card-robot" href="/app/robot-combat">
            <div className="app-game-art app-game-art-robot" aria-hidden="true">
              <div className="game-robot-visual">
                <span className="game-robot-wheel game-robot-wheel-left" />
                <span className="game-robot-wheel game-robot-wheel-right" />
                <span className="game-robot-body">
                  <span className="game-robot-wedge" />
                  <span className="game-robot-weapon" />
                </span>
              </div>
              <span className="game-grid-label">BUILD / TEST / FIGHT</span>
            </div>
            <div className="app-game-card-copy">
              <div className="app-game-card-meta">
                <span>Robot Combat</span>
                <span>In development</span>
              </div>
              <h3>Build something that hits back.</h3>
              <p>
                Choose a fighting style, tune the machine, test the consequences, and
                take a ready build into a free match.
              </p>
              <span className="app-game-card-action">Enter the workshop <span>→</span></span>
            </div>
          </Link>
        </div>
      </section>

      <section className="world-lower-grid">
        <div className="grid-4 app-stat-grid world-stat-grid">
          <div className="stat surface-soft"><span>Play Coin balance</span><strong>{projection.playCoinBalanceMinor.toLocaleString()}</strong></div>
          <div className="stat surface-soft"><span>Completed games</span><strong>{projection.completedGames}</strong></div>
          <div className="stat surface-soft">
            <span>Current rank</span>
            <strong>
              {projection.currentRank
                ? "#" + projection.currentRank.rank + (projection.currentRank.tied ? " · tied" : "")
                : "—"}
            </strong>
          </div>
          <div className="stat surface-soft"><span>Achievements</span><strong>{projection.achievements.filter((item) => item.awardedAt).length}</strong></div>
        </div>
        <TrustDisclosure compact />
      </section>

      <section className="app-section world-activity">
        <div className="app-section-header">
          <div>
            <p className="eyebrow">Your progress</p>
            <h2>Recent sessions</h2>
          </div>
        </div>
        {projection.recentSessions.length ? (
          <div className="data-list surface-soft">
            {projection.recentSessions.map((session) => (
              <div className="data-row" key={session.id}>
                <div>
                  <strong>{session.mode === "PRACTICE" ? "Draw 3 practice" : "Noncash competition"}</strong>
                  <small>{new Date(session.startedAt).toLocaleString()}</small>
                </div>
                <span>{session.status}</span>
                {session.status === "ACTIVE" ? (
                  <Link
                    className="button button-quiet"
                    href={
                      session.mode === "PRACTICE"
                        ? "/app/monetaire/practice?session=" + encodeURIComponent(session.id)
                        : "/app/monetaire/competitions"
                    }
                  >
                    Resume
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState symbol="✦" title="Your first game is waiting">
            <p>Play a practice game and your sessions will appear here.</p>
          </EmptyState>
        )}
      </section>
    </>
  );
}
