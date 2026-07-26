import Link from "next/link";
import { AdminEmpty, AdminPage } from "@/components/admin-shell";
import { StatusPill } from "@/components/page-elements";
import { requireAdminRoles } from "@/lib/admin-access";

export default async function AdminHomePage() {
  await requireAdminRoles([
    "SUPPORT",
    "FRAUD_REVIEW",
    "CONTENT_ADMIN",
    "FINANCE_AUDITOR",
    "COMPLIANCE_ADMIN",
    "SUPER_ADMIN",
  ]);
  return (
    <AdminPage
      eyebrow="Operations"
      title="Control room"
      description="Read-only orientation to product state. Mutation requires a role-authorized server action, reason, and audit event."
    >
      <div className="grid-4">
        <div className="stat surface-soft"><span>Open fraud reviews</span><strong>—</strong></div>
        <div className="stat surface-soft"><span>Open appeals</span><strong>—</strong></div>
        <div className="stat surface-soft"><span>Ledger exceptions</span><strong>—</strong></div>
        <div className="stat surface-soft"><span>Restricted users</span><strong>—</strong></div>
      </div>
      <div className="admin-mode-grid">
        <Link href="/admin/feature-gates" className="admin-mode-card surface-soft">
          <StatusPill tone="hold">Safe demo only</StatusPill>
          <h2>Monetaire Play</h2>
          <p>Noncash practice and ranked architecture.</p>
        </Link>
        <Link href="/admin/feature-gates" className="admin-mode-card surface-soft">
          <StatusPill tone="blocked">Hard hold</StatusPill>
          <h2>Skill Prize</h2>
          <p>Held behind legal, jurisdiction, and eligibility gates.</p>
        </Link>
        <Link href="/admin/feature-gates" className="admin-mode-card surface-soft">
          <StatusPill tone="blocked">Hard hold</StatusPill>
          <h2>Social Casino</h2>
          <p>No casino game execution is exposed.</p>
        </Link>
        <Link href="/admin/feature-gates" className="admin-mode-card surface-soft">
          <StatusPill tone="blocked">Hard hold</StatusPill>
          <h2>Real-Money Casino</h2>
          <p>No deposit, wager, cashout, or casino cash operation.</p>
        </Link>
      </div>
      <section className="admin-section">
        <AdminEmpty
          title="No live operational feed loaded"
          description="This console does not generate sample alerts or fabricate system status."
        />
      </section>
    </AdminPage>
  );
}
