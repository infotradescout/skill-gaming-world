import { AppPageHeader } from "@/components/app-shell";
import { StatusPill } from "@/components/page-elements";

const achievements = [
  ["First Foundation", "Complete a practice game."],
  ["Measured Finish", "Complete a ranked noncash game under the published rules."],
  ["Clean Sequence", "Finish a verified game without a rejected move."],
  ["Consistency", "Complete eligible sessions across separate days."],
];

export default function AchievementsPage() {
  return (
    <>
      <AppPageHeader eyebrow="Recognition" title="Achievements">
        <p>Achievements have no cash, redemption, transfer, or prize value.</p>
      </AppPageHeader>
      <div className="achievement-grid">
        {achievements.map(([title, description], index) => (
          <article className="achievement-card surface-soft" key={title}>
            <span className="achievement-seal" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <StatusPill tone="hold">Not earned</StatusPill>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </>
  );
}
