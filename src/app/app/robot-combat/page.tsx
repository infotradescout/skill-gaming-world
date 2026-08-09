import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppPageHeader } from "@/components/app-shell";
import { StatusPill, TrustDisclosure } from "@/components/page-elements";
import { getGameTitleByKey } from "@/domain/game-titles";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";

const title = getGameTitleByKey("SGW_ROBOT_COMBAT");

export default async function RobotCombatDevelopmentPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");
  if (!title) redirect("/app");

  return (
    <>
      <AppPageHeader
        eyebrow="Free side · Playable training"
        title={title.workingTitle}
        actions={
          <>
            <Link className="button button-primary" href="/games/bay-13/index.html">
              Play full screen
            </Link>
            <Link className="button button-secondary" href="/robot-combat">
              Public game page
            </Link>
          </>
        }
      >
        <p>{title.publicSummary}</p>
      </AppPageHeader>

      <div className="dashboard-grid">
        <section className="dashboard-primary surface">
          <div>
            <StatusPill tone="live">Training available</StatusPill>
            <h2>Bring one approved machine through the gate.</h2>
            <p>
              Choose Yard Mule, Keelcutter, or Pilebreaker. Drive, fire the weapon,
              fight the local training machine, reset the match, then rebuild in the
              garage with live mass and power checks.
            </p>
            <Link className="button button-primary" href="/games/bay-13/index.html">
              Enter Bay 13
            </Link>
          </div>
        </section>
        <TrustDisclosure compact />
      </div>

      <section className="app-section">
        <div className="app-section-header">
          <div>
            <p className="eyebrow">Offering tuple</p>
            <h2>Free-side gameplay with no value path</h2>
          </div>
        </div>
        <div className="data-list surface-soft">
          <div className="data-row">
            <div>
              <strong>Side</strong>
              <small>Current playable offering</small>
            </div>
            <span>{title.side}</span>
          </div>
          <div className="data-row">
            <div>
              <strong>Category</strong>
              <small>Skill classification</small>
            </div>
            <span>{title.category}</span>
          </div>
          <div className="data-row">
            <div>
              <strong>Value class</strong>
              <small>No redeemable value</small>
            </div>
            <span>{title.valueClass}</span>
          </div>
          <div className="data-row">
            <div>
              <strong>Legal offering class</strong>
              <small>No Legal Play bridge exists</small>
            </div>
            <span>{title.legalOfferingClass}</span>
          </div>
        </div>
      </section>

      <section className="app-section">
        <div className="callout">
          <StatusPill tone="hold">Hosted PvP unavailable</StatusPill>
          <p>
            This release proves the complete local training loop. Matchmaking, private
            rooms, spectators, reconnects, hosted authoritative servers, and ranked
            online play remain a separate release.
          </p>
        </div>
      </section>
    </>
  );
}
