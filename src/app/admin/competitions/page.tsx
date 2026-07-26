import { AdminEmpty, AdminPage } from "@/components/admin-shell";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminCompetitionsPage() {
  await requireAdminRoles(["CONTENT_ADMIN", "COMPLIANCE_ADMIN", "SUPER_ADMIN"]);
  return (
    <AdminPage
      eyebrow="Content administration"
      title="Competitions"
      description="A published competition deal and ruleset are immutable. Corrections create a separate audited record."
    >
      <AdminEmpty
        title="No competitions loaded"
        description="The console does not fabricate events. Draft and published records appear only from the server."
      />
    </AdminPage>
  );
}
