import type { Metadata } from "next";

import { AdminPage } from "@/components/admin-shell";
import { requireAdminRoles } from "@/lib/admin-access";

export const metadata: Metadata = {
  title: "Platynum-47",
  robots: { index: false, follow: false },
};

/**
 * This is deliberately a private companion page, not a remote work engine.
 * Platynum edits folders on the owner's computer, where its local sign-in and
 * project boundary stay intact. Skill Gaming World only protects this entry
 * point; it never receives project files or relays work commands.
 */
export default async function PlatynumCompanionPage() {
  await requireAdminRoles(["SUPER_ADMIN"]);

  return (
    <AdminPage
      eyebrow="Private workspace"
      title="Platynum-47"
      description="Your private place to open and update the local workspace. Your projects stay on this computer."
    >
      <section className="surface admin-section">
        <h2>Get Platynum for Windows</h2>
        <p>
          Download and run the Windows app. It opens Platynum-47 directly and keeps your project folders
          on this computer.
        </p>
        <a className="button button-primary" href="/admin/platynum/download">
          Download Platynum for Windows
        </a>
      </section>

      <section className="callout admin-callout">
        <p>
          This page is limited to the account owner. It is an entry point only: it does not share game data,
          account access, project files, or sign-in details with Platynum.
        </p>
      </section>
    </AdminPage>
  );
}
