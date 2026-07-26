import type { Metadata } from "next";
import Link from "next/link";
import {
  FeatureCard,
  PageHero,
  Section,
  StatusPill,
  TrustDisclosure,
} from "@/components/page-elements";

export const metadata: Metadata = { title: "Play Monetaire" };

export default function MonetairePlayPage() {
  return (
    <>
      <PageHero
        eyebrow="Monetaire Play"
        title={
          <>
            Draw, build,
            <br />
            <em>finish cleanly.</em>
          </>
        }
        actions={
          <>
            <Link className="button button-primary" href="/app/monetaire/practice">
              Open practice board
            </Link>
            <Link className="button button-secondary" href="/auth/register">
              Create an account
            </Link>
          </>
        }
        aside={<TrustDisclosure compact />}
      >
        <p>
          Start with practice. Learn Draw 1 Klondike controls, see valid-move feedback,
          and understand how a completed game is measured.
        </p>
      </PageHero>

      <Section eyebrow="First release rules" title="Clear enough to inspect.">
        <div className="grid-3">
          <FeatureCard number="1" title="Build the tableau">
            <p>Stack descending ranks in alternating colors. Only face-up cards can move.</p>
          </FeatureCard>
          <FeatureCard number="2" title="Complete foundations">
            <p>Move each suit from Ace through King into its foundation.</p>
          </FeatureCard>
          <FeatureCard number="3" title="Ranked measurement">
            <p>
              Completion ranks first, then fewer valid moves, then lower verified
              active-play duration. Exact ties remain ties.
            </p>
          </FeatureCard>
        </div>
        <div className="play-availability callout">
          <StatusPill tone="live">Practice available</StatusPill>
          <p>
            Practice uses Play mode only. It does not award cash, valuable prizes, or
            casino eligibility.
          </p>
        </div>
      </Section>
    </>
  );
}
