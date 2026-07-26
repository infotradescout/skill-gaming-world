"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "./brand";
import { EmptyState } from "./page-elements";

const adminLinks = [
  ["/admin", "Control room"],
  ["/admin/users", "Users"],
  ["/admin/competitions", "Competitions"],
  ["/admin/deals", "Deals"],
  ["/admin/fraud", "Fraud review"],
  ["/admin/appeals", "Appeals"],
  ["/admin/ledger", "Ledger"],
  ["/admin/jurisdictions", "Jurisdictions"],
  ["/admin/feature-gates", "Feature gates"],
  ["/admin/audit", "Audit history"],
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="admin-frame">
      <a className="skip-link" href="#admin-content">
        Skip to content
      </a>
      <aside className="admin-sidebar">
        <BrandMark compact />
        <div className="admin-label">
          <span className="eyebrow">Restricted</span>
          <strong>Admin console</strong>
        </div>
        <nav aria-label="Admin">
          {adminLinks.map(([href, label]) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? "admin-nav-active" : ""}>
                {label}
              </Link>
            );
          })}
        </nav>
        <Link href="/app">← Player app</Link>
      </aside>
      <main id="admin-content" className="admin-content">
        <div className="admin-scope-warning">
          Prototype surface · privileged actions require server authorization and an append-only audit
          event.
        </div>
        {children}
      </main>
    </div>
  );
}

export function AdminPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="pill pill-hold">No live authority</span>
      </header>
      {children}
    </>
  );
}

export function AdminEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <EmptyState symbol="∅" title={title}>
      <p>{description}</p>
    </EmptyState>
  );
}

export function AdminRows({
  children,
  headers,
}: {
  children: ReactNode;
  headers: [string, string, string];
}) {
  return (
    <div className="admin-table surface">
      <div className="admin-table-header">
        {headers.map((header) => <span key={header}>{header}</span>)}
      </div>
      {children}
    </div>
  );
}

export function AdminRow({
  primary,
  secondary,
  status,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  status: ReactNode;
}) {
  return (
    <div className="admin-table-row">
      <div>{primary}</div>
      <div>{secondary}</div>
      <div>{status}</div>
    </div>
  );
}
