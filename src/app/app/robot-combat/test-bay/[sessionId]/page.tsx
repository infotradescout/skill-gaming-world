import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppPageHeader } from "@/components/app-shell";
import { RobotCombatTestBay } from "@/components/robot-combat-test-bay";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import {
  getRobotTestSession,
  RobotCombatServiceError,
} from "@/lib/robot-combat-service";

export const dynamic = "force-dynamic";

export default async function RobotCombatTestBayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");

  const { sessionId } = await params;
  let test;
  try {
    test = await getRobotTestSession({ user, sessionId });
  } catch (error) {
    if (error instanceof RobotCombatServiceError) redirect("/app/robot-combat");
    throw error;
  }

  return (
    <>
      <AppPageHeader eyebrow="Robot Combat · build / test / rebuild" title="Private test bay">
        <p>Run the saved machine against a marked contact gate and training target. The server records the consequences so the next rebuild starts with evidence.</p>
      </AppPageHeader>
      <RobotCombatTestBay initialTest={test} />
    </>
  );
}
