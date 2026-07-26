import Link from "next/link";
import type { ReactNode } from "react";

type StatusTone = "live" | "hold" | "blocked";

export function StatusPill({
  children,
  tone = "hold",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function PageHero({
  eyebrow,
  title,
  children,
  actions,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="page-hero shell">
      <div className="page-hero-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="lead">{children}</div>
        {actions ? <div className="button-row">{actions}</div> : null}
      </div>
      {aside ? <div className="page-hero-aside">{aside}</div> : null}
    </section>
  );
}

export function Section({
  eyebrow,
  title,
  children,
  className = "",
}: {
  eyebrow?: string;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section shell ${className}`}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      {title ? <h2 className="section-title">{title}</h2> : null}
      {children}
    </section>
  );
}

export function FeatureCard({
  number,
  title,
  children,
  status,
}: {
  number?: string;
  title: string;
  children: ReactNode;
  status?: ReactNode;
}) {
  return (
    <article className="feature-card surface-soft">
      <div className="feature-card-top">
        <span className="icon-box" aria-hidden="true">
          {number ?? "•"}
        </span>
        {status}
      </div>
      <h3>{title}</h3>
      <div className="muted">{children}</div>
    </article>
  );
}

export function TrustDisclosure({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`trust-disclosure ${compact ? "trust-disclosure-compact" : ""}`}>
      <div>
        <p className="eyebrow">Play Coin disclosure</p>
        <strong>Entertainment value only.</strong>
      </div>
      <ul>
        <li>Play Coins have no cash value.</li>
        <li>They cannot be withdrawn, transferred, sold, or redeemed.</li>
        {!compact && <li>Monetaire Play does not award cash or valuable prizes.</li>}
      </ul>
      <Link href="/legal/play-coins">Read the Play Coin terms →</Link>
    </aside>
  );
}

export function ModeBoundary() {
  return (
    <div className="mode-boundary surface">
      <div>
        <StatusPill tone="live">Available</StatusPill>
        <h3>Monetaire Play</h3>
        <p>Practice, noncash competition, rank, and achievement experiences.</p>
      </div>
      <div>
        <StatusPill tone="blocked">Unavailable</StatusPill>
        <h3>Prize & casino modes</h3>
        <p>
          Prize competitions require separate player and jurisdiction eligibility.
          Casino cash wagering is not currently available.
        </p>
      </div>
    </div>
  );
}

export function EmptyState({
  symbol = "—",
  title,
  children,
  action,
}: {
  symbol?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state surface-soft">
      <div>
        <span className="icon-box" aria-hidden="true">
          {symbol}
        </span>
        <h3>{title}</h3>
        <div className="muted small">{children}</div>
        {action ? <div className="empty-state-action">{action}</div> : null}
      </div>
    </div>
  );
}

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title}>
        <p>{intro}</p>
      </PageHero>
      <Section className="legal-section">
        <article className="legal-copy">{children}</article>
      </Section>
    </>
  );
}

export function LockedNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="locked-notice callout">
      <StatusPill tone="blocked">Server-disabled</StatusPill>
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
