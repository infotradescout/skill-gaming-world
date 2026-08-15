import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RobotCombatWorkshop } from "@/components/robot-combat-workshop";
import { createStarterRobotBlueprint, getRobotPartCatalog } from "@/domain";
import { getGameTitleByKey } from "@/domain/game-titles";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";

const title = getGameTitleByKey("SGW_ROBOT_COMBAT");

export default async function RobotCombatDevelopmentPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");
  if (!title) redirect("/app");

  return (
    <div className="app-game-room app-robot-room">
      <div className="app-room-topline">
        <Link href="/app">← Games</Link>
        <span>ROBOT COMBAT / BAY 13</span>
      </div>

      <section className="app-room-hero app-robot-hero">
        <div className="app-room-copy">
          <p className="launcher-kicker"><span /> GARAGE 01</p>
          <h1>Build &amp; fight.</h1>
          <p>Make the machine, inspect the tradeoffs, test it alone, then take it through the arena gate.</p>
          <div className="launcher-action-row">
            <Link className="launcher-secondary-link" href="/app/robot-combat/runtime">
              Open arena preview <span>↗</span>
            </Link>
          </div>
        </div>
        <div className="app-room-visual app-arena-visual">
          <img src="/games/bay-13/index.png" alt="Bay 13 robot combat arena" />
          <span>BAY 13 / THE SCRAPYARD</span>
        </div>
      </section>

      <RobotCombatWorkshop
        playerId={user.id}
        catalog={getRobotPartCatalog()}
        starterBlueprints={{
          PUSHER: createStarterRobotBlueprint("PUSHER"),
          CONTROL: createStarterRobotBlueprint("CONTROL"),
          STRIKER: createStarterRobotBlueprint("STRIKER"),
        }}
      />
    </div>
  );
}
