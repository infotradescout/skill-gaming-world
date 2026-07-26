import type { Metadata } from "next";
import { LegalPage } from "@/components/page-elements";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Platform terms"
      intro="This first-release summary states the product boundaries shown throughout Skill Gaming World."
    >
      <div className="callout">
        <p>
          This interface is a product foundation, not a representation that prize
          gaming or casino gambling is licensed or available.
        </p>
      </div>
      <h2>Available product</h2>
      <p>
        Monetaire Play supports practice and noncash ranked entertainment. Play Coins
        have no cash value. Monetaire Play does not award cash or valuable prizes.
      </p>
      <h2>Unavailable product modes</h2>
      <p>
        Prize competitions are unavailable unless separately enabled for an eligible
        player and jurisdiction. Casino cash wagering is not currently available.
        Passing one future eligibility process would not grant access to another.
      </p>
      <h2>Fair play</h2>
      <p>
        Players may not automate play, manipulate timing, replay move requests, operate
        duplicate accounts, interfere with another player, or misrepresent identity or
        location. A fraud flag requires review and is not automatically proof.
      </p>
      <h2>Account protection</h2>
      <p>
        Cooldown, self-exclusion, and closure requests may limit or end access. A
        self-exclusion cannot be casually reversed by ordinary support staff.
      </p>
      <h2>Changes and acceptance</h2>
      <p>
        Material terms must be versioned. When new acceptance is required, the product
        should identify the version and obtain an explicit record before restricted
        access.
      </p>
    </LegalPage>
  );
}
