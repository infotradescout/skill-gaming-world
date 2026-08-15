"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BrandMark } from "./brand";

const primaryLinks = [
  { href: "/app", label: "Games", exact: true },
  { href: "/app/monetaire", label: "Monetaire", exact: false },
  { href: "/app/robot-combat", label: "Robot Combat", exact: false },
];

const accountLinks = [
  { href: "/app/monetaire/competitions", label: "Competition board" },
  { href: "/app/achievements", label: "Achievements" },
  { href: "/app/wallet", label: "Play Coin ledger" },
  { href: "/app/eligibility", label: "Eligibility" },
  { href: "/app/responsible-play", label: "Player controls" },
  { href: "/app/support", label: "Support" },
];

function activeTone(pathname: string) {
  if (pathname.startsWith("/app/robot-combat")) return "robot";
  if (pathname.startsWith("/app/monetaire")) return "monetaire";
  return "lobby";
}

function isActive(pathname: string, link: { href: string; exact: boolean }) {
  return link.exact ? pathname === link.href : pathname.startsWith(link.href);
}

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
  const tone = activeTone(pathname);
  const [playCoinBalance, setPlayCoinBalance] = useState(initialPlayCoinBalance);
  const [signingOut, setSigningOut] = useState(false);

  const loadBalance = useCallback(async () => {
    try {
      const response = await fetch("/api/play-coins", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { balanceMinor?: number };
      if (typeof body.balanceMinor === "number") setPlayCoinBalance(body.balanceMinor);
    } catch {
      // Keep the last confirmed balance visible.
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

  const initial = user.displayName.trim().charAt(0).toUpperCase() || "P";

  return (
    <div className={"launcher-app-shell world-shell world-shell-" + tone}>
      <a className="skip-link" href="#app-content">
        Skip to content
      </a>

      <header className="launcher-header launcher-auth-header">
        <div className="launcher-header-inner world-header-inner">
          <BrandMark />
          <nav className="launcher-nav launcher-auth-nav" aria-label="Games">
            {primaryLinks.map((link) => {
              const active = isActive(pathname, link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={active ? "launcher-nav-active" : ""}
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="launcher-header-actions">
            <Link className="launcher-coins" href="/app/wallet">
              <span>PLAY COINS</span>
              <strong>{playCoinBalance.toLocaleString()}</strong>
            </Link>
            <details className="launcher-account">
              <summary>
                <span className="launcher-avatar" aria-hidden="true">{initial}</span>
                <span className="launcher-account-name">{user.displayName || "Player"}</span>
              </summary>
              <div className="launcher-account-popover">
                <span className="launcher-account-label">ACCOUNT</span>
                <strong>{user.displayName || "Player"}</strong>
                <span className="launcher-account-status">
                  {user.status === "ACTIVE" ? "Ready to play" : "Account restricted"}
                </span>
                <div className="launcher-account-links">
                  {accountLinks.map((link) => (
                    <Link key={link.href} href={link.href}>{link.label}</Link>
                  ))}
                </div>
                <button
                  className="launcher-logout"
                  disabled={signingOut}
                  type="button"
                  onClick={() => void signOut()}
                >
                  {signingOut ? "Signing out…" : "Log out"}
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="app-content" className="launcher-app-main world-main">
        {children}
      </main>

      <nav className="launcher-mobile-nav" aria-label="Mobile games">
        {primaryLinks.map((link) => {
          const active = isActive(pathname, link);
          return (
            <Link key={link.href} href={link.href} className={active ? "launcher-nav-active" : ""}>
              <span>{link.label === "Games" ? "◈" : link.label === "Monetaire" ? "♠" : "⚙"}</span>
              <small>{link.label}</small>
            </Link>
          );
        })}
        <Link href="/app/wallet"><span>◌</span><small>Account</small></Link>
      </nav>

      <footer className="launcher-footer launcher-auth-footer">
        <div className="launcher-footer-inner world-footer-inner">
          <span>FREE PLAY / SKILL GAMING WORLD</span>
          <nav aria-label="Player information">
            <Link href="/legal/play-coins">Play Coin rules</Link>
            <Link href="/app/responsible-play">Play controls</Link>
            <Link href="/app/support">Support</Link>
          </nav>
        </div>
      </footer>
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
    <header className="world-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children ? <div className="world-page-description">{children}</div> : null}
      </div>
      {actions ? <div className="world-page-actions">{actions}</div> : null}
    </header>
  );
}
