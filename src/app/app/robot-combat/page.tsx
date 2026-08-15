import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppPageHeader } from "@/components/app-shell";
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
    <>
      <AppPageHeader
        eyebrow="Robot Combat · build / test / fight"
        title="Build a machine that teaches you back."
      >
        <p>Choose a fighting style, tune the parts, test what changes, and take a ready machine into a free match.</p>
      </AppPageHeader>
      <RobotCombatWorkshop
        playerId={user.id}
        catalog={getRobotPartCatalog()}
        starterBlueprints={{
          PUSHER: createStarterRobotBlueprint("PUSHER"),
          CONTROL: createStarterRobotBlueprint("CONTROL"),
          STRIKER: createStarterRobotBlueprint("STRIKER"),
        }}
      />
    </>
  );
}
