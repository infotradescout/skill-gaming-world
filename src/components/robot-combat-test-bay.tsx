"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RobotMatchCommand, RobotMatchState, RobotTestConsequence } from "@/domain";

type RobotCombatTestBayProps = {
  initialTest: RobotMatchState;
};

function componentLabel(component: string): string {
  return component.charAt(0).toUpperCase() + component.slice(1);
}

function consequenceTitle(consequence: RobotTestConsequence): string {
  return consequence.kind === "CONTACT" ? "Contact consequence" : "Weapon consequence";
}

export function RobotCombatTestBay({ initialTest }: RobotCombatTestBayProps) {
  const [test, setTest] = useState(initialTest);
  const [notice, setNotice] = useState(
    "The test bay is ready. Drive forward, advance the clock, then record what the contact changes.",
  );
  const [busy, setBusy] = useState(false);
  const report = test.testReport ?? {
    controlsAccepted: 0,
    contacts: 0,
    weaponUses: 0,
    resets: 0,
    consequences: [],
  };
  const robot = test.robots.A;
  const target = test.robots.B;

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetch(`/api/robot-combat/test-bay/${test.matchId}`, { cache: "no-store" })
        .then(async (response) => (response.ok ? await response.json() as { test: RobotMatchState } : undefined))
        .then((payload) => {
          if (payload?.test) setTest(payload.test);
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [test.matchId]);

  async function send(command: RobotMatchCommand) {
    setBusy(true);
    const actionId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const response = await fetch(`/api/robot-combat/test-bay/${test.matchId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, command }),
      });
      const payload = await response.json() as {
        test?: RobotMatchState;
        event?: { message?: string };
        rejection?: { message?: string };
      };
      if (payload.test) setTest(payload.test);
      setNotice(
        response.ok
          ? payload.event?.message ?? "Test action accepted by the authority."
          : payload.rejection?.message ?? "The test authority rejected that action.",
      );
    } catch {
      setNotice("The test authority could not be reached. No state change was recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="robot-combat-test-bay">
      <section className="robot-test-stage surface">
        <div className="arena-stage-header">
          <div>
            <p className="eyebrow">Bay 13 · private test authority</p>
            <h2>Learn what the machine does</h2>
          </div>
          <div className="arena-clock" aria-label="Private test clock">
            <span>Test time</span>
            <strong>{(test.elapsedMs / 1000).toFixed(1)}s</strong>
          </div>
        </div>
        <p className="muted arena-notice" role="status">{notice}</p>
        <div className="robot-test-lane" aria-label="Private robot test lane">
          <div className="robot-test-grid-lines" aria-hidden="true" />
          <div className="robot-test-start-label">START</div>
          <div className="robot-test-contact-gate">CONTACT GATE</div>
          <div className="robot-test-target">TRAINING TARGET</div>
          <div
            className="robot-test-robot"
            style={{ left: `${20 + Math.max(0, Math.min(55, ((robot?.position.z ?? -3.5) + 3.5) * 18))}%` }}
            aria-label={`Your machine at ${robot?.position.z.toFixed(2) ?? "0.00"} meters`}
          >
            <span className="arena-robot-chassis"><span className="arena-robot-nose" /></span>
            <span className="arena-robot-label">YOU</span>
          </div>
          <div className="robot-test-target-marker" aria-label={`Training target integrity ${target?.integrity ?? 100}%`}>
            <span className="arena-robot-chassis"><span className="arena-robot-nose" /></span>
            <span className="arena-robot-label">{target?.integrity ?? 100}%</span>
          </div>
        </div>
        <div className="arena-legend" aria-label="Private test legend">
          <span>Drive position {robot?.position.z.toFixed(2) ?? "0.00"}</span>
          <span>Training target {target?.integrity ?? 100}% integrity</span>
          <span>Ruleset {test.rulesetVersion}</span>
        </div>
      </section>

      <aside className="robot-combat-test-sidebar">
        <section className="surface-soft robot-test-controls">
          <p className="eyebrow">Test actions</p>
          <p className="muted small">Every action is checked and recorded by the same server authority used by the arena. The browser cannot set damage or totals.</p>
          <div className="robot-test-control-grid">
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => void send({ type: "CONTROL", slot: "A", throttle: 1, steering: 0 })}>
              Drive toward contact gate
            </button>
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => void send({ type: "TICK", elapsedMs: 120 })}>
              Advance test clock
            </button>
            <button className="button button-primary" type="button" disabled={busy} onClick={() => void send({ type: "TEST_CONTACT", slot: "A" })}>
              Record contact
            </button>
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => void send({ type: "FIRE", slot: "A" })}>
              Use weapon
            </button>
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => void send({ type: "RESET_TEST", slot: "A" })}>
              Reset private test
            </button>
          </div>
        </section>

        <section className="surface-soft robot-test-report">
          <p className="eyebrow">Consequence report</p>
          <h3>{report.consequences.length ? "What changed" : "No consequence recorded yet"}</h3>
          <div className="data-list">
            <div className="data-row"><span>Controls accepted</span><strong>{report.controlsAccepted}</strong></div>
            <div className="data-row"><span>Contacts</span><strong>{report.contacts}</strong></div>
            <div className="data-row"><span>Weapon uses</span><strong>{report.weaponUses}</strong></div>
            <div className="data-row"><span>Resets</span><strong>{report.resets}</strong></div>
          </div>
          {report.consequences.length ? (
            <ol className="robot-test-consequence-list">
              {[...report.consequences].reverse().map((consequence, index) => (
                <li key={`${consequence.elapsedMs}-${consequence.kind}-${index}`}>
                  <strong>{consequenceTitle(consequence)}</strong>
                  <span>{consequence.message}</span>
                  <small>{componentLabel(consequence.targetComponent)} −{consequence.damage} · {consequence.componentRemaining}% remaining</small>
                </li>
              ))}
            </ol>
          ) : <p className="muted small">Move into the gate and record a contact, or use the weapon, to see a causal result here.</p>}
        </section>

        <section className="surface-soft robot-test-rebuild">
          <p className="eyebrow">Build → test → rebuild</p>
          <p className="muted small">The test does not overwrite the saved revision. Return to the workshop when you have a question worth testing in the next version.</p>
          <Link className="button button-primary" href="/app/robot-combat">Rebuild this machine</Link>
          <Link className="text-link" href="/app/robot-combat">Back to workshop</Link>
        </section>
      </aside>
    </div>
  );
}
