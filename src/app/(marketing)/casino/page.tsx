import type { Metadata } from "next";
import Link from "next/link";
import {
  LockedNotice,
  PageHero,
  Section,
  StatusPill,
} from "@/components/page-elements";

export const metadata: Metadata = { title: "Casino Unavailable" };

export default function CasinoPage() {
  return (
    <>
      <PageHero
        eyebrow="Product toggle"
        title={
          <>
            Casino is
            <br />
            <em>not available.</em>
          </>
        }
        actions={
          <Link className="button button-primary" href="/monetaire">
            Return to Monetaire
          </Link>
        }
        aside={
          <div className="casino-vault">
            <span>Server-disabled</span>
          </div>
        }
      >
        <p>
          This boundary is intentional. No casino games, deposits, wagers, cash
          balances, or withdrawals are exposed in the current product.
        </p>
      </PageHero>

      <Section eyebrow="Availability" title="A shell is not an operating casino.">
        <LockedNotice title="Casino cash wagering is not currently available.">
          <p>
            A future casino mode would require separate casino verification,
            licensing or an approved market-access partner, precise geolocation,
            identity and age checks, AML controls, self-exclusion checks, and
            jurisdiction authorization.
          </p>
        </LockedNotice>
        <div className="boundary-diagram surface">
          <div>
            <StatusPill tone="blocked">Disabled</StatusPill>
            <h3>Social casino</h3>
            <p>No simulated casino games are active in this release.</p>
          </div>
          <div>
            <StatusPill tone="blocked">Disabled</StatusPill>
            <h3>Real-money casino</h3>
            <p>No deposits, wagering, casino cash ledger, or withdrawals exist here.</p>
          </div>
          <div>
            <StatusPill tone="live">Separate</StatusPill>
            <h3>Monetaire Play</h3>
            <p>Noncash solitaire entertainment remains available under its own rules.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
