import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHero, Section } from "@/components/page-elements";

export const metadata: Metadata = { title: "Account History" };

export default function AccountHistoryPage() {
  return (
    <>
      <PageHero
        eyebrow="Account"
        title="History"
        actions={<Link className="button button-primary" href="/auth/login">Log in to view history</Link>}
      >
        <p>
          Game sessions, competition entries, Play Coin adjustments, and account
          restrictions belong in clear, reviewable records.
        </p>
      </PageHero>
      <Section>
        <EmptyState symbol="≡" title="No account history is loaded">
          <p>Sign in to request your own records. This page does not display sample transactions.</p>
        </EmptyState>
      </Section>
    </>
  );
}
