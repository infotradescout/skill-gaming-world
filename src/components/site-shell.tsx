"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./brand";

const publicLinks = [
  { href: "/", label: "Games" },
  { href: "/monetaire", label: "Monetaire" },
  { href: "/robot-combat", label: "Robot Combat" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="launcher-header">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="launcher-header-inner shell">
        <BrandMark />
        <nav
          id="launcher-navigation"
          className={menuOpen ? "launcher-nav launcher-nav-open" : "launcher-nav"}
          aria-label="Games"
        >
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(pathname, link.href) ? "launcher-nav-active" : ""}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="launcher-header-actions">
          <Link className="launcher-rules-link" href="/fairness">
            Rules
          </Link>
          <Link className="launcher-login-link" href="/auth/login">
            Log in
          </Link>
          <Link className="launcher-play-button" href="/auth/register">
            Play free
          </Link>
          <button
            className="launcher-menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="launcher-navigation"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
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
    <footer className="launcher-footer">
      <div className="launcher-footer-inner shell">
        <span>Skill Gaming World</span>
        <span>Free play · Play Coins have no cash value.</span>
        <nav aria-label="Footer">
          <Link href="/responsible-play">Play controls</Link>
          <Link href="/legal/play-coins">Play Coin rules</Link>
          <Link href="/legal/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="launcher-shell">
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}
