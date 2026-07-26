"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./brand";

const publicLinks = [
  { href: "/monetaire", label: "Monetaire" },
  { href: "/monetaire/how-it-works", label: "How it works" },
  { href: "/fairness", label: "Fairness" },
  { href: "/responsible-play", label: "Player protection" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="site-header-inner shell">
        <BrandMark />
        <nav className={open ? "site-nav site-nav-open" : "site-nav"} aria-label="Primary">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "nav-active" : ""}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="site-header-actions">
          <Link className="product-switch" href="/casino">
            <span>Casino</span>
            <small>Unavailable</small>
          </Link>
          <Link className="button button-secondary header-login" href="/auth/login">
            Log in
          </Link>
          <button
            className="menu-button"
            type="button"
            aria-expanded={open}
            aria-controls="primary-navigation"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <BrandMark />
          <p>
            Competitive play built around disclosed rules, verifiable game state,
            and player-first controls.
          </p>
        </div>
        <div>
          <strong>Monetaire</strong>
          <Link href="/monetaire/play">Play</Link>
          <Link href="/monetaire/competitions">Competitions</Link>
          <Link href="/fairness">Fairness</Link>
        </div>
        <div>
          <strong>Player</strong>
          <Link href="/responsible-play">Responsible play</Link>
          <Link href="/legal/play-coins">Play Coin terms</Link>
          <Link href="/account/settings">Account controls</Link>
        </div>
        <div>
          <strong>Legal</strong>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/auth/login">Account access</Link>
        </div>
      </div>
      <div className="shell footer-boundary">
        <p>
          Play Coins have no cash value and cannot be withdrawn, transferred, sold,
          or redeemed. Monetaire Play does not award cash or valuable prizes.
        </p>
        <p>
          Prize competitions are unavailable unless separately enabled for an
          eligible player and jurisdiction. Casino cash wagering is not currently
          available.
        </p>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}
