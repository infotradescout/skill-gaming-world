import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppPageHeader } from "@/components/app-shell";
import { StatusPill } from "@/components/page-elements";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { runtimeEligibilitySnapshot } from "@/lib/runtime-eligibility";

function reasonSummary(reasonCodes: readonly string[]): string {
  if (reasonCodes.length === 0) return "No active account restriction.";
  return reasonCodes
    .map((code) => code.toLowerCase().replaceAll("_", " "))
    .join(" · ");
}

export default async function EligibilityPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");
  const eligibility = await runtimeEligibilitySnapshot(user);
  const environmentLabel =
    eligibility.environment === "configured"
      ? "Configured private preview"
      : "Safe demo";

  return (
    <>
      <AppPageHeader eyebrow="Access decisions" title="Eligibility">
        <p>Each restricted product evaluates its own approval, current location, account restrictions, and server feature gate.</p>
      </AppPageHeader>
      <div className="eligibility-list surface">
        <div className="eligibility-row">
          <div>
            <h2>Monetaire Play</h2>
            <p>
              {environmentLabel} · noncash entertainment. This is not a legal
              eligibility determination. {reasonSummary(eligibility.monetairePlay.reasonCodes)}
            </p>
          </div>
          <StatusPill tone={eligibility.monetairePlay.decision === "ALLOW" ? "live" : "blocked"}>
            {eligibility.monetairePlay.decision === "ALLOW" ? "Available" : "Restricted"}
          </StatusPill>
        </div>
        <div className="eligibility-row">
          <div><h2>Skill Prize verification</h2><p>Identity, age, location, jurisdiction, and rules acceptance would be evaluated separately. Current status: {reasonSummary(eligibility.skillPrizeVerification.reasonCodes)}.</p></div>
          <StatusPill tone="blocked">Disabled</StatusPill>
        </div>
        <div className="eligibility-row">
          <div><h2>Casino verification</h2><p>A distinct 21+, geolocation, AML, and responsible-gaming decision. Current status: {reasonSummary(eligibility.casinoVerification.reasonCodes)}.</p></div>
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
