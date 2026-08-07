import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppPageHeader } from "@/components/app-shell";
import { EmptyState, StatusPill, TrustDisclosure } from "@/components/page-elements";
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
        eyebrow="Free side · In development"
        title={title.workingTitle}
        actions={
          <Link className="button button-secondary" href="/robot-combat">
            Public development page
          </Link>
        }
      >
        <p>{title.publicSummary}</p>
      </AppPageHeader>

      <div className="dashboard-grid">
        <section className="dashboard-primary surface">
          <div>
            <StatusPill tone="hold">Foundation only</StatusPill>
            <h2>Match controls are not available</h2>
            <p>
              The Blender asset generator can produce the arena, starter bots, part
              library, GLB exports, and manifest. Driving, weapons, damage, garage
              construction, blueprint validation, and online matches remain blocked
              until the Godot runtime vertical slice is implemented and tested.
            </p>
          </div>
        </section>
        <TrustDisclosure compact />
      </div>

      <section className="app-section">
        <div className="app-section-header">
          <div>
            <p className="eyebrow">Offering tuple</p>
            <h2>Free-side development information only</h2>
          </div>
        </div>
        <div className="data-list surface-soft">
          <div className="data-row">
            <div>
              <strong>Side</strong>
              <small>Initial public offering</small>
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
              <small>Legal Play not activated</small>
            </div>
            <span>{title.legalOfferingClass}</span>
          </div>
        </div>
      </section>

      <EmptyState symbol="⚙" title="No match entry yet">
        <p>
          There is intentionally no button to start a robot combat match. The next build
          must prove driving, weapons, training opponent, garage validation, and server
          authority before any match surface is exposed.
        </p>
      </EmptyState>
    </>
  );
}
