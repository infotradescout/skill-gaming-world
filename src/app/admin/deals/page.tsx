import { AdminEmpty, AdminPage } from "@/components/admin-shell";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminDealsPage() {
  await requireAdminRoles(["CONTENT_ADMIN", "COMPLIANCE_ADMIN", "SUPER_ADMIN"]);
  return (
    <AdminPage
      eyebrow="Fairness"
      title="Deals"
      description="Review versioned seeds, commitments, validation records, and immutable publication state."
    >
      <AdminEmpty
        title="No deal records loaded"
        description="A deal is not labeled verified-solvable without an actual solver validation record."
      />
    </AdminPage>
  );
}
