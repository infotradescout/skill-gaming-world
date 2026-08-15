import { cookies } from "next/headers";
import Link from "next/link";
import { CardStudy } from "@/components/card-art";
import { redirect } from "next/navigation";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { runtimePlayerProjection } from "@/lib/runtime-player-projection";

export default async function PlayerDashboardPage() {
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
    <div className="app-launcher">
      <section className="app-launcher-intro">
        <div>
          <p className="launcher-kicker"><span /> GAME SELECT</p>
          <h1>Choose your game.</h1>
          <p>Pick up where you left off, or start a new table.</p>
        </div>
        <span className="app-launcher-account">{user.displayName || "PLAYER"}</span>
      </section>

      <section className="launcher-game-grid launcher-game-grid-auth" aria-label="Choose a game">
        <Link className="launcher-game-tile launcher-monetaire-tile" href={monetaireHref}>
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
              <h2>{activePractice ? "Resume Draw 3" : "Draw 3"}</h2>
              <p>{activePractice ? "Your hand is waiting." : "Read the deal. Build the line."}</p>
            </div>
            <span className="launcher-tile-action">{activePractice ? "RESUME" : "PLAY"} <b>↗</b></span>
          </div>
        </Link>

        <Link className="launcher-game-tile launcher-robot-tile" href="/app/robot-combat">
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

      <section className="app-launcher-bottom">
        <span>FREE PLAY</span>
        <span>PLAY COINS {projection.playCoinBalanceMinor.toLocaleString()}</span>
        <Link href="/app/wallet">Account &amp; play controls <span>↗</span></Link>
      </section>
    </div>
  );
}
