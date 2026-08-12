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
        eyebrow="Robot Combat · Workshop first"
        title={title.workingTitle}
      >
        <p>Build a machine, see what the design changes, save the revision, and take it through the free arena gate.</p>
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
