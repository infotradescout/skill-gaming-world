"use client";

import { useState } from "react";
import { StatusPill } from "./page-elements";

type WalletEntry = {
  id: string;
  direction: "CREDIT" | "DEBIT";
  amountMinor: number;
  balanceAfterMinor: number;
  reason: string;
  createdAt: string;
};

export function WalletSandbox({
  initialBalance,
  initialEntries,
}: {
  initialBalance: number;
  initialEntries: WalletEntry[];
}) {
  const [message, setMessage] = useState("");
  const [balance, setBalance] = useState(initialBalance);
  const [entries, setEntries] = useState<WalletEntry[]>(initialEntries);
  const [pending, setPending] = useState("");
  const packages = [
    { id: "PRACTICE_1000", label: "Starter", units: "1,000 Play Coins" },
    { id: "PRACTICE_2500", label: "Standard", units: "2,500 Play Coins" },
    { id: "PRACTICE_6000", label: "Extended", units: "6,000 Play Coins" },
  ];

  async function loadLedger() {
    try {
      const response = await fetch("/api/play-coins", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as {
        balanceMinor?: number;
        entries?: typeof entries;
      };
      if (typeof body.balanceMinor === "number") setBalance(body.balanceMinor);
      if (Array.isArray(body.entries)) setEntries(body.entries);
    } catch {
      setMessage("The Play Coin ledger is not reachable. No balance is shown.");
    }
  }

  async function selectPackage(packageKey: string, label: string) {
    setPending(packageKey);
    setMessage("");
    try {
      const response = await fetch("/api/play-coins/sandbox-purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packageKey,
          idempotencyKey: crypto.randomUUID(),
          acknowledgeSandboxOnly: true,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            entry?: { balanceAfterMinor?: number };
            error?: { message?: string } | string;
            warning?: string;
          }
        | null;
      if (!response.ok) {
        const error =
          typeof body?.error === "object" ? body.error.message : body?.error;
        setMessage(error ?? "The sandbox request was not completed.");
        return;
      }
      if (typeof body?.entry?.balanceAfterMinor === "number") {
        setBalance(body.entry.balanceAfterMinor);
      }
      setMessage(
        `${label} sandbox package confirmed. No real card was charged. ${
          body?.warning ?? ""
        }`.trim(),
      );
      await loadLedger();
      window.dispatchEvent(new Event("playcoin:changed"));
    } catch {
      setMessage("The sandbox adapter is not reachable. No charge or balance change occurred.");
    } finally {
      setPending("");
    }
  }

  return (
    <>
      <div className="wallet-balance surface">
        <div><span>Available balance</span><strong>{balance.toLocaleString()}</strong></div>
        <p>Confirmed by the Play Coin ledger.</p>
      </div>
      <div className="wallet-sandbox surface">
        <div className="wallet-sandbox-header">
          <div>
            <StatusPill tone="hold">Sandbox only</StatusPill>
            <h2>Play Coin packages</h2>
            <p>No production payment provider is connected. No card can be charged.</p>
          </div>
          <span className="sandbox-stamp">TEST ADAPTER</span>
        </div>
        <div className="package-grid">
          {packages.map((item) => (
            <button
              className="package-card"
              disabled={Boolean(pending)}
              key={item.id}
              type="button"
              onClick={() => void selectPackage(item.id, item.label)}
            >
              <span>{item.units}</span>
              <strong>{item.label}</strong>
              <small>{pending === item.id ? "Confirming…" : "Run sandbox adapter"}</small>
            </button>
          ))}
        </div>
        {message ? <p className="sandbox-message" role="status">{message}</p> : null}
        <p className="small muted">
          Play Coins have no cash value and cannot be withdrawn, transferred, sold, or
          redeemed. They cannot fund prize competitions or casino cash.
        </p>
      </div>
      <section className="app-section">
        <div className="app-section-header"><div><p className="eyebrow">Ledger</p><h2>Transaction history</h2></div></div>
        {entries.length === 0 ? (
          <div className="empty-state surface-soft">
            <div>
              <span className="icon-box" aria-hidden="true">≡</span>
              <h3>No Play Coin entries</h3>
              <p className="muted small">Every balance change must appear as an auditable entry.</p>
            </div>
          </div>
        ) : (
          <div className="data-list surface-soft">
            {entries.map((entry) => (
              <div className="data-row wallet-entry" key={entry.id}>
                <div><strong>{entry.reason}</strong><small>{new Date(entry.createdAt).toLocaleString()}</small></div>
                <span>{entry.direction}</span>
                <strong>{entry.direction === "CREDIT" ? "+" : "−"}{entry.amountMinor.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

type RestrictionAction = "cooldown" | "self-exclusion" | "closure";

export function ResponsibleControls() {
  const [reminder, setReminder] = useState("off");
  const [exclusionDuration, setExclusionDuration] = useState("30_DAYS");
  const [closurePassword, setClosurePassword] = useState("");
  const [pendingAction, setPendingAction] = useState<RestrictionAction | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitRestriction(action: RestrictionAction) {
    setSubmitting(true);
    setMessage("");
    try {
      const endpoint =
        action === "closure" ? "/api/account/close" : `/api/responsible-play/${action}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "cooldown"
            ? { hours: 24, confirm: true }
            : action === "self-exclusion"
              ? { scope: "ALL_PRODUCTS", duration: exclusionDuration, confirm: true }
              : { password: closurePassword, confirmation: "CLOSE MY ACCOUNT" },
        ),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } | string }
          | null;
        const error =
          typeof body?.error === "object" ? body.error.message : body?.error;
        setMessage(error ?? "The restriction service did not confirm this request. No restriction is shown as active.");
        return;
      }
      setMessage(
        action === "cooldown"
          ? "Cooldown confirmed. New sessions are blocked for the recorded period."
          : action === "self-exclusion"
            ? "Self-exclusion confirmed for the recorded scope."
            : "Account-closure request confirmed.",
      );
      if (action === "closure") {
        window.location.assign("/auth/login");
      }
    } catch {
      setMessage("The restriction service is unavailable. No restriction is shown as active.");
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  }

  return (
    <div className="responsible-controls">
      <section className="control-card surface-soft">
        <div>
          <span className="icon-box" aria-hidden="true">◷</span>
          <h2>Play reminder</h2>
          <p>Optional device preference. Official session timing remains server-controlled.</p>
        </div>
        <div className="field">
          <label htmlFor="reminder">Reminder interval</label>
          <select
            id="reminder"
            value={reminder}
            onChange={(event) => {
              const value = event.target.value;
              setReminder(value);
              window.localStorage.setItem("monetaire.playReminder", value);
              setMessage(value === "off" ? "Play reminder turned off on this device." : `Device reminder set to ${value}.`);
            }}
          >
            <option value="off">Off</option>
            <option value="30 minutes">30 minutes</option>
            <option value="60 minutes">60 minutes</option>
            <option value="90 minutes">90 minutes</option>
          </select>
        </div>
      </section>

      <section className="control-card surface-soft">
        <div>
          <span className="icon-box" aria-hidden="true">Ⅱ</span>
          <h2>24-hour cooldown</h2>
          <p>Request a temporary block on starting new sessions.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => setPendingAction("cooldown")}>
          Start cooldown
        </button>
      </section>

      <section className="control-card control-card-danger surface-soft">
        <div>
          <span className="icon-box" aria-hidden="true">×</span>
          <h2>Self-exclusion</h2>
          <p>
            Blocks product access according to the recorded scope. Ordinary support
            cannot remove an active exclusion.
          </p>
        </div>
        <div className="control-action-stack">
          <div className="field">
            <label htmlFor="exclusion-duration">Minimum period</label>
            <select id="exclusion-duration" value={exclusionDuration} onChange={(event) => setExclusionDuration(event.target.value)}>
              <option value="30_DAYS">30 days</option>
              <option value="90_DAYS">90 days</option>
              <option value="1_YEAR">1 year</option>
              <option value="PERMANENT">Permanent</option>
            </select>
          </div>
          <button className="button button-danger" type="button" onClick={() => setPendingAction("self-exclusion")}>
            Review self-exclusion
          </button>
        </div>
      </section>

      <section className="control-card surface-soft">
        <div>
          <span className="icon-box" aria-hidden="true">□</span>
          <h2>Close account</h2>
          <p>Request account closure. Required financial, security, or dispute records may be retained.</p>
        </div>
        <button className="button button-quiet" type="button" onClick={() => setPendingAction("closure")}>
          Review closure
        </button>
      </section>

      {message ? <p className="control-message" role="status">{message}</p> : null}

      {pendingAction ? (
        <div className="confirmation-backdrop" role="presentation">
          <section className="confirmation-dialog surface" role="dialog" aria-modal="true" aria-labelledby="restriction-title">
            <StatusPill tone={pendingAction === "cooldown" ? "hold" : "blocked"}>
              Confirmation required
            </StatusPill>
            <h2 id="restriction-title">
              {pendingAction === "cooldown"
                ? "Start a 24-hour cooldown?"
                : pendingAction === "self-exclusion"
                  ? "Request self-exclusion?"
                  : "Request account closure?"}
            </h2>
            <p>
              {pendingAction === "self-exclusion"
                ? "This is a serious restriction. It is not removable by ordinary support staff."
                : "The server must confirm the request before it is shown as active."}
            </p>
            {pendingAction === "closure" ? (
              <div className="field">
                <label htmlFor="closure-password">Confirm with your password</label>
                <input
                  id="closure-password"
                  type="password"
                  autoComplete="current-password"
                  value={closurePassword}
                  onChange={(event) => setClosurePassword(event.target.value)}
                />
              </div>
            ) : null}
            <div className="button-row">
              <button
                className={pendingAction === "cooldown" ? "button button-primary" : "button button-danger"}
                disabled={submitting || (pendingAction === "closure" && !closurePassword)}
                type="button"
                onClick={() => void submitRestriction(pendingAction)}
              >
                {submitting ? "Submitting…" : "Confirm request"}
              </button>
              <button className="button button-quiet" disabled={submitting} type="button" onClick={() => setPendingAction(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
