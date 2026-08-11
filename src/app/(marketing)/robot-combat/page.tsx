import type { Metadata } from "next";
import Link from "next/link";

import { FeatureCard, PageHero, Section, StatusPill } from "@/components/page-elements";
import { getGameTitleByKey } from "@/domain/game-titles";

const title = getGameTitleByKey("SGW_ROBOT_COMBAT");

export const metadata: Metadata = {
  title: "Robot Combat · Skill Gaming World",
  description:
    "Build, inspect, test, and eventually fight from your own machine revision inside Skill Gaming World.",
};

export default function RobotCombatMarketingPage() {
  if (!title) return null;

  return (
    <>
      <PageHero
        eyebrow="Skill Gaming World · Free game in development"
        title="Build the machine. Learn what it does."
        actions={
          <>
            <Link className="button button-primary" href="/auth/login">
              Enter the workshop
            </Link>
            <Link className="button button-secondary" href="/">
              Back to game floor
            </Link>
          </>
        }
      >
        <p>{title.publicSummary}</p>
        <p>
          This is the game behind the Skill Gaming World surface: the workshop and
          arena are being built as one product, with every machine revision inspected
          before it can enter a match.
        </p>
      </PageHero>

      <Section eyebrow="The real loop" title="Workshop first. Arena second. Evidence after every fight.">
        <div className="grid-3">
          <FeatureCard
            number="01"
            title="Assemble a personal machine"
            status={<StatusPill tone="live">Building now</StatusPill>}
          >
            Change frames, drives, power, armor, and weapons. The server records a
            revision instead of treating a fixed starter roster as the game.
          </FeatureCard>
          <FeatureCard
            number="02"
            title="Understand the consequences"
            status={<StatusPill tone="live">Inspection wired</StatusPill>}
          >
            Mass, power, balance, clearance, connections, and the force path are
            visible checks. A rejected machine tells you what to rebuild.
          </FeatureCard>
          <FeatureCard
            number="03"
            title="Fight from a valid revision"
            status={<StatusPill tone="hold">Online rollout next</StatusPill>}
          >
            Match state, ready gates, commands, damage, terminal outcomes, and
            disconnects now have an authority contract. Hosted deployment and full
            browser reachability still need proof.
          </FeatureCard>
        </div>
      </Section>

      <Section eyebrow="Truthful status" title="What is available today">
        <div className="play-availability callout">
          <StatusPill tone="hold">In active development</StatusPill>
          <p>
            The workshop can save inspection-valid revisions through the authenticated
            app. The match authority and database contract are being wired next. There
            is no wagering, deposit, prize, payout, or purchased performance path.
          </p>
        </div>
      </Section>
    </>
  );
}
