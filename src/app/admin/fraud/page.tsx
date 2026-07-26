import { AdminEmpty, AdminPage } from "@/components/admin-shell";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminFraudPage() {
  await requireAdminRoles(["FRAUD_REVIEW", "COMPLIANCE_ADMIN", "SUPER_ADMIN"]);
  return (
    <AdminPage
      eyebrow="Fraud review"
      title="Flags requiring judgment"
      description="A signal is not proof. Review requires evidence, disposition, reviewer identity, and an audit event."
    >
      <AdminEmpty
        title="No fraud flags loaded"
        description="The interface does not simulate suspicious users or incidents."
      />
    </AdminPage>
  );
}
