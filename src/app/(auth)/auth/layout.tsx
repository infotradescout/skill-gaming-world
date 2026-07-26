import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import "@/components/auth.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <Link className="skip-link" href="#auth-content">Skip to form</Link>
      <div className="auth-brand">
        <BrandMark />
        <Link href="/monetaire">Explore Monetaire →</Link>
      </div>
      <div id="auth-content" className="auth-content">
        {children}
      </div>
      <aside className="auth-disclosure">
        <p>
          Play Coins have no cash value and cannot be withdrawn, transferred, sold, or
          redeemed.
        </p>
        <p>Casino cash wagering is not currently available.</p>
      </aside>
    </main>
  );
}
