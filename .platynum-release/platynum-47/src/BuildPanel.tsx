import { useEffect, useState } from "react";
import {
  approveSession,
  buildFromSession,
  getCheckpoint,
  interruptSession,
  modelStatus,
  type BuildResponse,
} from "./build.ts";
import { IntentCheckpointCard } from "./IntentCheckpointCard.tsx";
import {
  approveCheckpoint,
  bindSiCheckpoint,
  canExecuteSideEffects,
  continuePastIntentGate,
  dislikeCheckpoint,
  emitReasoningCheckpoint,
  filterRejectedFromPlan,
  isApprovalPending,
  startRunWithIntent,
  submitCorrection,
  type RunLoopState,
} from "./steering.ts";

interface BuildPanelProps {
  initialIdea?: string;
  onClose: () => void;
  onApplyBuild: (result: BuildResponse) => void;
}

interface CheckpointView {
  understanding: string;
  recommendations: string[];
}

export function checkpointView(checkpoint: string): CheckpointView {
  const lines = checkpoint
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const actionsIndex = lines.findIndex((line) => /what i need from you/i.test(line));
  const planLines = actionsIndex === -1 ? lines : lines.slice(0, actionsIndex);
  const recommendations = planLines
    .map((line) => line.match(/^\d+[.)]\s+(.+)$/)?.[1]?.trim() ?? "")
    .filter(Boolean)
    .slice(0, 3);
  const understanding =
    planLines.find((line) => !/^\d+[.)]\s+/.test(line) && !/^what (i|si) (will|understands)/i.test(line)) ??
    "SI has a direction ready for your review.";

  return { understanding, recommendations };
}

export function BuildPanel({ initialIdea = "", onClose, onApplyBuild }: BuildPanelProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [idea, setIdea] = useState<string>(initialIdea);
  const [sessionId, setSessionId] = useState<string>("");
  const [plan, setPlan] = useState<string>("");
  const [humanActions, setHumanActions] = useState<string[]>([]);
  const [busyPlan, setBusyPlan] = useState<boolean>(false);
  const [busyBuild, setBusyBuild] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [run, setRun] = useState<RunLoopState | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState<string>("");
  const checkpoint = checkpointView(plan);
  const gateOpen = run ? canExecuteSideEffects(run) : false;
  const approvalPending = run ? isApprovalPending(run) : false;

  useEffect(() => {
    modelStatus().then((s) => setConfigured(s.configured));
  }, []);

  const getPlan = async () => {
    if (!idea.trim()) return;
    setBusyPlan(true);
    setError("");
    setPlan("");
    setSessionId("");
    setHumanActions([]);
    setRun(null);
    setCorrectionDraft("");
    try {
      const response = await getCheckpoint(idea);
      setSessionId(response.sessionId);
      setPlan(response.checkpoint);
      setHumanActions(response.humanActions);
      const view = checkpointView(response.checkpoint);
      // Intent gate: first checkpoint before any mutating build.
      setRun(
        startRunWithIntent(
          idea.trim(),
          view.understanding,
          response.siCheckpointId || null,
          response.siIntentHash || null,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPlan(false);
    }
  };

  const build = async () => {
    if (!sessionId || !run || !canExecuteSideEffects(run) || isApprovalPending(run)) {
      setError("Confirm what SI understands first — Approve or Correct before anything is built.");
      return;
    }
    setBusyBuild(true);
    setError("");
    try {
      let next = emitReasoningCheckpoint(run, "Building your preview from the confirmed direction.", "planned_action");
      setRun(next);
      const built = await buildFromSession(sessionId);
      onApplyBuild(built);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyBuild(false);
    }
  };

  const onApprove = async (checkpointId: string) => {
    if (!run || !sessionId) return;
    setError("");
    try {
      const approved = await approveSession(
        sessionId,
        run.siCheckpointId || undefined,
        run.siIntentHash || undefined,
      );
      let next = approveCheckpoint(run, checkpointId);
      next = bindSiCheckpoint(
        next,
        approved.siCheckpointId || run.siCheckpointId,
        approved.siIntentHash || run.siIntentHash,
      );
      if (!canExecuteSideEffects(next)) {
        next = continuePastIntentGate(next);
      }
      setRun(next);
    } catch (e) {
      // SI fail-closed (stale checkpoint / hash) — surface, do not clear the gate.
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDislike = async (checkpointId: string) => {
    if (!run || !sessionId) return;
    // Local freeze + cancel pending + open correction; SI session-state interrupt.
    setBusyBuild(false);
    setCorrectionDraft("");
    setError("");
    const local = dislikeCheckpoint(run, checkpointId);
    setRun(local);
    try {
      const si = await interruptSession(
        sessionId,
        "nope — that understanding is wrong.",
        run.siCheckpointId || undefined,
      );
      setRun(
        bindSiCheckpoint(local, si.siCheckpointId, si.siIntentHash, si.operation),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSubmitCorrection = async (checkpointId: string) => {
    if (!run || !sessionId || !correctionDraft.trim()) return;
    setError("");
    try {
      // Authoritative RETRACT/REPLACE transaction + new checkpoint; stay gated until approve.
      const si = await interruptSession(
        sessionId,
        correctionDraft.trim(),
        run.siCheckpointId || undefined,
      );
      const next = submitCorrection(
        run,
        checkpointId,
        correctionDraft,
        si.siCheckpointId,
        si.siIntentHash,
        si.operation,
      );
      setRun(next);
      setCorrectionDraft("");
      // Keep recommendations free of the rejected direction.
      if (plan) {
        const lines = plan.split(/\r?\n/);
        const filtered = filterRejectedFromPlan(lines, next.rejectedDirections);
        setPlan(filtered.join("\n"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onContinue = async () => {
    if (!run || !sessionId) return;
    setError("");
    try {
      const approved = await approveSession(
        sessionId,
        run.siCheckpointId || undefined,
        run.siIntentHash || undefined,
      );
      let next = continuePastIntentGate(run);
      next = bindSiCheckpoint(
        next,
        approved.siCheckpointId || run.siCheckpointId,
        approved.siIntentHash || run.siIntentHash,
      );
      setRun(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const visibleRecommendations =
    run && run.rejectedDirections.length > 0
      ? filterRejectedFromPlan(checkpoint.recommendations, run.rejectedDirections)
      : checkpoint.recommendations;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <strong>Your idea</strong>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="panel-body">
          {configured === false && (
            <div className="panel-note">
              This build flow is not ready yet. The person running this Platynum enables AI build once so everyone can
              use it here.
            </div>
          )}

          <label className="build-question" htmlFor="build-idea">
            What are you trying to make?
          </label>
          <textarea
            id="build-idea"
            className="field build-idea"
            placeholder="Describe your idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={3}
          />
          <button className="btn" disabled={busyPlan || !idea.trim() || configured === false} onClick={getPlan}>
            {busyPlan ? "SI is understanding your idea…" : "Let SI understand it"}
          </button>

          {run && run.checkpoints.length > 0 && (
            <div className="intent-steering" aria-live="polite">
              <h3>Live steering</h3>
              <p className="muted small">
                Check what SI understands before anything is built. Approve calls the SI approval transaction for the
                current checkpoint. Correct interrupts, opens a correction, submits RETRACT/REPLACE, and requires
                re-approval before build continues.
              </p>
              {run.checkpoints.map((cp) => (
                <IntentCheckpointCard
                  key={cp.id}
                  checkpoint={cp}
                  correcting={run.activeCorrectionId === cp.id}
                  correctionDraft={run.activeCorrectionId === cp.id ? correctionDraft : ""}
                  onCorrectionDraftChange={setCorrectionDraft}
                  onApprove={() => onApprove(cp.id)}
                  onDislike={() => onDislike(cp.id)}
                  onSubmitCorrection={() => onSubmitCorrection(cp.id)}
                />
              ))}
              {run.phase === "awaiting_intent_gate" && (
                <button type="button" className="btn" onClick={onContinue}>
                  Continue with this understanding
                </button>
              )}
              {run.lastSiOperation && (
                <p className="muted small" role="status">
                  SI correction operation: {run.lastSiOperation}
                </p>
              )}
            </div>
          )}

          {plan && (
            <div className="si-guidance">
              <section>
                <h3>What SI understands</h3>
                <p>{run?.understanding || checkpoint.understanding}</p>
              </section>

              <section>
                <h3>Three recommendations</h3>
                {visibleRecommendations.length === 3 ? (
                  <ol className="recommendation-list">
                    {visibleRecommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ol>
                ) : visibleRecommendations.length > 0 ? (
                  <ol className="recommendation-list">
                    {visibleRecommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted small">
                    SI has not returned three distinct recommendations yet. This step remains in progress.
                  </p>
                )}
              </section>

              <div className="guidance-pair">
                <section>
                  <h3>Consensus</h3>
                  <p className="muted small">
                    Not established yet. SI will show the shared direction after comparing the strongest paths.
                  </p>
                </section>
                <section>
                  <h3>Wildcard</h3>
                  <p className="muted small">
                    Not returned yet. SI will show one when an alternative could materially improve the result.
                  </p>
                </section>
              </div>

              <section>
                <h3>Progress</h3>
                <p className="muted small">
                  {busyBuild
                    ? "Building your preview…"
                    : gateOpen
                      ? "Understanding confirmed. Ready to build."
                      : run
                        ? "Waiting on you — Approve or Correct before anything is built."
                        : "Your direction is ready. Nothing has been built yet."}
                </p>
              </section>

              <section>
                <h3>Preview</h3>
                <p className="muted small">Your working preview opens after SI builds this direction.</p>
                <button
                  className="btn build-btn"
                  disabled={busyBuild || !gateOpen || approvalPending || run?.phase === "interrupted"}
                  onClick={build}
                >
                  {busyBuild
                    ? "Building your preview…"
                    : gateOpen
                      ? "Build and open preview"
                      : "Confirm understanding to build"}
                </button>
              </section>
            </div>
          )}

          {humanActions.length > 0 && (
            <div className="panel-note">
              <p className="muted small">
                <strong>Only you need to do</strong>
              </p>
              <ul className="action-list">
                {humanActions.map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {error && (
          <div className="panel-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

