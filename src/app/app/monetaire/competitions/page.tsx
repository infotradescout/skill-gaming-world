import { AppPageHeader } from "@/components/app-shell";
import { CompetitionPanel } from "@/components/competition-panel";
import { LockedNotice } from "@/components/page-elements";
import { publicCompetitionSnapshotIfAvailable } from "@/lib/competition-catalog";

export default function AppCompetitionsPage() {
  const competition = publicCompetitionSnapshotIfAvailable();
  return (
    <>
      <AppPageHeader eyebrow="Ranked Play" title="Competitions">
        <p>Published noncash events use one immutable deal and a disclosed ranking formula.</p>
      </AppPageHeader>
      {competition ? (
        <CompetitionPanel allowEntry initialCompetition={competition} />
      ) : (
        <LockedNotice title="Ranked demo publication is unavailable.">
          <p>
            Entry fails closed until a dedicated encrypted publication key and
            safe-demo catalog are configured.
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
