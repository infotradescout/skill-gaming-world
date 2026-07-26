import Link from "next/link";
import { AppPageHeader } from "@/components/app-shell";
import { EmptyState, StatusPill, TrustDisclosure } from "@/components/page-elements";

export default function PlayerDashboardPage() {
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
        <div className="stat surface-soft"><span>Play Coin balance</span><strong>—</strong></div>
        <div className="stat surface-soft"><span>Completed games</span><strong>—</strong></div>
        <div className="stat surface-soft"><span>Current rank</span><strong>—</strong></div>
        <div className="stat surface-soft"><span>Achievements</span><strong>—</strong></div>
      </div>
      <section className="app-section">
        <div className="app-section-header">
          <div><p className="eyebrow">Activity</p><h2>Recent sessions</h2></div>
        </div>
        <EmptyState symbol="≡" title="No account-backed sessions loaded">
          <p>Practice locally or log in with an account that has existing game history.</p>
        </EmptyState>
      </section>
    </>
  );
}
