import Link from "next/link";
import { CardStudy } from "@/components/card-art";
import {
  FeatureCard,
  ModeBoundary,
  Section,
  StatusPill,
  TrustDisclosure,
} from "@/components/page-elements";

export default function HomePage() {
  return (
    <>
      <section className="home-hero shell">
        <div className="home-hero-copy">
          <StatusPill tone="live">Monetaire Play available</StatusPill>
          <p className="eyebrow">Competitive solitaire · Draw 1 Klondike</p>
          <h1 className="display">
            Your decisions.
            <br />
            <em>The same deal.</em>
          </h1>
          <p className="lead">
            Monetaire turns a familiar card game into transparent, measurable play.
            Practice freely, enter noncash ranked competitions, and inspect the rules
            that shape every result.
          </p>
          <div className="button-row">
            <Link className="button button-primary" href="/app/monetaire/practice">
              Start a practice deal
            </Link>
            <Link className="button button-secondary" href="/fairness">
              Inspect the fairness model
            </Link>
          </div>
          <p className="home-fineprint">
            Monetaire Play does not award cash or valuable prizes. No paid gameplay
            advantage.
          </p>
        </div>
        <CardStudy />
      </section>

      <Section
        eyebrow="One game, disclosed standards"
        title={
          <>
            Competitive structure without <em>manufactured spectacle.</em>
          </>
        }
      >
        <div className="grid-3">
          <FeatureCard number="01" title="Deterministic deals">
            <p>
              A deal comes from a versioned seed and ruleset, making the same card
              order reproducible.
            </p>
          </FeatureCard>
          <FeatureCard number="02" title="Measured by the server">
            <p>
              Valid moves and official active-play time are determined by the
              platform, not a player&apos;s device clock.
            </p>
          </FeatureCard>
          <FeatureCard number="03" title="No paid edge">
            <p>
              Spending never changes a deal, unlocks easier gameplay, or buys hints,
              moves, or time.
            </p>
          </FeatureCard>
        </div>
      </Section>

      <Section
        eyebrow="Product boundary"
        title={
          <>
            Available play is clear. <em>Unavailable modes stay closed.</em>
          </>
        }
      >
        <ModeBoundary />
      </Section>

      <Section eyebrow="Currency boundary" title="Play Coins are not money.">
        <div className="home-trust-grid">
          <TrustDisclosure />
          <div className="trust-principles surface-soft">
            <div>
              <span className="eyebrow">Cannot</span>
              <strong>Cash out</strong>
            </div>
            <div>
              <span className="eyebrow">Cannot</span>
              <strong>Transfer</strong>
            </div>
            <div>
              <span className="eyebrow">Cannot</span>
              <strong>Fund prizes</strong>
            </div>
            <div>
              <span className="eyebrow">Can</span>
              <strong>Support play</strong>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
