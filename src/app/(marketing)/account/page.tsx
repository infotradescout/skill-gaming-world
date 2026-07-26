import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section, StatusPill } from "@/components/page-elements";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <>
      <PageHero
        eyebrow="Account center"
        title="Your play, controls, and records."
        actions={
          <>
            <Link className="button button-primary" href="/auth/login">
              Log in
            </Link>
            <Link className="button button-secondary" href="/auth/register">
              Create account
            </Link>
          </>
        }
        aside={
          <div className="account-summary surface">
            <StatusPill tone="hold">Sign-in required</StatusPill>
            <p className="muted small">
              Balances, activity, identity status, and restrictions are never
              represented with sample personal data.
            </p>
          </div>
        }
      >
        <p>
          Use one place to inspect game and Play Coin history, manage preferences,
          and reach player-protection controls.
        </p>
      </PageHero>
      <Section eyebrow="Account destinations" title="Nothing hidden behind a balance.">
        <div className="account-public-grid">
          <div className="account-nav-card surface">
            <Link href="/account/history">History <span>→</span></Link>
            <Link href="/account/settings">Account settings <span>→</span></Link>
            <Link href="/app/responsible-play">Player controls <span>→</span></Link>
            <Link href="/app/support">Support and appeals <span>→</span></Link>
            <Link href="/app/eligibility">Eligibility <span>→</span></Link>
          </div>
          <div className="support-card surface-soft">
            <h3>Separate approvals</h3>
            <p>
              A future Skill Prize approval would never automatically grant Casino
              approval. Both modes are currently unavailable.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
