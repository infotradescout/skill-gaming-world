import type { Metadata } from "next";

import { StatusPill } from "@/components/page-elements";

export const metadata: Metadata = {
  title: "Casino | Skill Gaming World",
  description: "Casino product status for Skill Gaming World.",
};

export default function CasinoPage() {
  return (
    <div className="casino-floor">
      <section className="casino-intro shell">
        <div>
          <p className="eyebrow">Future product</p>
          <h1>Casino is<br /><em>not available.</em></h1>
          <p>
            No casino games, deposits, wagers, cash balances, or withdrawals are
            exposed in the current product.
          </p>
        </div>
        <div className="casino-balance">
          <small>Current status</small>
          <StatusPill tone="blocked">Server-disabled</StatusPill>
          <strong>HARD <span>HOLD</span></strong>
          <p>Separate legal, consumer, payment, and distribution review required.</p>
        </div>
      </section>
      <section className="casino-coming shell">
        <p className="eyebrow">Boundary</p>
        <h2>Skill play remains separate.</h2>
        <p>
          Monetaire free play is available under its own rules. Skill Prize,
          social-casino, and real-money casino modes each require independent
          authorization and cannot be unlocked by this page.
        </p>
      </section>
    </div>
  );
}
