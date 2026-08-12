import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { RobotCombatArena } from "@/components/robot-combat-arena";
import { getRobotPartCatalog } from "@/domain";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { getRobotMatch, RobotCombatServiceError } from "@/lib/robot-combat-service";

export const dynamic = "force-dynamic";

export default async function RobotCombatArenaPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");

  const { matchId } = await params;
  let match;
  try {
    match = await getRobotMatch({ user, matchId });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) redirect("/app/robot-combat");
    throw error;
  }

  return (
    <>
      <AppPageHeader eyebrow="Robot Combat · live authority" title="Authority arena">
        <p>This browser surface is the development harness for the real match state: controls, damage, terminal results, and rebuild questions are server-recorded.</p>
      </AppPageHeader>
      <RobotCombatArena
        playerId={user.id}
        initialMatch={match}
        catalog={getRobotPartCatalog()}
      />
    </>
  );
}
