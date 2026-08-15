"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./brand";

const publicLinks = [
  { href: "/", label: "Game floor" },
  { href: "/monetaire", label: "Monetaire" },
  { href: "/robot-combat", label: "Robot Combat" },
  { href: "/fairness", label: "Fair play" },
];

function linkIsActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="public-header">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="public-header-inner shell">
        <BrandMark />
        <nav
          id="public-navigation"
          className={open ? "public-nav public-nav-open" : "public-nav"}
          aria-label="Primary"
        >
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={linkIsActive(pathname, link.href) ? "public-nav-active" : ""}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="public-header-actions">
          <Link className="public-login-link" href="/auth/login">
            Log in
          </Link>
          <Link className="public-join-button" href="/auth/register">
            Join free
          </Link>
          <button
            className="public-menu-button"
            type="button"
            aria-expanded={open}
            aria-controls="public-navigation"
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
    <footer className="public-footer">
      <div className="public-footer-grid shell">
        <div className="public-footer-brand">
          <BrandMark />
          <p>
            Games with clear rules, visible choices, and room to get better.
          </p>
        </div>
        <div className="public-footer-column">
          <strong>Games</strong>
          <Link href="/monetaire">Monetaire</Link>
          <Link href="/robot-combat">Robot Combat</Link>
          <Link href="/fairness">Fair play</Link>
        </div>
        <div className="public-footer-column">
          <strong>Play</strong>
          <Link href="/monetaire/play">How to play Monetaire</Link>
          <Link href="/monetaire/how-it-works">How the table works</Link>
          <Link href="/responsible-play">Play controls</Link>
        </div>
        <div className="public-footer-column">
          <strong>House rules</strong>
          <Link href="/legal/play-coins">Play Coin terms</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
        </div>
      </div>
      <div className="public-footer-boundary shell">
        <p>
          Play Coins are entertainment points only. They have no cash value and
          cannot be withdrawn, transferred, sold, or redeemed.
        </p>
        <p>Prize and wagering features are not part of the current play experience.</p>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}
