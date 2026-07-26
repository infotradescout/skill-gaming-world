import type { Metadata } from "next";
import Link from "next/link";
import { CompetitionPanel } from "@/components/competition-panel";
import { runtimeCompetitionSnapshot } from "@/lib/runtime-competition";
import {
  LockedNotice,
  PageHero,
  Section,
  StatusPill,
} from "@/components/page-elements";

export const metadata: Metadata = { title: "Monetaire Competitions" };
export const dynamic = "force-dynamic";

export default async function CompetitionsPage() {
  const competition = await runtimeCompetitionSnapshot().catch(() => null);
  return (
    <>
      <PageHero
        eyebrow="Monetaire competitions"
        title={
          <>
            Same deal.
            <br />
            <em>Public formula.</em>
          </>
        }
        actions={
          <Link className="button button-secondary" href="/fairness">
            Read the fairness contract
          </Link>
        }
        aside={
          <div className="competition-formula surface">
            <StatusPill tone="live">Noncash only</StatusPill>
            <ol>
              <li><span>01</span>Completed games</li>
              <li><span>02</span>Fewest valid moves</li>
              <li><span>03</span>Verified active time</li>
              <li><span>=</span>Exact ties remain tied</li>
            </ol>
          </div>
        }
      >
        <p>
          Ranked Play competitions compare player decisions on one immutable deal.
          Results create rank and achievements—not cash or valuable prizes.
        </p>
      </PageHero>

      <Section eyebrow="Open events" title="Nothing is silently simulated.">
        {competition ? (
          <CompetitionPanel initialCompetition={competition} />
        ) : (
          <LockedNotice title="Ranked publication is unavailable.">
            <p>
              No competition is shown without a reachable server publication
              source. No entrant or leaderboard is fabricated.
            </p>
          </LockedNotice>
        )}
        <div className="callout">
          <p>
            Prize competitions are unavailable unless separately enabled for an
            eligible player and jurisdiction. Play Coins cannot fund a prize entry.
          </p>
        </div>
      </Section>
    </>
  );
}
