import { AppPageHeader } from "@/components/app-shell";
import { StatusPill } from "@/components/page-elements";

export default function EligibilityPage() {
  return (
    <>
      <AppPageHeader eyebrow="Access decisions" title="Eligibility">
        <p>Each restricted product evaluates its own approval, current location, account restrictions, and server feature gate.</p>
      </AppPageHeader>
      <div className="eligibility-list surface">
        <div className="eligibility-row">
          <div><h2>Monetaire Play</h2><p>Safe-demo noncash entertainment. This is not a legal eligibility determination.</p></div>
          <StatusPill tone="live">Safe demo only</StatusPill>
        </div>
        <div className="eligibility-row">
          <div><h2>Skill Prize verification</h2><p>Identity, age, location, jurisdiction, and rules acceptance would be evaluated separately.</p></div>
          <StatusPill tone="blocked">Disabled</StatusPill>
        </div>
        <div className="eligibility-row">
          <div><h2>Casino verification</h2><p>A distinct 21+, geolocation, AML, and responsible-gaming decision.</p></div>
          <StatusPill tone="blocked">Disabled</StatusPill>
        </div>
      </div>
      <div className="callout app-section">
        <p>
          Passing Skill Prize verification must never grant Casino verification. A
          client-selected state or country is not proof of physical location.
        </p>
      </div>
    </>
  );
}
