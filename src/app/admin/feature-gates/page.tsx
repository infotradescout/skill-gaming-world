import { AdminPage, AdminRow, AdminRows } from "@/components/admin-shell";
import { StatusPill } from "@/components/page-elements";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminFeatureGatesPage() {
  await requireAdminRoles(["COMPLIANCE_ADMIN", "SUPER_ADMIN"]);
  return (
    <AdminPage
      eyebrow="Server policy"
      title="Feature gates"
      description="This read-only view communicates defaults. Enabling a restricted cash mode requires authorized server configuration and an audit event."
    >
      <AdminRows headers={["Gate", "Purpose", "State"]}>
        <AdminRow primary="MONETAIRE_PLAY" secondary="Noncash safe-demo practice and ranked play" status={<StatusPill tone="hold">Demo only</StatusPill>} />
        <AdminRow primary="MONETAIRE_PRIZE" secondary="No prize operation is authorized" status={<StatusPill tone="blocked">Hard hold</StatusPill>} />
        <AdminRow primary="SOCIAL_CASINO" secondary="No simulated casino operation is authorized" status={<StatusPill tone="blocked">Hard hold</StatusPill>} />
        <AdminRow primary="REAL_MONEY_CASINO" secondary="No deposit, wager, or cash operation is authorized" status={<StatusPill tone="blocked">Hard hold</StatusPill>} />
        <AdminRow primary="PRODUCTION_PAYMENTS" secondary="No merchant or real-card operation is authorized" status={<StatusPill tone="blocked">Hard hold</StatusPill>} />
      </AdminRows>
      <div className="callout admin-callout">
        <p>
          These are required safe-demo and hard-hold boundaries, not evidence of
          production readiness, legal authorization, licensing, or payment approval.
        </p>
      </div>
    </AdminPage>
  );
}
