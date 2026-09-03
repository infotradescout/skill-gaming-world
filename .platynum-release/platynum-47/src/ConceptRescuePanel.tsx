import type { ConceptRescueResult } from "./conceptRescue.ts";

interface ConceptRescuePanelProps {
  result: ConceptRescueResult;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export function ConceptRescuePanel({ result, onClose }: ConceptRescuePanelProps) {
  const { contextDisplay, trackA, trackB } = result;

  return (
    <div className="overlay" role="presentation">
      <div className="panel panel-wide concept-rescue-panel" role="dialog" aria-labelledby="cr-title">
        <header className="panel-head">
          <div>
            <p className="journey-kicker">Concept Rescue</p>
            <h2 id="cr-title">Diagnosis (no commercial build)</h2>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="panel-body">
          <p className="panel-note" data-status={result.statusVocabulary}>
            Status: <strong>{result.statusVocabulary}</strong> — not production, cross-client, or
            cross-model proven.
          </p>

          <section>
            <h3>Context</h3>
            <ul className="action-list">
              <li>Apparent owner: {contextDisplay.apparentOwner}</li>
              <li>Your relationship: {contextDisplay.userRelationship}</li>
              <li>Primary: {contextDisplay.primaryObjective}</li>
              <li>Secondary: {contextDisplay.secondaryObjective}</li>
            </ul>
            <p className="muted small">Authorized: {contextDisplay.authorized.join("; ")}</p>
            <p className="muted small">Not authorized: {contextDisplay.notAuthorized.join("; ")}</p>
          </section>

          <section>
            <h3>Build stage</h3>
            <p>
              <strong>{result.buildStage}</strong>
            </p>
            <ul className="action-list">
              {result.buildStageEvidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p>
              <strong>Next-best action:</strong> {result.nextBestAction}
            </p>
            <p className="muted small">
              Audit: decision {result.audit.decisionId}
              {result.audit.checkpointId ? ` · checkpoint ${result.audit.checkpointId}` : ""}
              {result.audit.intentHash ? ` · hash ${result.audit.intentHash}` : ""}
            </p>
          </section>

          <section>
            <h3>Evidence grades</h3>
            <ul className="action-list">
              {result.statements.map((s) => (
                <li key={s.id}>
                  <code>{s.grade}</code> — {s.text}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Contradictions (before any build)</h3>
            {result.contradictions.length === 0 ? (
              <p className="muted">None detected in supplied content.</p>
            ) : (
              <ul className="action-list">
                {result.contradictions.map((c) => (
                  <li key={`${c.ruleId}-${c.evidenceExcerpt}`}>
                    <strong>{c.ruleId}</strong> ({c.category}): {c.explanation}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {result.prematureBuildBlocked && (
            <p className="panel-error">
              Premature build blocked: {result.blockReasons.join("; ")}
            </p>
          )}

          <section>
            <h3>Track A — Creator assistance</h3>
            <p>{trackA.valuablePremise}</p>
            <p>
              <strong>Recommendation:</strong> {trackA.recommendation} — {trackA.recommendationRationale}
            </p>
            <p className="muted">{trackA.creatorFacingMessage}</p>
            <h4>Offer hypotheses</h4>
            <ul className="action-list">
              {trackA.offerHypotheses.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <h4>Seven-day sequence</h4>
            <ol className="action-list">
              {trackA.sevenDaySequence.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ol>
          </section>

          <section>
            <h3>Track B — Generalized learning</h3>
            <p>{trackB.anonymizedLesson}</p>
            <p className="muted small">
              Guardrails: {trackB.ownershipIpGuardrails.join(" · ")}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

