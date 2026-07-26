import type { Metadata } from "next";
import Link from "next/link";
import { CardStudy } from "@/components/card-art";
import {
  FeatureCard,
  PageHero,
  Section,
  StatusPill,
  TrustDisclosure,
} from "@/components/page-elements";

export const metadata: Metadata = {
  title: "Monetaire",
  description: "Competitive Solitaire by Skill Gaming World.",
};

export default function MonetairePage() {
  return (
    <>
      <PageHero
        eyebrow="Monetaire · Competitive Solitaire"
        title={
          <>
            Familiar cards.
            <br />
            <em>Sharper standards.</em>
          </>
        }
        actions={
          <>
            <Link className="button button-primary" href="/app/monetaire/practice">
              Play practice
            </Link>
            <Link className="button button-secondary" href="/monetaire/how-it-works">
              How scoring works
            </Link>
          </>
        }
        aside={<CardStudy compact />}
      >
        <p>
          Draw 1 Klondike designed for deliberate, auditable competition. Practice
          at your own pace or compare performance in noncash ranked events.
        </p>
      </PageHero>

      <Section eyebrow="Ways to play" title="One ruleset. Distinct contexts.">
        <div className="grid-3">
          <FeatureCard
            number="P"
            title="Practice"
            status={<StatusPill tone="live">Available</StatusPill>}
          >
            <p>Learn the board, resume a session, and build consistency without a prize.</p>
          </FeatureCard>
          <FeatureCard
            number="R"
            title="Noncash ranked"
            status={<StatusPill tone="live">Play mode</StatusPill>}
          >
            <p>
              Compete on the same published deal for rank, achievements, and recognition
              only.
            </p>
          </FeatureCard>
          <FeatureCard
            number="$"
            title="Prize competition"
            status={<StatusPill tone="blocked">Unavailable</StatusPill>}
          >
            <p>
              Separate eligibility, jurisdiction approval, and product authorization
              would be required before access.
            </p>
          </FeatureCard>
        </div>
      </Section>

      <Section eyebrow="Trust at the point of play" title="The boundary follows the game.">
        <TrustDisclosure />
      </Section>
    </>
  );
}
