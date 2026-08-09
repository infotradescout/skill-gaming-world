import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { EmptyState, StatusPill, TrustDisclosure } from "@/components/page-elements";
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
  return (
    <>
      {welcome === "1" ? (
        <section className="surface-soft" role="status">
          <p className="eyebrow">Welcome to Skill Gaming World</p>
          <h2>You can judge our games before money ever enters the picture.</h2>
          <p>
            Every game is built to use the same rules, odds, scoring, and fairness
            system in free play that it would use if real-money play is later enabled
            where legally permitted. Today&apos;s Play Coins are free, valueless, and
            cannot be cashed out. Real-money play is not available and will remain
            prohibited anywhere it is not legally authorized.
          </p>
        </section>
      ) : null}
      <AppPageHeader eyebrow="Player dashboard" title="Your next deliberate move.">
        <p>No sample activity is inserted. Account-backed sessions and balances appear only when loaded.</p>
      </AppPageHeader>
      <div className="dashboard-grid">
        <section className="dashboard-primary surface">
          <div>
            <StatusPill tone="live">Practice available</StatusPill>
            <h2>Monetaire Draw 3</h2>
            <p>
              Open the deterministic practice deal. Your in-progress board is saved on
              this device.
            </p>
          </div>
          <Link
            className="button button-primary"
            href={
              activePractice
                ? `/app/monetaire/practice?session=${encodeURIComponent(activePractice.id)}`
                : "/app/monetaire/practice"
            }
          >
            {activePractice ? "Resume practice" : "Start practice"}
          </Link>
        </section>
        <TrustDisclosure compact />
      </div>
      <div className="grid-4 app-stat-grid">
        <div className="stat surface-soft"><span>Play Coin balance</span><strong>{projection.playCoinBalanceMinor.toLocaleString()}</strong></div>
        <div className="stat surface-soft"><span>Completed games</span><strong>{projection.completedGames}</strong></div>
        <div className="stat surface-soft">
          <span>Current rank</span>
          <strong>
            {projection.currentRank
              ? `#${projection.currentRank.rank}${projection.currentRank.tied ? " · tied" : ""}`
              : "—"}
          </strong>
        </div>
        <div className="stat surface-soft"><span>Achievements</span><strong>{projection.achievements.filter((item) => item.awardedAt).length}</strong></div>
      </div>
      <section className="app-section">
        <div className="app-section-header">
          <div><p className="eyebrow">Activity</p><h2>Recent sessions</h2></div>
        </div>
        {projection.recentSessions.length ? (
          <div className="data-list surface-soft">
            {projection.recentSessions.map((session) => (
              <div className="data-row" key={session.id}>
                <div><strong>{session.mode === "PRACTICE" ? "Practice" : "Noncash competition"}</strong><small>{new Date(session.startedAt).toLocaleString()}</small></div>
                <span>{session.status}</span>
                {session.status === "ACTIVE" ? (
                  <Link
                    className="button button-quiet"
                    href={
                      session.mode === "PRACTICE"
                        ? `/app/monetaire/practice?session=${encodeURIComponent(session.id)}`
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
          <EmptyState symbol="≡" title="No account-backed sessions loaded">
            <p>Start a practice game to create your first authoritative record.</p>
          </EmptyState>
        )}
      </section>
    </>
  );
}
