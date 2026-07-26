import { AppPageHeader } from "@/components/app-shell";
import { CompetitionPanel } from "@/components/competition-panel";
import { LockedNotice } from "@/components/page-elements";
import { runtimeCompetitionSnapshot } from "@/lib/runtime-competition";

export default async function AppCompetitionsPage() {
  const competition = await runtimeCompetitionSnapshot().catch(() => null);
  return (
    <>
      <AppPageHeader eyebrow="Ranked Play" title="Competitions">
        <p>Published noncash events use one immutable deal and a disclosed ranking formula.</p>
      </AppPageHeader>
      {competition ? (
        <CompetitionPanel allowEntry initialCompetition={competition} />
      ) : (
        <LockedNotice title="Ranked publication is unavailable.">
          <p>
            Entry fails closed until the active server publication source is
            configured and reachable.
          </p>
        </LockedNotice>
      )}
      <div className="app-section">
        <LockedNotice title="Prize competitions are unavailable.">
          <p>
            Separate Skill Prize verification, current physical-location evidence,
            jurisdiction approval, accepted rules, and explicit server authorization
            would all be required; none is present.
          </p>
        </LockedNotice>
      </div>
    </>
  );
}
