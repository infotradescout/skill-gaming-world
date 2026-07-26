import { AdminEmpty, AdminPage } from "@/components/admin-shell";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminAuditPage() {
  await requireAdminRoles(["FINANCE_AUDITOR", "COMPLIANCE_ADMIN", "SUPER_ADMIN"]);
  return (
    <AdminPage
      eyebrow="Append-only evidence"
      title="Audit history"
      description="Privileged actions require actor, timestamp, reason, and before/after state. History cannot be erased from this interface."
    >
      <AdminEmpty title="No audit events loaded" description="The UI never generates fake operational evidence." />
    </AdminPage>
  );
}
