"use client";

import { useCallback, useEffect, useState } from "react";
import {
  competitionView,
  type CompetitionView,
  type RuntimeCompetitionSnapshot,
} from "@/lib/competition-snapshot";
import { StatusPill } from "./page-elements";
import {
  SolitaireBoard,
  type ServerGameSession,
} from "./solitaire-board";

const COMPETITION_SESSION_KEY = "monetaire.competition.session-id";

export function CompetitionPanel({
  allowEntry = false,
  initialCompetition,
}: {
  allowEntry?: boolean;
  initialCompetition: RuntimeCompetitionSnapshot;
}) {
  const [competition, setCompetition] = useState<CompetitionView | null>(
    competitionView(initialCompetition),
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [refreshingLeaderboard, setRefreshingLeaderboard] = useState(false);
  const [leaderboardUpdatedAt, setLeaderboardUpdatedAt] = useState<string | null>(
    null,
  );
  const [enteredSession, setEnteredSession] =
    useState<ServerGameSession | null>(null);
  const [enteredCompetitionId, setEnteredCompetitionId] = useState<
    string | null
  >(null);

  const loadCompetition = useCallback(async (announce = false) => {
    setRefreshingLeaderboard(true);
    try {
      const response = await fetch("/api/competitions", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | {
            competitions?: RuntimeCompetitionSnapshot[];
            error?: { message?: string } | string;
          }
        | null;
      if (!response.ok) {
        const error =
          typeof body?.error === "object" ? body.error.message : body?.error;
        if (announce) {
          setMessage(error ?? "Competition records could not be loaded.");
        }
        return;
      }
      const snapshot = body?.competitions?.[0];
      const nextCompetition = snapshot ? competitionView(snapshot) : null;
      if (
        nextCompetition &&
        enteredCompetitionId &&
        nextCompetition.id !== enteredCompetitionId
      ) {
        window.localStorage.removeItem(COMPETITION_SESSION_KEY);
        setEnteredSession(null);
        setEnteredCompetitionId(null);
      }
      setCompetition(nextCompetition);
      setLeaderboardUpdatedAt(new Date().toISOString());
      if (announce) setMessage("Leaderboard refreshed from server records.");
    } catch {
      if (announce) setMessage("Competition records are not reachable.");
    } finally {
      setRefreshingLeaderboard(false);
    }
  }, [enteredCompetitionId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadCompetition(false);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [loadCompetition]);

  async function resumeSavedSession() {
    const sessionsResponse = await fetch("/api/game/sessions", {
      cache: "no-store",
    });
    if (!sessionsResponse.ok) {
      throw new Error("Account sessions could not be checked.");
    }
    const sessionsBody = (await sessionsResponse.json().catch(() => null)) as
      | { sessions?: ServerGameSession[] }
      | null;
    const accountSession = sessionsBody?.sessions?.find(
      (session) =>
        session.mode === "NONCASH_COMPETITION" &&
        session.status === "ACTIVE",
    );
    if (accountSession) {
      window.localStorage.setItem(COMPETITION_SESSION_KEY, accountSession.id);
      setEnteredSession(accountSession);
      setEnteredCompetitionId(competition?.id ?? null);
      setMessage(
        "Competition session resumed from your account-backed authoritative state. No Play Coins were charged and no valuable prize is offered.",
      );
      return true;
    }
    window.localStorage.removeItem(COMPETITION_SESSION_KEY);
    return false;
  }

  async function enterOrResumeCompetition() {
    if (!competition) return;
    setPending(true);
    setMessage("");
    try {
      if (await resumeSavedSession()) {
        await loadCompetition();
        return;
      }
      const response = await fetch(`/api/competitions/${competition.id}/enter`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = (await response.json().catch(() => null)) as
        | {
            session?: ServerGameSession;
            error?: { message?: string } | string;
          }
        | null;
      if (!response.ok) {
        const error =
          typeof body?.error === "object" ? body.error.message : body?.error;
        setMessage(error ?? "Competition entry was not completed.");
        return;
      }
      if (!body?.session) {
        setMessage("The server did not return a playable competition session.");
        return;
      }
      window.localStorage.setItem(COMPETITION_SESSION_KEY, body.session.id);
      setEnteredSession(body.session);
      setEnteredCompetitionId(competition.id);
      setMessage(
        "Entry and playable server-created session confirmed. No Play Coins were charged and no valuable prize is offered.",
      );
      await loadCompetition();
    } catch {
      setMessage("Competition entry services are not reachable. No entry is shown as confirmed.");
    } finally {
      setPending(false);
    }
  }

  if (!competition) {
    return (
      <div className="empty-state surface-soft">
        <div>
          <span className="icon-box" aria-hidden="true">◇</span>
          <h3>{message || "Loading published competition…"}</h3>
          <p className="muted small">
            No event, entrant, or leaderboard is fabricated when the server has no record.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="competition-panel surface">
      <header>
        <div>
          <StatusPill tone="live">Noncash · {competition.status}</StatusPill>
          <h2>{competition.name}</h2>
          <p>Draw 3 Klondike · identical curated deal · public ranking formula</p>
        </div>
        {allowEntry ? (
          <button
            className="button button-primary"
            disabled={pending || Boolean(enteredSession)}
            type="button"
            onClick={() => void enterOrResumeCompetition()}
          >
            {enteredSession
              ? "Session open"
              : pending
                ? "Checking entry…"
                : "Enter or resume at no cost"}
          </button>
        ) : null}
      </header>
      <div className="competition-facts">
        <div><span>Entry cost</span><strong>{competition.entryCostPlayCoins} Play Coins</strong></div>
        <div><span>Valuable prize</span><strong>{competition.valuablePrize ? "Yes" : "None"}</strong></div>
        <div><span>Actual entries</span><strong>{competition.entryCount ?? "Recorded server-side"}</strong></div>
        <div><span>Publication</span><strong>{competition.validation?.status ?? "Persisted"}</strong></div>
      </div>
      <details className="competition-proof">
        <summary>Inspect deal evidence</summary>
        <dl>
          <div><dt>Environment</dt><dd>{competition.environment === "configured" ? "Configured private preview" : "Safe demo"}</dd></div>
          <div><dt>Opens</dt><dd>{new Date(competition.opensAt).toLocaleString()}</dd></div>
          <div><dt>Closes</dt><dd>{new Date(competition.closesAt).toLocaleString()}</dd></div>
          {competition.rulesetVersion ? <div><dt>Ruleset</dt><dd>{competition.rulesetVersion}</dd></div> : null}
          {competition.dealGeneratorVersion ? <div><dt>Generator</dt><dd>{competition.dealGeneratorVersion}</dd></div> : null}
          <div><dt>Deal commitment</dt><dd className="mono">{competition.dealCommitment ?? "Unavailable"}</dd></div>
          {competition.validation ? <div><dt>Solver record</dt><dd>{competition.validation.solver} {competition.validation.solverVersion}</dd></div> : null}
          <div><dt>Seed</dt><dd>{competition.seedReveal ?? "Held until competition close"}</dd></div>
        </dl>
      </details>
      {message ? <p className="competition-message" role="status">{message}</p> : null}
      {enteredSession ? (
        <div className="app-section">
          <SolitaireBoard
            initialSession={enteredSession}
            mode="NONCASH_COMPETITION"
            storageKey={COMPETITION_SESSION_KEY}
            onSessionTerminal={() => void loadCompetition(false)}
          />
        </div>
      ) : null}
      <div className="competition-standings">
        <div className="app-section-header">
          <div>
            <p className="eyebrow">Server-calculated</p>
            <h3>Leaderboard</h3>
            {leaderboardUpdatedAt ? (
              <small>
                Updated {new Date(leaderboardUpdatedAt).toLocaleTimeString()}
              </small>
            ) : null}
          </div>
          <button
            className="button button-quiet"
            disabled={refreshingLeaderboard}
            type="button"
            onClick={() => void loadCompetition(true)}
          >
            {refreshingLeaderboard ? "Refreshing…" : "Refresh leaderboard"}
          </button>
        </div>
        {competition.standings.length === 0 ? (
          <p className="muted small">No completed official scores are recorded.</p>
        ) : (
          <div className="data-list">
            {competition.standings.map((standing) => (
              <div className="data-row competition-standing-row" key={standing.entryId ?? `${standing.rank}-${standing.validMoves}-${standing.verifiedActivePlayMs}-${standing.displayName ?? ""}`}>
                <strong>{standing.displayName ? `${standing.displayName} · ` : ""}Rank {standing.rank}{standing.tied ? " · tie" : ""}</strong>
                <span>{standing.completed ? "Completed" : "Incomplete"}</span>
                <span>{standing.validMoves} valid moves</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
