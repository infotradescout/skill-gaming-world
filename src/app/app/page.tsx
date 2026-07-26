import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { EmptyState, StatusPill, TrustDisclosure } from "@/components/page-elements";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { getDemoStore, playCoinBalance } from "@/lib/demo-store";
import { getRuntimeEnv } from "@/lib/env";
import { persistentPlayerProjection } from "@/lib/persistent-projections";

export default async function PlayerDashboardPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");
  const env = getRuntimeEnv();
  const projection = env.DEMO_MODE
    ? {
        playCoinBalanceMinor: playCoinBalance(user.id),
        completedGames: [...getDemoStore().gameSessionsById.values()].filter(
          (session) => session.userId === user.id && session.state.status === "WON",
        ).length,
        currentRank: null,
        achievements: [],
        recentSessions: [...getDemoStore().gameSessionsById.values()]
          .filter((session) => session.userId === user.id)
          .map((session) => ({
            id: session.id,
            mode: session.mode,
            status: session.state.status,
            startedAt: session.createdAt,
          })),
      }
    : await persistentPlayerProjection(user.id);
  return (
    <>
      <AppPageHeader eyebrow="Player dashboard" title="Your next deliberate move.">
        <p>No sample activity is inserted. Account-backed sessions and balances appear only when loaded.</p>
      </AppPageHeader>
      <div className="dashboard-grid">
        <section className="dashboard-primary surface">
          <div>
            <StatusPill tone="live">Practice available</StatusPill>
            <h2>Monetaire Draw 1</h2>
            <p>
              Open the deterministic practice deal. Your in-progress board is saved on
              this device.
            </p>
          </div>
          <Link className="button button-primary" href="/app/monetaire/practice">
            Continue to practice
          </Link>
        </section>
        <TrustDisclosure compact />
      </div>
      <div className="grid-4 app-stat-grid">
        <div className="stat surface-soft"><span>Play Coin balance</span><strong>{projection.playCoinBalanceMinor.toLocaleString()}</strong></div>
        <div className="stat surface-soft"><span>Completed games</span><strong>{projection.completedGames}</strong></div>
        <div className="stat surface-soft"><span>Current rank</span><strong>{projection.currentRank ?? "—"}</strong></div>
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
