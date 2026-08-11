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

export function RobotCombatWorkshop({ playerId, catalog, starterBlueprints }: WorkshopProps) {
  const [blueprint, setBlueprint] = useState(() => cloneBlueprint(starterBlueprints.PUSHER));
  const [inspection, setInspection] = useState<RobotInspection | undefined>();
  const [savedBuild, setSavedBuild] = useState<SavedBuild | undefined>();
  const [match, setMatch] = useState<RobotMatchState>();
  const [joinMatchId, setJoinMatchId] = useState("");
  const [notice, setNotice] = useState("Draft only — the server has not inspected this revision yet.");
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
        setNotice(`Revision ${latest.revision} loaded from the server.`);
      })
      .catch(() => {
        if (!cancelled) setNotice("No saved machine loaded. Start from a teaching archetype.");
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
  const opponentRobot = opponentSlot ? match?.robots[opponentSlot] : undefined;

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
    setNotice(`${archetype.toLowerCase()} starter loaded as an unsaved personal draft.`);
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
    setNotice("Draft changed — save it again to run server inspection.");
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
    setNotice("Draft changed — removed module branches must be rebuilt before saving.");
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
      setNotice(`No free ${category.toLowerCase()} socket is available on this draft.`);
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
    setNotice("Draft changed — save it again to run server inspection.");
  }

  async function saveRevision() {
    draftTouched.current = true;
    setBusy(true);
    setNotice("Inspecting and saving the revision…");
    try {
      const response = await fetch("/api/robot-combat/builds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildKey: "workshop-machine", blueprint }),
      });
      const payload = (await response.json()) as { build?: SavedBuild; error?: { message?: string } };
      if (!response.ok || !payload.build) {
        setNotice(payload.error?.message ?? "The server rejected this revision.");
        return;
      }
      const latest = payload.build.revisions.at(-1);
      setSavedBuild(payload.build);
      if (latest) setInspection(latest.inspection);
      setNotice(`Revision ${payload.build.latestRevision} saved. This machine is inspection-valid.`);
    } catch {
      setNotice("The server could not be reached. The draft remains local and unsaved.");
    } finally {
      setBusy(false);
    }
  }

  async function createMatch() {
    if (!savedBuild) {
      setNotice("Save an inspection-valid revision before opening a match.");
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
      setNotice("Match opened. The next step is opponent join and the both-ready gate.");
    } catch {
      setNotice("The server could not be reached. No match was opened.");
    } finally {
      setBusy(false);
    }
  }

  async function joinMatch() {
    if (!savedBuild || !joinMatchId.trim()) {
      setNotice("Save a valid revision and enter a match id before joining.");
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
      setNotice("Opponent joined. Both builders must ready an inspection-valid machine.");
    } catch {
      setNotice("The server could not be reached. No match was joined.");
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
          ? payload.event?.message ?? "Match command accepted."
          : payload.rejection?.message ?? "The match rejected that command.",
      );
    } catch {
      setNotice("The server could not be reached. The match state was not changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-grid robot-combat-workshop">
      <section className="dashboard-primary surface">
        <div className="app-section-header">
          <div>
            <p className="eyebrow">Workshop · live server inspection</p>
            <h2>{blueprint.name}</h2>
          </div>
          <span className={`pill ${inspection?.valid ? "pill-live" : "pill-hold"}`}>
            {inspection?.valid ? "Inspection valid" : "Draft"}
          </span>
        </div>
        <p className="muted">{notice}</p>

        <div className="data-list surface-soft">
          {blueprint.parts.map((part) => {
            const definition = definitions.get(part.partKey);
            const options = catalog.filter((candidate) => candidate.category === definition?.category);
            return (
              <div className="data-row" key={part.instanceId}>
                <div>
                  <strong>{part.instanceId}</strong>
                  <small>{definition?.category ?? "Unknown module"} · {part.socket}</small>
                </div>
                <select
                  aria-label={`Part ${part.instanceId}`}
                  value={part.partKey}
                  onChange={(event) => replacePart(part.instanceId, event.target.value)}
                >
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>{option.displayName}</option>
                  ))}
                </select>
                <button className="button button-secondary" type="button" onClick={() => removePart(part.instanceId)}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <div className="button-row">
          <button className="button button-secondary" type="button" onClick={() => addPart("DRIVE")}>Add drive</button>
          <button className="button button-secondary" type="button" onClick={() => addPart("ARMOR")}>Add armor</button>
          <button className="button button-secondary" type="button" onClick={() => addPart("WEAPON")}>Add weapon</button>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void saveRevision()}>
            {busy ? "Working…" : "Inspect & save revision"}
          </button>
        </div>
      </section>

      <aside className="dashboard-secondary">
        <section className="surface-soft">
          <p className="eyebrow">Start from a lesson</p>
          {archetypes.map((archetype) => (
            <button className="workshop-archetype" type="button" key={archetype.key} onClick={() => chooseArchetype(archetype.key)}>
              <strong>{archetype.title}</strong>
              <span>{archetype.description}</span>
            </button>
          ))}
        </section>
        <section className="surface-soft">
          <p className="eyebrow">Inspection metrics</p>
          {inspection ? (
            <div className="data-list">
              <div className="data-row"><span>Mass</span><strong>{inspection.metrics.massKg} / {inspection.metrics.maxMassKg} kg</strong></div>
              <div className="data-row"><span>Power reserve</span><strong>{inspection.metrics.powerReserve}</strong></div>
              <div className="data-row"><span>Balance</span><strong>{inspection.metrics.balanceScore} / 100</strong></div>
              <div className="data-row"><span>Force path</span><strong>{inspection.metrics.forcePath}</strong></div>
              {inspection.errors.length > 0 ? <div className="callout"><p>{inspection.errors[0]?.message}</p></div> : null}
            </div>
          ) : <p className="muted">Save a revision to see the server&apos;s mass, power, balance, clearance, and connection results.</p>}
        </section>
        <section className="surface-soft">
          <p className="eyebrow">3D runtime prototype</p>
          <p className="muted small">The exported Godot workshop and arena is real visual/runtime work. It is still separate from the hosted match authority.</p>
          <Link className="button button-secondary" href="/app/robot-combat/runtime">Open 3D prototype</Link>
        </section>
        <section className="surface-soft">
          <p className="eyebrow">Arena gate</p>
          <button className="button button-primary" type="button" disabled={!savedBuild || busy} onClick={() => void createMatch()}>
            Open a free 1v1 match
          </button>
          {match ? (
            <div className="data-list">
              <div className="data-row"><span>Match</span><strong>{match.matchId}</strong></div>
              <div className="data-row"><span>Phase</span><strong>{match.phase}</strong></div>
              <div className="data-row"><span>Players</span><strong>{Object.keys(match.players).length} / 2</strong></div>
              <Link className="button button-secondary" href={`/app/robot-combat/matches/${match.matchId}`}>
                Enter authority arena
              </Link>
              {mySlot && myPlayer ? (
                <>
                  <div className="data-row"><span>Your slot</span><strong>{mySlot} · {myPlayer.ready ? "ready" : "not ready"}</strong></div>
                  <button className="button button-secondary" type="button" disabled={busy || myPlayer.ready || !myPlayer.inspection?.valid} onClick={() => void sendMatchCommand({ type: "READY", slot: mySlot })}>
                    {myPlayer.ready ? "Ready confirmed" : "Ready this machine"}
                  </button>
                  {match.phase === "ACTIVE" ? (
                    <div className="button-row">
                      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "CONTROL", slot: mySlot, throttle: 1, steering: 0 })}>Drive</button>
                      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "CONTROL", slot: mySlot, throttle: 0, steering: 1 })}>Turn</button>
                      <button className="button button-primary" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "FIRE", slot: mySlot })}>Fire</button>
                      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void sendMatchCommand({ type: "TICK", elapsedMs: 120 })}>Advance clock</button>
                    </div>
                  ) : null}
                  {match.phase === "COMPLETED" || match.phase === "DISCONNECTED" || match.phase === "CANCELLED" ? (
                    <div className="callout">
                      <strong>Match report</strong>
                      <p>{match.terminalReason ?? "The match ended without a declared winner."}</p>
                      {opponentRobot?.damageLog.length ? (
                        <p className="small">
                          {opponentRobot.damageLog.length} localized impact(s); last target: {opponentRobot.damageLog.at(-1)?.targetComponent}.
                        </p>
                      ) : null}
                      {opponentSlot && match.rebuildQuestions[opponentSlot]?.length ? (
                        <ul>
                          {match.rebuildQuestions[opponentSlot]?.map((question) => <li key={question}>{question}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : <p className="muted small">No match is open in this session yet.</p>}
          <label className="small" htmlFor="robot-match-id">Join an existing match</label>
          <input id="robot-match-id" value={joinMatchId} onChange={(event) => setJoinMatchId(event.target.value)} placeholder="Paste a match id" />
          <button className="button button-secondary" type="button" disabled={!savedBuild || busy} onClick={() => void joinMatch()}>
            Join with this revision
          </button>
        </section>
      </aside>
    </div>
  );
}
