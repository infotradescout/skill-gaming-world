"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RobotBlueprint,
  RobotInspection,
  RobotMatchCommand,
  RobotMatchState,
  RobotPartCategory,
  RobotPartDefinition,
  RobotStarterArchetype,
} from "@/domain";

type SavedBuild = {
  id: string;
  latestRevision: number;
  revisions: Array<{
    revision: number;
    blueprint: RobotBlueprint;
    inspection: RobotInspection;
  }>;
};

type WorkshopProps = {
  playerId: string;
  catalog: RobotPartDefinition[];
  starterBlueprints: Record<RobotStarterArchetype, RobotBlueprint>;
};

const archetypes: Array<{ key: RobotStarterArchetype; title: string; description: string }> = [
  { key: "PUSHER", title: "Pusher", description: "Low, direct, and easy to read while learning movement." },
  { key: "CONTROL", title: "Control", description: "Tracked traction and a continuous weapon for facing and timing." },
  { key: "STRIKER", title: "Striker", description: "Heavier frame and committed hammer with a recovery tradeoff." },
];

function cloneBlueprint(blueprint: RobotBlueprint): RobotBlueprint {
  return JSON.parse(JSON.stringify(blueprint)) as RobotBlueprint;
}

function formatPartCategory(category?: RobotPartCategory): string {
  const labels: Record<string, string> = {
    CHASSIS: "Frame",
    DRIVE: "Drive",
    ARMOR: "Armor",
    WEAPON: "Weapon",
    POWER: "Power",
  };
  return category ? labels[category] ?? category.toLowerCase() : "Part";
}

function formatPartSocket(socket: string): string {
  return socket.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function RobotCombatWorkshop({ playerId, catalog, starterBlueprints }: WorkshopProps) {
  const [blueprint, setBlueprint] = useState(() => cloneBlueprint(starterBlueprints.PUSHER));
  const [inspection, setInspection] = useState<RobotInspection | undefined>();
  const [savedBuild, setSavedBuild] = useState<SavedBuild | undefined>();
  const [match, setMatch] = useState<RobotMatchState>();
  const [joinMatchId, setJoinMatchId] = useState("");
  const [notice, setNotice] = useState("Your machine is a draft. Save it when you are ready to test it.");
  const [busy, setBusy] = useState(false);
  const draftTouched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/robot-combat/builds", { cache: "no-store" })
      .then(async (response) => (response.ok ? (await response.json()) as { builds: SavedBuild[] } : undefined))
      .then((payload) => {
        if (cancelled || draftTouched.current || !payload?.builds?.[0]) return;
        const first = payload.builds[0];
        const latest = first.revisions.at(-1);
        if (!latest) return;
        setSavedBuild(first);
        setBlueprint(cloneBlueprint(latest.blueprint));
        setInspection(latest.inspection);
        setNotice("Your latest saved build is loaded.");
      })
      .catch(() => {
        if (!cancelled) setNotice("Choose a build style to get started.");
      });
    return (
    <div className="robot-combat-workshop">
      <section className="robot-workshop-intro surface">
        <div className="robot-workshop-visual" aria-hidden="true">
          <div className="robot-blueprint-grid" />
          <div className="robot-blueprint-body">
            <span className="robot-blueprint-wheel robot-blueprint-wheel-left" />
            <span className="robot-blueprint-wheel robot-blueprint-wheel-right" />
            <span className="robot-blueprint-chassis">
              <span className="robot-blueprint-wedge" />
              <span className="robot-blueprint-weapon" />
            </span>
          </div>
          <span className="robot-blueprint-label">BUILD / TEST / FIGHT</span>
        </div>
        <div className="robot-workshop-intro-copy">
          <p className="eyebrow">Your workshop</p>
          <h2>Build a machine that teaches you back.</h2>
          <p>
            Start with a fighting style, change the parts, then test what your choices
            do before you face another builder.
          </p>
          <div className="robot-step-strip" aria-label="Robot Combat flow">
            <span><b>1</b> Build</span>
            <span><b>2</b> Test</span>
            <span><b>3</b> Fight</span>
          </div>
        </div>
      </section>

      <div className="robot-workshop-layout">
        <section className="dashboard-primary surface robot-workshop-builder">
          <div className="app-section-header">
            <div>
              <p className="eyebrow">Machine build</p>
              <h2>{blueprint.name}</h2>
            </div>
            <span className={inspection?.valid ? "pill pill-live" : "pill pill-hold"}>
              {inspection?.valid ? "Ready to test" : "Draft"}
            </span>
          </div>
          <p className="muted" role="status">{notice}</p>

          <div className="data-list surface-soft">
            {blueprint.parts.map((part) => {
              const definition = definitions.get(part.partKey);
              const options = catalog.filter((candidate) => candidate.category === definition?.category);
              const partLabel = definition?.displayName ?? "Unknown part";
              return (
                <div className="data-row robot-part-row" key={part.instanceId}>
                  <div>
                    <strong>{partLabel}</strong>
                    <small>{formatPartCategory(definition?.category)} · {formatPartSocket(part.socket)}</small>
                  </div>
                  <select
                    aria-label={"Choose " + partLabel}
                    value={part.partKey}
                    onChange={(event) => replacePart(part.instanceId, event.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option.key} value={option.key}>{option.displayName}</option>
                    ))}
                  </select>
                  <button className="button button-secondary" type="button" onClick={() => removePart(part.instanceId)}>
                    Remove part
                  </button>
                </div>
              );
            })}
          </div>

          <div className="button-row robot-builder-actions">
            <button className="button button-secondary" type="button" onClick={() => addPart("DRIVE")}>Add drive module</button>
            <button className="button button-secondary" type="button" onClick={() => addPart("ARMOR")}>Add armor module</button>
            <button className="button button-secondary" type="button" onClick={() => addPart("WEAPON")}>Add weapon module</button>
            <button className="button button-primary" type="button" disabled={busy} onClick={() => void saveRevision()}>
              {busy ? "Saving…" : "Save build & check it"}
            </button>
          </div>
        </section>

        <aside className="robot-workshop-sidebar">
          <section className="surface-soft">
            <p className="eyebrow">Choose a build style</p>
            <p className="muted small">Each starting style teaches a different way to move, control space, or commit to a hit.</p>
            {archetypes.map((archetype) => (
              <button className="workshop-archetype" type="button" key={archetype.key} onClick={() => chooseArchetype(archetype.key)}>
                <strong>{archetype.title}</strong>
                <span>{archetype.description}</span>
              </button>
            ))}
          </section>

          <section className="surface-soft">
            <p className="eyebrow">Build readout</p>
            {inspection ? (
              <div className="data-list">
                <div className="data-row"><span>Weight</span><strong>{inspection.metrics.massKg} / {inspection.metrics.maxMassKg} kg</strong></div>
                <div className="data-row"><span>Power reserve</span><strong>{inspection.metrics.powerReserve}</strong></div>
                <div className="data-row"><span>Balance</span><strong>{inspection.metrics.balanceScore} / 100</strong></div>
                <div className="data-row"><span>Clearance</span><strong>{inspection.metrics.forcePath}</strong></div>
                {inspection.errors.length > 0 ? <div className="callout"><p>{inspection.errors[0]?.message}</p></div> : null}
              </div>
            ) : (
              <p className="muted">Save your build to see its weight, power, balance, and clearance.</p>
            )}
          </section>

          <section className="surface-soft robot-next-step">
            <p className="eyebrow">Test your machine</p>
            <h3>Learn what changes before you fight.</h3>
            <p className="muted small">Take a saved machine into a private test, drive it to the contact gate, use the weapon, and rebuild from what you learn.</p>
            <button className="button button-secondary" type="button" disabled={!savedBuild || busy} onClick={() => void createTestBay()}>
              Open private test
            </button>
          </section>

          <section className="surface-soft robot-next-step">
            <p className="eyebrow">Fight another builder</p>
            <p className="muted small">When your build is ready, open a free match or join one with a match code.</p>
            <button className="button button-primary" type="button" disabled={!savedBuild || busy} onClick={() => void createMatch()}>
              Create a free match
            </button>

            {match ? (
              <div className="data-list robot-match-summary">
                <div className="data-row"><span>Match code</span><strong>{match.matchId}</strong></div>
                <div className="data-row"><span>Players</span><strong>{Object.keys(match.players).length} of 2</strong></div>
                {mySlot && myPlayer ? (
                  <div className="data-row"><span>Your side</span><strong>{mySlot} · {myPlayer.ready ? "ready" : "waiting"}</strong></div>
                ) : null}
                {opponentSlot ? (
                  <div className="data-row"><span>Opponent</span><strong>{match.players[opponentSlot]?.displayName ?? "Waiting"}</strong></div>
                ) : null}
                <Link className="button button-secondary" href={"/app/robot-combat/matches/" + match.matchId}>
                  Open match arena
                </Link>
                {mySlot && myPlayer && match.phase === "READY_CHECK" ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={busy || myPlayer.ready || !myPlayer.inspection?.valid}
                    onClick={() => void sendMatchCommand({ type: "READY", slot: mySlot })}
                  >
                    {myPlayer.ready ? "Machine ready" : "Ready my machine"}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="muted small">Your next match will appear here after you save a build.</p>
            )}

            <label className="small" htmlFor="robot-match-id">Join with a match code</label>
            <input id="robot-match-id" value={joinMatchId} onChange={(event) => setJoinMatchId(event.target.value)} placeholder="Paste match code" />
            <button className="button button-secondary" type="button" disabled={!savedBuild || busy} onClick={() => void joinMatch()}>
              Join match
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
