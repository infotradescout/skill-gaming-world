import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHero, Section } from "@/components/page-elements";

export const metadata: Metadata = { title: "Account Settings" };

export default function AccountSettingsPage() {
  return (
    <>
      <PageHero
        eyebrow="Account"
        title="Settings"
        actions={<Link className="button button-primary" href="/auth/login">Log in to manage settings</Link>}
      >
        <p>
          Manage identity basics, privacy choices, security, communications, and
          closure from an authenticated account.
        </p>
      </PageHero>
      <Section>
        <EmptyState symbol="⚙" title="Settings require authentication">
          <p>
            Player restrictions remain available through the separate responsible-play
            controls after sign-in.
          </p>
        </EmptyState>
      </Section>
    </>
  );
}
