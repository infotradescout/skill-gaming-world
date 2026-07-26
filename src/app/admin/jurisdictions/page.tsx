import { AdminPage, AdminRow, AdminRows } from "@/components/admin-shell";
import { StatusPill } from "@/components/page-elements";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminJurisdictionsPage() {
  await requireAdminRoles(["COMPLIANCE_ADMIN", "SUPER_ADMIN"]);
  return (
    <AdminPage
      eyebrow="Compliance"
      title="Jurisdiction policy"
      description="Restricted decisions fail closed. Client-declared location is never treated as physical-location proof."
    >
      <AdminRows headers={["Product mode", "Initial policy", "State"]}>
        <AdminRow primary="MONETAIRE_PLAY" secondary="Safe-demo allowlist only; no legal conclusion" status={<StatusPill tone="hold">Demo only</StatusPill>} />
        <AdminRow primary="MONETAIRE_PRIZE" secondary="No jurisdiction authorization exists" status={<StatusPill tone="blocked">Hard hold</StatusPill>} />
        <AdminRow primary="SOCIAL_CASINO" secondary="No jurisdiction authorization exists" status={<StatusPill tone="blocked">Hard hold</StatusPill>} />
        <AdminRow primary="REAL_MONEY_CASINO" secondary="No jurisdiction authorization or licensing exists" status={<StatusPill tone="blocked">Hard hold</StatusPill>} />
      </AdminRows>
    </AdminPage>
  );
}
