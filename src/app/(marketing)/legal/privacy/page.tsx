import type { Metadata } from "next";
import { LegalPage } from "@/components/page-elements";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy principles"
      intro="The platform is designed to separate identity decisions from ordinary gameplay telemetry."
    >
      <h2>Data minimization</h2>
      <p>
        Skill Gaming World should collect only the data required to operate the
        requested product, secure accounts, enforce restrictions, and meet applicable
        legal duties. Future verification data does not belong in ordinary game logs.
      </p>
      <h2>Gameplay records</h2>
      <p>
        Game sessions may record ruleset, deal reference, sequenced moves, server
        timing, completion state, integrity signals, and resulting score. These records
        support resume, fairness review, fraud review, and appeals.
      </p>
      <h2>Identity and location</h2>
      <p>
        Prize or casino modes would require distinct eligibility decisions. A declared
        residence or client-selected location is not proof of current physical
        location. Sensitive verification records should be protected in a separate
        identity boundary.
      </p>
      <h2>Administrative access</h2>
      <p>
        Privileged access should be least-privilege, purpose-limited, and auditable.
        Every privileged change requires an actor, timestamp, reason, and before/after
        state.
      </p>
      <h2>Your controls</h2>
      <p>
        Account settings should provide access to history, privacy preferences,
        restriction controls, closure, and a clear support path. Applicable access or
        deletion rights remain subject to records that must be retained for security,
        disputes, or law.
      </p>
    </LegalPage>
  );
}
