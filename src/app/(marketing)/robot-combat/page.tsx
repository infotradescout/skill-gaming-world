import type { Metadata } from "next";
import Link from "next/link";
import { FeatureCard, PageHero, Section, StatusPill } from "@/components/page-elements";
import { getGameTitleByKey } from "@/domain/game-titles";

const title = getGameTitleByKey("SGW_ROBOT_COMBAT");

export const metadata: Metadata = {
  title: "SGW Robot Combat",
  description:
    "Original robot construction and combat title in development inside Skill Gaming World.",
};

export default function RobotCombatMarketingPage() {
  if (!title) {
    return null;
  }

  return (
    <>
      <PageHero
        eyebrow="Skill Gaming World · Free side"
        title={title.workingTitle}
        actions={
          <Link className="button button-secondary" href="/">
            Back to game floor
          </Link>
        }
      >
        <p>{title.publicSummary}</p>
        <p>
          This title is under active asset and rules foundation work. Match controls,
          damage simulation, garage construction, and online play are not available yet.
        </p>
      </PageHero>

      <Section eyebrow="Development status" title="Foundation only — not playable yet.">
        <div className="grid-3">
          <FeatureCard
            number="01"
            title="Arena and starter bots"
            status={<StatusPill tone="hold">Asset generator</StatusPill>}
          >
            Blender generates an original enclosed arena plus Rammer, Ripper, and Maul
            with a modular part library and attachment sockets.
          </FeatureCard>
          <FeatureCard
            number="02"
            title="Free-side boundary"
            status={<StatusPill tone="live">No value</StatusPill>}
          >
            No paid entry, wager, cash prize, redeemable item, purchased performance
            advantage, or Legal Play operation is part of this foundation.
          </FeatureCard>
          <FeatureCard
            number="03"
            title="Runtime target"
            status={<StatusPill tone="hold">Godot 4.7.1</StatusPill>}
          >
            Gameplay, physics, controls, garage validation, and authoritative online
            matches remain for the next vertical slice after visual asset acceptance.
          </FeatureCard>
        </div>
      </Section>

      <Section eyebrow="Starter robots" title="Three original teaching machines.">
        <div className="grid-3">
          <FeatureCard title="Rammer">
            Fast four-wheel pusher with a low wedge. Teaches steering, positioning, and
            wall control without an active weapon.
          </FeatureCard>
          <FeatureCard title="Ripper">
            Guarded vertical spinner with front forks. Teaches spin-up timing, recoil,
            and weapon exposure.
          </FeatureCard>
          <FeatureCard title="Maul">
            Overhead hammer robot with a front wedge. Teaches controlled striking,
            target selection, and recovery after a missed swing.
          </FeatureCard>
        </div>
      </Section>
    </>
  );
}
