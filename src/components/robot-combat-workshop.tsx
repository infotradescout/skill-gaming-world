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
    return () => {
      cancelled = true;
    };
  }, []);

  const definitions = useMemo(
    () => new Map(catalog.map((part) => [part.key, part])),
    [catalog],
  );

  const mySlot = match
    ? (Object.entries(match.players).find(([, player]) => player?.playerId === playerId)?.[0] as "A" | "B" | undefined)
    : undefined;
  const myPlayer = mySlot ? match?.players[mySlot] : undefined;
  const opponentSlot = mySlot === "A" ? "B" : mySlot === "B" ? "A" : undefined;
  
  useEffect(() => {
    if (!match?.matchId) return;
    const matchId = match.matchId;
    const poll = window.setInterval(() => {
      void fetch(`/api/robot-combat/matches/${matchId}`, { cache: "no-store" })
        .then(async (response) => (response.ok ? (await response.json()) as { match: RobotMatchState } : undefined))
        .then((payload) => {
          if (payload?.match) setMatch(payload.match);
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(poll);
  }, [match?.matchId]);

  function chooseArchetype(archetype: RobotStarterArchetype) {
    draftTouched.current = true;
    setBlueprint(cloneBlueprint(starterBlueprints[archetype]));
    setInspection(undefined);
    setNotice("Build style loaded. Change the parts, then save when you are ready.");
  }

  function replacePart(instanceId: string, partKey: string) {
    draftTouched.current = true;
    setBlueprint((current) => ({
      ...current,
      parts: current.parts.map((part) =>
        part.instanceId === instanceId ? { ...part, partKey } : part,
      ),
    }));
    setInspection(undefined);
    setNotice("Your changes are ready to save and test.");
  }

  function removePart(instanceId: string) {
    draftTouched.current = true;
    const removed = new Set([instanceId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const part of blueprint.parts) {
        if (part.parentInstanceId && removed.has(part.parentInstanceId) && !removed.has(part.instanceId)) {
          removed.add(part.instanceId);
          changed = true;
        }
      }
    }
    setBlueprint((current) => ({
      ...current,
      parts: current.parts.filter((part) => !removed.has(part.instanceId)),
    }));
    setInspection(undefined);
    setNotice("Part removed. Reconnect the build before saving.");
  }

  function addPart(category: RobotPartCategory) {
    const frame = blueprint.parts.find((part) => definitions.get(part.partKey)?.category === "CHASSIS");
    const frameDefinition = frame ? definitions.get(frame.partKey) : undefined;
    const occupied = new Set(
      blueprint.parts
        .filter((part) => part.parentInstanceId === frame?.instanceId)
        .map((part) => part.socket),
    );
    const socket = frameDefinition?.sockets.find(
      (candidate) => candidate.accepts.includes(category) && !occupied.has(candidate.key),
    );
    const definition = catalog.find((part) => part.category === category);
    if (!frame || !socket || !definition) {
      setNotice("That slot is already full. Remove a part or choose another build style.");
      return;
    }
    draftTouched.current = true;
    const suffix = `${Date.now()}-${blueprint.parts.length}`;
    setBlueprint((current) => ({
      ...current,
      parts: [
        ...current.parts,
        {
          instanceId: `custom-${suffix}`,
          partKey: definition.key,
          parentInstanceId: frame.instanceId,
          socket: socket.key,
          position: { x: 0, y: socket.key.startsWith("top") ? 0.82 : 0.3, z: socket.key.includes("front") ? -0.95 : 0 },
          rotationY: 0,
        },
      ],
    }));
    setInspection(undefined);
    setNotice("Your changes are ready to save and test.");
  }

  async function saveRevision() {
    draftTouched.current = true;
    setBusy(true);
    setNotice("Checking your build…");
    try {
      const response = await fetch("/api/robot-combat/builds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildKey: "workshop-machine", blueprint }),
      });
      const payload = (await response.json()) as { build?: SavedBuild; error?: { message?: string } };
      if (!response.ok || !payload.build) {
        setNotice(payload.error?.message ?? "We could not save that build.");
        return;
      }
      const latest = payload.build.revisions.at(-1);
      setSavedBuild(payload.build);
      if (latest) setInspection(latest.inspection);
      setNotice("Build saved. Your machine is ready to test.");
    } catch {
      setNotice("We could not save the build. Your draft is still here.");
    } finally {
      setBusy(false);
    }
  }

  async function createMatch() {
    if (!savedBuild) {
      setNotice("Save the build before opening a match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/robot-combat/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildId: savedBuild.id, revision: savedBuild.latestRevision }),
      });
      const payload = (await response.json()) as { match?: RobotMatchState; error?: { message?: string } };
      if (!response.ok || !payload.match) {
        setNotice(payload.error?.message ?? "The match could not be opened.");
        return;
      }
      setMatch(payload.match);
      setNotice("Match opened. Share the code with another builder.");
    } catch {
      setNotice("We could not open that match. No state was changed.");
    } finally {
      setBusy(false);
    }
  }

  async function createTestBay() {
    if (!savedBuild) {
      setNotice("Save the build before opening a private test.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/robot-combat/test-bay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildId: savedBuild.id, revision: savedBuild.latestRevision }),
      });
      const payload = (await response.json()) as { test?: RobotMatchState; error?: { message?: string } };
      if (!response.ok || !payload.test) {
        setNotice(payload.error?.message ?? "The private test bay could not be opened.");
        return;
      }
      window.location.assign(`/app/robot-combat/test-bay/${payload.test.matchId}`);
    } catch {
      setNotice("We could not open the private test. No state was changed.");
    } finally {
      setBusy(false);
    }
  }

  async function joinMatch() {
    if (!savedBuild || !joinMatchId.trim()) {
      setNotice("Save the build and enter a match code before joining.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/robot-combat/matches/${joinMatchId.trim()}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildId: savedBuild.id, revision: savedBuild.latestRevision }),
      });
      const payload = (await response.json()) as { match?: RobotMatchState; error?: { message?: string } };
      if (!response.ok || !payload.match) {
        setNotice(payload.error?.message ?? "The match could not be joined.");
        return;
      }
      setMatch(payload.match);
      setNotice("Match joined. Both builders need to ready their machines.");
    } catch {
      setNotice("We could not join that match. No state was changed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMatchCommand(command: RobotMatchCommand) {
    if (!match) return;
    setBusy(true);
    const actionId = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const response = await fetch(`/api/robot-combat/matches/${match.matchId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, command }),
      });
      const payload = (await response.json()) as {
        match?: RobotMatchState;
        event?: { message?: string };
        rejection?: { message?: string };
      };
      if (payload.match) setMatch(payload.match);
      setNotice(
        response.ok
          ? payload.event?.message ?? "Move accepted."
          : payload.rejection?.message ?? "That move was not accepted.",
      );
    } catch {
      setNotice("We could not reach the match. No state was changed.");
    } finally {
      setBusy(false);
    }
  }

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
