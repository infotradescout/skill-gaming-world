"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  RobotCombatRobotState,
  RobotMatchCommand,
  RobotMatchPlayer,
  RobotMatchSlot,
  RobotMatchState,
  RobotPartDefinition,
} from "@/domain";

type RobotCombatArenaProps = {
  playerId: string;
  initialMatch: RobotMatchState;
  catalog: RobotPartDefinition[];
};

const damageComponents = ["frame", "drive", "weapon", "power"] as const;

const phaseCopy: Record<RobotMatchState["phase"], string> = {
  WAITING_FOR_OPPONENT: "Share the match id with another builder.",
  READY_CHECK: "Both builders must confirm the inspected machine before the clock starts.",
  ACTIVE: "The server is accepting control, weapon, and clock commands.",
  COMPLETED: "The match is terminal. Read the damage report before rebuilding.",
  CANCELLED: "This match was cancelled before a winner was declared.",
  DISCONNECTED: "The match ended because a player disconnected.",
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function arenaPosition(robot: RobotCombatRobotState): { left: string; top: string } {
  const left = 8 + ((robot.position.x + 7.5) / 15) * 84;
  const top = 8 + ((robot.position.z + 5.5) / 11) * 84;
  return { left: `${clampPercent(left)}%`, top: `${clampPercent(top)}%` };
}

function partName(
  player: RobotMatchPlayer | undefined,
  category: RobotPartDefinition["category"],
  definitions: Map<string, RobotPartDefinition>,
): string {
  const part = player?.blueprint?.parts
    .map((candidate) => definitions.get(candidate.partKey))
    .find((candidate) => candidate?.category === category);
  return part?.displayName ?? "Not submitted";
}

function componentLabel(component: string): string {
  return component.charAt(0).toUpperCase() + component.slice(1);
}

function RobotStatusCard({
  slot,
  player,
  robot,
  self,
  definitions,
}: {
  slot: RobotMatchSlot;
  player: RobotMatchPlayer | undefined;
  robot: RobotCombatRobotState | undefined;
  self: boolean;
  definitions: Map<string, RobotPartDefinition>;
}) {
  return (
    <article className={`robot-status-card ${self ? "robot-status-card-self" : ""}`}>
      <div className="robot-status-heading">
        <div>
          <p className="eyebrow">Machine {slot}{self ? " · you" : " · opponent"}</p>
          <strong>{player?.displayName ?? "Waiting for builder"}</strong>
        </div>
        <span className={`pill ${player?.ready ? "pill-live" : "pill-hold"}`}>
          {player?.ready ? "Ready" : "Not ready"}
        </span>
      </div>
      <div className="robot-status-build">
        <span>{partName(player, "CHASSIS", definitions)}</span>
        <span>{partName(player, "DRIVE", definitions)}</span>
        <span>{partName(player, "WEAPON", definitions)}</span>
      </div>
      {robot ? (
        <>
          <div className="robot-integrity-row">
            <span>Integrity</span>
            <strong>{robot.integrity}%</strong>
          </div>
          <div className="robot-integrity-meter" aria-label={`${slot} integrity ${robot.integrity}%`}>
            <span style={{ width: `${clampPercent(robot.integrity)}%` }} />
          </div>
          <div className="robot-component-grid">
            {damageComponents.map((component) => {
              const remaining = robot.components[component] ?? 0;
              const disabled = robot.disabledComponents.includes(component);
              return (
                <div className={disabled ? "robot-component robot-component-disabled" : "robot-component"} key={component}>
                  <div><span>{componentLabel(component)}</span><strong>{remaining}%</strong></div>
                  <div className="robot-component-meter"><span style={{ width: `${clampPercent(remaining)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </>
      ) : <p className="muted small">Machine state appears when both builders are ready.</p>}
    </article>
  );
}

export function RobotCombatArena({ playerId, initialMatch, catalog }: RobotCombatArenaProps) {
  const [match, setMatch] = useState(initialMatch);
  const [notice, setNotice] = useState(phaseCopy[initialMatch.phase]);
  const [busy, setBusy] = useState(false);
  const definitions = useMemo(
    () => new Map(catalog.map((part) => [part.key, part])),
    [catalog],
  );

  const mySlot = (Object.entries(match.players).find(([, player]) => player?.playerId === playerId)?.[0] as RobotMatchSlot | undefined);
  const opponentSlot: RobotMatchSlot | undefined = mySlot === "A" ? "B" : mySlot === "B" ? "A" : undefined;
  const myPlayer = mySlot ? match.players[mySlot] : undefined;
  const opponentRobot = opponentSlot ? match.robots[opponentSlot] : undefined;
  const terminal = match.phase === "COMPLETED" || match.phase === "CANCELLED" || match.phase === "DISCONNECTED";

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetch(`/api/robot-combat/matches/${match.matchId}`, { cache: "no-store" })
        .then(async (response) => (response.ok ? await response.json() as { match: RobotMatchState } : undefined))
        .then((payload) => {
          if (!cancelled && payload?.match) {
            setMatch(payload.match);
            setNotice(phaseCopy[payload.match.phase]);
          }
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [match.matchId]);

  useEffect(() => {
    if (match.phase !== "ACTIVE") return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      const actionId = `arena-tick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      void fetch(`/api/robot-combat/matches/${match.matchId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, command: { type: "TICK", elapsedMs: 120 } }),
      })
        .then(async (response) => (response.ok ? await response.json() as { match?: RobotMatchState } : undefined))
        .then((payload) => {
          if (!cancelled && payload?.match) setMatch(payload.match);
        })
        .catch(() => undefined);
    }, 600);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [match.phase, match.matchId]);

  async function sendMatchCommand(command: RobotMatchCommand) {
    if (!mySlot && command.type !== "TICK") return;
    setBusy(true);
    const actionId = `arena-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const response = await fetch(`/api/robot-combat/matches/${match.matchId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, command }),
      });
      const payload = await response.json() as {
        match?: RobotMatchState;
        event?: { message?: string };
        rejection?: { message?: string };
      };
      if (payload.match) setMatch(payload.match);
      setNotice(
        response.ok
          ? payload.event?.message ?? "Command accepted by the match authority."
          : payload.rejection?.message ?? "The match authority rejected that command.",
      );
    } catch {
      setNotice("The match authority could not be reached. No state change was recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="robot-combat-arena">
      <section className="robot-combat-arena-stage surface">
        <div className="arena-stage-header">
          <div>
            <p className="eyebrow">Authority test arena · {match.arenaKey}</p>
            <h2>{match.phase.replaceAll("_", " ")}</h2>
          </div>
          <div className="arena-clock" aria-label="Authoritative match clock">
            <span>Clock</span>
            <strong>{(match.elapsedMs / 1000).toFixed(1)}s</strong>
          </div>
        </div>
        <p className="muted arena-notice" role="status">{notice}</p>
        <div className="arena-stage" aria-label="Robot Combat top-down authority arena">
          <div className="arena-grid-lines" aria-hidden="true" />
          <div className="arena-center-mark" aria-hidden="true" />
          {(["A", "B"] as const).map((slot) => {
            const robot = match.robots[slot];
            if (!robot) return null;
            const position = arenaPosition(robot);
            const self = slot === mySlot;
            return (
              <div
                className={`arena-robot ${self ? "arena-robot-self" : "arena-robot-opponent"}`}
                key={slot}
                style={{ left: position.left, top: position.top, transform: `translate(-50%, -50%) rotate(${robot.heading}rad)` }}
              >
                <span className="arena-robot-chassis"><span className="arena-robot-nose" /></span>
                <span className="arena-robot-label">{slot} · {robot.integrity}%</span>
              </div>
            );
          })}
          {match.phase === "WAITING_FOR_OPPONENT" ? <div className="arena-stage-message">Waiting for another builder</div> : null}
          {match.phase === "READY_CHECK" ? <div className="arena-stage-message">Both machines must be ready</div> : null}
          {terminal ? <div className="arena-stage-message arena-stage-message-terminal">Match report ready</div> : null}
        </div>
        <div className="arena-legend" aria-label="Arena legend">
          <span><i className="legend-dot legend-dot-self" /> Your machine</span>
          <span><i className="legend-dot legend-dot-opponent" /> Opponent machine</span>
          <span>Ruleset {match.rulesetVersion}</span>
        </div>
      </section>

      <aside className="robot-combat-arena-sidebar">
        <RobotStatusCard slot="A" player={match.players.A} robot={match.robots.A} self={mySlot === "A"} definitions={definitions} />
        <RobotStatusCard slot="B" player={match.players.B} robot={match.robots.B} self={mySlot === "B"} definitions={definitions} />

        <section className="surface-soft arena-controls">
          <p className="eyebrow">Operator controls</p>
          {mySlot && myPlayer && match.phase === "READY_CHECK" ? (
            <button className="button button-primary" type="button" disabled={busy || myPlayer.ready || !myPlayer.inspection?.valid} onClick={() => void sendMatchCommand({ type: "READY", slot: mySlot })}>
              {myPlayer.ready ? "Ready confirmed" : "Ready this machine"}
            </button>
          ) : null}
          {mySlot && match.phase === "ACTIVE" ? (
            <div className="arena-control-grid">
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "CONTROL", slot: mySlot, throttle: 1, steering: 0 })}>Drive forward</button>
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "CONTROL", slot: mySlot, throttle: 0, steering: -1 })}>Turn left</button>
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "CONTROL", slot: mySlot, throttle: 0, steering: 1 })}>Turn right</button>
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "CONTROL", slot: mySlot, throttle: 0, steering: 0 })}>Brake</button>
              <button className="button button-primary arena-fire-button" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "FIRE", slot: mySlot })}>Fire weapon</button>
            </div>
          ) : null}
          {match.phase === "WAITING_FOR_OPPONENT" ? (
            <div className="callout"><strong>Share this match id</strong><p className="small">{match.matchId}</p><p className="muted small">The other builder joins from their own workshop.</p></div>
          ) : null}
          {match.phase === "READY_CHECK" && !myPlayer?.inspection?.valid ? <p className="muted small">This player still needs an inspection-valid build.</p> : null}
          {match.phase === "ACTIVE" ? <p className="muted small">The clock advances automatically from this browser while the match is active.</p> : null}
        </section>

        {terminal ? (
          <section className="surface-soft arena-report">
            <p className="eyebrow">Post-match rebuild</p>
            <h3>{match.winnerSlot ? `Machine ${match.winnerSlot} won` : "No winner declared"}</h3>
            <p>{match.terminalReason ?? "The match ended without a terminal reason."}</p>
            {opponentRobot?.damageLog.at(-1) ? (
              <p className="small">Last recorded impact: {componentLabel(opponentRobot.damageLog.at(-1)!.targetComponent)} took {opponentRobot.damageLog.at(-1)!.damage} damage.</p>
            ) : null}
            {mySlot && match.rebuildQuestions[mySlot]?.length ? (
              <>
                <strong>Questions for your next revision</strong>
                <ul>{match.rebuildQuestions[mySlot]?.map((question) => <li key={question}>{question}</li>)}</ul>
              </>
            ) : null}
            <Link className="button button-secondary" href="/app/robot-combat">Rebuild in workshop</Link>
          </section>
        ) : null}

        <Link className="text-link" href="/app/robot-combat">Back to workshop</Link>
      </aside>
    </div>
  );
}
