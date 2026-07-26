import type { Metadata } from "next";
import Link from "next/link";
import {
  FeatureCard,
  PageHero,
  Section,
  TrustDisclosure,
} from "@/components/page-elements";

export const metadata: Metadata = { title: "How Monetaire Works" };

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How Monetaire works"
        title={
          <>
            From seed to score,
            <br />
            <em>without a black box.</em>
          </>
        }
        actions={
          <Link className="button button-primary" href="/app/monetaire/practice">
            Try the board
          </Link>
        }
      >
        <p>
          Monetaire separates the deal, player moves, official timing, and ranking
          into records that can be reproduced and reviewed.
        </p>
      </PageHero>

      <Section eyebrow="The sequence" title="Four steps define a ranked deal.">
        <div className="process-list">
          <FeatureCard number="01" title="Commit">
            <p>A SHA-256 commitment records the chosen deal before play opens.</p>
          </FeatureCard>
          <FeatureCard number="02" title="Play">
            <p>Every entrant receives the identical versioned deal and ruleset.</p>
          </FeatureCard>
          <FeatureCard number="03" title="Validate">
            <p>The server accepts legal moves in sequence and rejects duplicates or replay.</p>
          </FeatureCard>
          <FeatureCard number="04" title="Rank">
            <p>Completion, valid moves, and verified active time determine the result.</p>
          </FeatureCard>
        </div>
      </Section>

      <Section eyebrow="Currency" title="Performance never changes currency boundaries.">
        <TrustDisclosure />
      </Section>
    </>
  );
}
