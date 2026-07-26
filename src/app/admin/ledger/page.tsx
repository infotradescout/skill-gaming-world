import { AdminEmpty, AdminPage } from "@/components/admin-shell";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminLedgerPage() {
  await requireAdminRoles(["FINANCE_AUDITOR", "COMPLIANCE_ADMIN", "SUPER_ADMIN"]);
  return (
    <AdminPage
      eyebrow="Finance audit"
      title="Play Coin ledger"
      description="Append-only, integer-unit entries. No balance may be silently edited, and no cross-ledger conversion exists."
    >
      <div className="callout admin-callout">
        <p>
          This surface is limited to the nonredeemable PLAY_COIN ledger. Reserved cash
          ledgers have no active operations and remain isolated behind hard holds.
        </p>
      </div>
      <AdminEmpty title="No ledger entries loaded" description="No sample balance adjustments or transactions are inserted." />
    </AdminPage>
  );
}
