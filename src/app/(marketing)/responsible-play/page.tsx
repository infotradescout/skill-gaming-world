import type { Metadata } from "next";
import Link from "next/link";
import {
  FeatureCard,
  PageHero,
  Section,
  StatusPill,
} from "@/components/page-elements";

export const metadata: Metadata = { title: "Responsible Play" };

export default function ResponsiblePlayPage() {
  return (
    <>
      <PageHero
        eyebrow="Player protection"
        title={
          <>
            The best session is
            <br />
            <em>a chosen session.</em>
          </>
        }
        actions={
          <>
            <Link className="button button-primary" href="/app/responsible-play">
              Open player controls
            </Link>
            <Link className="button button-secondary" href="/account/history">
              Review history
            </Link>
          </>
        }
        aside={
          <div className="support-card surface">
            <StatusPill tone="live">Player-controlled</StatusPill>
            <h3>No countdown pressure</h3>
            <p>
              Skill Gaming World does not use fake scarcity, false near-win messaging,
              or purchase countdowns to push continued play.
            </p>
          </div>
        }
      >
        <p>
          Monetaire Play is noncash entertainment, but time, spending, and account
          boundaries still matter. Controls should be understandable before they are
          needed.
        </p>
      </PageHero>

      <Section eyebrow="Available controls" title="Pause, limit, or stop.">
        <div className="grid-3">
          <FeatureCard number="◷" title="Play reminders">
            <p>Choose an optional reminder interval and keep elapsed session time visible.</p>
          </FeatureCard>
          <FeatureCard number="Ⅱ" title="Cooldown">
            <p>Temporarily block new sessions for a selected period.</p>
          </FeatureCard>
          <FeatureCard number="×" title="Self-exclusion">
            <p>
              Block product access according to the recorded scope. Ordinary support
              cannot remove the restriction.
            </p>
          </FeatureCard>
        </div>
      </Section>

      <Section eyebrow="Support" title="Problems should have a direct path.">
        <div className="responsible-grid">
          <div className="support-card surface-soft">
            <h3>Account and transaction support</h3>
            <p>
              Review your history first, then use the account support path for a
              disputed Play Coin adjustment, access problem, cooldown, or closure
              request.
            </p>
            <div className="button-row">
              <Link className="button button-secondary" href="/app/support">
                Submit a support request
              </Link>
            </div>
          </div>
          <div className="support-card surface-soft">
            <h3>Immediate restriction</h3>
            <p>
              The authenticated player-control page is the direct path to initiate a
              cooldown or self-exclusion.
            </p>
            <Link className="button button-danger" href="/app/responsible-play">
              Open restrictions
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
