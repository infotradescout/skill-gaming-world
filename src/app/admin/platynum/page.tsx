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
        <h2>Open Platynum</h2>
        <p>
          If Platynum is already running on this computer, open the workspace below. It works with the
          folder you choose and does not use Skill Gaming World to read or change your projects.
        </p>
        <a className="button button-primary" href="http://127.0.0.1:5173" target="_blank" rel="noreferrer">
          Open Platynum on this computer
        </a>
      </section>

      <section className="surface admin-section">
        <h2>Get Platynum for Windows</h2>
        <p>
          This private download is pinned to the reviewed local-runtime release. Extract it, then open the
          included Start Platynum file. The first start prepares the workspace and opens it in your browser.
        </p>
        <a
          className="button"
          href="https://github.com/infotradescout/platynum-47/archive/ffe03e12b6ddad52a9c127bb15d05598911e4231.zip"
          target="_blank"
          rel="noreferrer"
        >
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
