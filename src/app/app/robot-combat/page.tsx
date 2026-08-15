import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RobotCombatWorkshop } from "@/components/robot-combat-workshop";
import {
  createStarterRobotBlueprint,
  getRobotPartCatalog,
} from "@/domain";
import { getGameTitleByKey } from "@/domain/game-titles";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";

const title = getGameTitleByKey("SGW_ROBOT_COMBAT");

export default async function RobotCombatDevelopmentPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");
  if (!title) redirect("/app");

  return (
    <div className="game-room robot-room">
      <div className="room-topline">
        <Link href="/app">← Lobby</Link>
        <span>ROBOT COMBAT · WORKSHOP 01</span>
      </div>
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
