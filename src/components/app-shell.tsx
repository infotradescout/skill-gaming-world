"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BrandMark, MonetaireMark } from "./brand";

const appLinks = [
  { href: "/app", label: "Overview", symbol: "⌂" },
  { href: "/app/monetaire", label: "Monetaire", symbol: "M" },
  { href: "/app/robot-combat", label: "Bay 13", symbol: "13" },
  { href: "/app/monetaire/competitions", label: "Competitions", symbol: "◇" },
  { href: "/app/wallet", label: "Play Coins", symbol: "○" },
  { href: "/app/achievements", label: "Achievements", symbol: "△" },
  { href: "/app/eligibility", label: "Eligibility", symbol: "✓" },
  { href: "/app/responsible-play", label: "Player controls", symbol: "◷" },
];

export function AppShell({
  children,
  user,
  initialPlayCoinBalance,
}: {
  children: ReactNode;
  user: { displayName: string; status: string };
  initialPlayCoinBalance: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [playCoinBalance, setPlayCoinBalance] = useState(initialPlayCoinBalance);
  const [signingOut, setSigningOut] = useState(false);
  const loadBalance = useCallback(async () => {
    try {
      const response = await fetch("/api/play-coins", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { balanceMinor?: number };
      if (typeof body.balanceMinor === "number") setPlayCoinBalance(body.balanceMinor);
    } catch {
      // The balance remains visibly unavailable rather than falling back to sample data.
    }
  }, []);

  useEffect(() => {
    const refresh = () => void loadBalance();
    window.addEventListener("playcoin:changed", refresh);
    return () => window.removeEventListener("playcoin:changed", refresh);
  }, [loadBalance]);

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!response.ok) return;
      router.push("/auth/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#app-content">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <BrandMark compact />
        <div className="app-product">
          <span>Now playing</span>
          <MonetaireMark />
        </div>
        <nav className="app-nav" aria-label="Player app">
          {appLinks.map((link) => {
            const exact = link.href === "/app";
            const active = exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={active ? "app-nav-active" : ""}>
                <span aria-hidden="true">{link.symbol}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="app-sidebar-bottom">
          <Link href="/casino" className="sidebar-casino">
            <span>Casino</span>
            <small>Unavailable</small>
          </Link>
          <Link href="/account/history">Account history</Link>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <Link href="/app/monetaire" className="mobile-app-brand">
            <MonetaireMark />
          </Link>
          <div className="app-topbar-status">
            <span
              className={user.status === "ACTIVE" ? "status-dot" : "status-dot status-dot-restricted"}
              aria-hidden="true"
            />
            <span>{user.status === "ACTIVE" ? "Monetaire Play" : "Account restricted"}</span>
          </div>
          <div className="app-balance" aria-label="Play Coin balance unavailable">
            <span>Play Coins</span>
            <strong>
              {playCoinBalance.toLocaleString()}
            </strong>
          </div>
          <button
            className="app-sign-out"
            disabled={signingOut}
            type="button"
            onClick={() => void signOut()}
          >
            {signingOut ? "Signing out…" : "Log out"}
          </button>
          <Link
            className="app-avatar"
            href="/account/history"
            aria-label="Open account history"
          >
            <span aria-hidden="true">{user.displayName.trim().charAt(0).toUpperCase() || "P"}</span>
          </Link>
        </header>
        <main id="app-content" className="app-content">
          {children}
        </main>
        <nav className="app-mobile-nav" aria-label="Player app mobile navigation">
          {appLinks.slice(0, 5).map((link) => {
            const exact = link.href === "/app";
            const active = exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={active ? "app-nav-active" : ""}>
                <span aria-hidden="true">{link.symbol}</span>
                <small>{link.label === "Competitions" ? "Compete" : link.label}</small>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function AppPageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="app-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children ? <div className="muted">{children}</div> : null}
      </div>
      {actions ? <div className="button-row">{actions}</div> : null}
    </header>
  );
}
