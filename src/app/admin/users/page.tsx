import { AdminEmpty, AdminPage } from "@/components/admin-shell";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminUsersPage() {
  await requireAdminRoles([
    "SUPPORT",
    "FRAUD_REVIEW",
    "COMPLIANCE_ADMIN",
    "SUPER_ADMIN",
  ]);
  return (
    <AdminPage
      eyebrow="Support · Compliance"
      title="Users"
      description="Find an authorized user record, inspect restrictions, and route eligible actions through role controls."
    >
      <div className="admin-search surface-soft">
        <div className="field">
          <label htmlFor="user-search">User ID or email</label>
          <input id="user-search" placeholder="Enter an exact identifier" />
        </div>
        <button className="button button-secondary" type="button">Search</button>
      </div>
      <AdminEmpty title="No user selected" description="No sample people or account records are shown." />
    </AdminPage>
  );
}
