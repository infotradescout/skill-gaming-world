import type { Metadata } from "next";
import Link from "next/link";
import { FeatureCard, PageHero, Section, StatusPill } from "@/components/page-elements";
import { getGameTitleByKey } from "@/domain/game-titles";

const title = getGameTitleByKey("SGW_ROBOT_COMBAT");

export const metadata: Metadata = {
  title: "Bay 13: The Scrapyard",
  description:
    "Build an original robot and fight a local training opponent in Skill Gaming World's free Bay 13 arena.",
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
          <>
            <Link className="button button-primary" href="/games/bay-13/index.html">
              Play Bay 13
            </Link>
            <Link className="button button-secondary" href="/">
              Back to game floor
            </Link>
          </>
        }
      >
        <p>{title.publicSummary}</p>
        <p>
          Choose a starter machine, fight one local training opponent, rebuild the
          match, and create a server-validated machine in the garage. Hosted
          player-versus-player matchmaking is not live yet.
        </p>
      </PageHero>

      <Section eyebrow="Playable release" title="One complete fight-and-build loop.">
        <div className="grid-3">
          <FeatureCard
            number="01"
            title="Enter the Scrapyard"
            status={<StatusPill tone="live">Playable now</StatusPill>}
          >
            Fight inside Bay 13&apos;s former ship-transfer platform with Yard Mule,
            Keelcutter, or Pilebreaker. Keyboard, gamepad, and touch controls are included.
          </FeatureCard>
          <FeatureCard
            number="02"
            title="Free means no value"
            status={<StatusPill tone="live">No value</StatusPill>}
          >
            No paid entry, wager, cash prize, redeemable item, purchased performance
            advantage, or Legal Play operation exists in Bay 13.
          </FeatureCard>
          <FeatureCard
            number="03"
            title="Build honestly"
            status={<StatusPill tone="live">Server rebuilt</StatusPill>}
          >
            The garage recalculates mass, power, size, attachments, and the final
            blueprint hash. Client-declared physics, damage, and results are ignored.
          </FeatureCard>
        </div>
      </Section>

      <Section eyebrow="Starter machines" title="Three ways to learn the floor.">
        <div className="grid-3">
          <FeatureCard title="Yard Mule · Rammer">
            Fast four-wheel pusher with a low wedge. Teaches steering, positioning, and
            wall control without an active weapon.
          </FeatureCard>
          <FeatureCard title="Keelcutter · Ripper">
            Guarded vertical spinner with front forks. Teaches spin-up timing, recoil,
            and weapon exposure.
          </FeatureCard>
          <FeatureCard title="Pilebreaker · Maul">
            Overhead hammer robot with a front wedge. Teaches controlled striking,
            target selection, and recovery after a missed swing.
          </FeatureCard>
        </div>
        <div className="play-availability callout">
          <StatusPill tone="hold">Online PvP next</StatusPill>
          <p>
            The WebSocket authority boundary is implemented and locally verified. Hosted
            matchmaking, private rooms, reconnect handling, and public ranked play remain
            unavailable until match servers are deployed and tested.
          </p>
        </div>
      </Section>
    </>
  );
}
