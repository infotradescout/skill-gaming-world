import { AdminEmpty, AdminPage } from "@/components/admin-shell";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminAppealsPage() {
  await requireAdminRoles([
    "SUPPORT",
    "FRAUD_REVIEW",
    "COMPLIANCE_ADMIN",
    "SUPER_ADMIN",
  ]);
  return (
    <AdminPage
      eyebrow="Player process"
      title="Appeals"
      description="Players can challenge a result. Decisions retain the original result and create an auditable adjustment when required."
    >
      <AdminEmpty title="No appeals loaded" description="Submitted appeals appear here after server authorization." />
    </AdminPage>
  );
}
