import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { StatusPill } from "@/components/page-elements";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { demoAchievementProjection } from "@/lib/achievements";
import { getRuntimeEnv } from "@/lib/env";
import { refreshPersistentAchievements } from "@/lib/persistent-projections";

export default async function AchievementsPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");
  const projected = getRuntimeEnv().DEMO_MODE
    ? demoAchievementProjection(user.id)
    : await refreshPersistentAchievements(user.id);
  return (
    <>
      <AppPageHeader eyebrow="Recognition" title="Achievements">
        <p>Achievements have no cash, redemption, transfer, or prize value.</p>
      </AppPageHeader>
      <div className="achievement-grid">
        {projected.map((achievement, index) => (
          <article className="achievement-card surface-soft" key={achievement.title}>
            <span className="achievement-seal" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <StatusPill tone={achievement.awardedAt ? "live" : "hold"}>{achievement.awardedAt ? "Earned" : "Not earned"}</StatusPill>
            <h2>{achievement.title}</h2>
            <p>{achievement.description}</p>
          </article>
        ))}
      </div>
    </>
  );
}
