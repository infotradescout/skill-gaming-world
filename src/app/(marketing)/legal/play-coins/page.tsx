import type { Metadata } from "next";
import { LegalPage } from "@/components/page-elements";

export const metadata: Metadata = { title: "Play Coin Terms" };

export default function PlayCoinTermsPage() {
  return (
    <LegalPage
      eyebrow="Currency disclosure"
      title="Play Coin terms"
      intro="A plain-language summary of what Play Coins are—and what they can never become."
    >
      <div className="callout">
        <p>
          <strong>Play Coins have no cash value.</strong> They cannot be withdrawn,
          transferred, sold, redeemed, or exchanged for money or anything else of
          real-world value.
        </p>
      </div>
      <h2>Entertainment use</h2>
      <p>
        Play Coins are a closed entertainment unit for eligible Play-mode experiences.
        They may be earned and may eventually be purchased through an approved flow.
        They are not money, winnings, stored value, or a claim against Skill Gaming
        World.
      </p>
      <h2>Hard restrictions</h2>
      <ul>
        <li>No withdrawal, redemption, transfer, resale, or secondary market.</li>
        <li>No conversion into a prize entry, prize balance, or casino cash balance.</li>
        <li>No exchange for gift cards, merchandise, cryptocurrency, or any valuable item.</li>
        <li>No transfer between players or accounts.</li>
        <li>No gameplay claim that describes a Play Coin result as cash or winnings.</li>
      </ul>
      <h2>Purchases</h2>
      <p>
        Production payments are not active. Any visible package interaction in the
        current product is a sandbox-only interface and must not charge a real card.
        Future purchases would remain subject to clear pricing, limits, refund rules,
        and provider approval.
      </p>
      <h2>Auditability</h2>
      <p>
        Balance changes must be recorded in integer minor units through auditable ledger
        entries. Support cannot silently create or erase balance history.
      </p>
    </LegalPage>
  );
}
