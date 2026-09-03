import type { IntentCheckpoint } from "./steering.ts";

interface IntentCheckpointCardProps {
  checkpoint: IntentCheckpoint;
  /** When true, show the inline correction box under this checkpoint. */
  correcting: boolean;
  correctionDraft: string;
  onCorrectionDraftChange: (value: string) => void;
  onApprove: () => void;
  onDislike: () => void;
  onSubmitCorrection: () => void;
  onCancelCorrection?: () => void;
}

export function IntentCheckpointCard({
  checkpoint,
  correcting,
  correctionDraft,
  onCorrectionDraftChange,
  onApprove,
  onDislike,
  onSubmitCorrection,
  onCancelCorrection,
}: IntentCheckpointCardProps) {
  const rejected = checkpoint.status === "rejected";
  const awaiting = checkpoint.status === "awaiting_correction" || correcting;
  const showFeedback =
    checkpoint.status === "pending" || checkpoint.status === "revised" || awaiting;

  return (
    <article
      className={`intent-checkpoint${rejected ? " is-rejected" : ""}${awaiting ? " is-correcting" : ""}`}
      data-kind={checkpoint.kind}
      data-status={checkpoint.status}
      aria-label={checkpoint.title}
    >
      <header className="intent-checkpoint-head">
        <h4>{checkpoint.title}</h4>
        {rejected && <span className="intent-badge rejected">Rejected</span>}
        {checkpoint.status === "approved" && <span className="intent-badge approved">Approved</span>}
        {checkpoint.status === "revised" && <span className="intent-badge revised">Revised</span>}
      </header>

      <p className={`intent-summary${rejected ? " struck" : ""}`}>{checkpoint.summary}</p>

      {rejected && checkpoint.revisedSummary && (
        <p className="intent-revised" role="status">
          {checkpoint.revisedSummary}
        </p>
      )}

      {checkpoint.status === "revised" && checkpoint.revisedSummary && (
        <p className="intent-revised" role="status">
          {checkpoint.revisedSummary}
        </p>
      )}

      {showFeedback && !rejected && !awaiting && (
        <div className="intent-actions" role="group" aria-label="Steer this checkpoint">
          <button
            type="button"
            className="intent-fb approve"
            onClick={onApprove}
            title="Approve — SI approval for this checkpoint"
            aria-label="Approve"
          >
            Approve
          </button>
          <button
            type="button"
            className="intent-fb dislike"
            onClick={onDislike}
            title="Correct — interrupts work and opens a correction"
            aria-label="Correct"
          >
            Correct
          </button>
        </div>
      )}

      {awaiting && (
        <div className="intent-correction">
          <label htmlFor={`correction-${checkpoint.id}`}>What should SI do instead?</label>
          <textarea
            id={`correction-${checkpoint.id}`}
            className="field"
            rows={3}
            value={correctionDraft}
            onChange={(e) => onCorrectionDraftChange(e.target.value)}
            placeholder="Say what you actually want, in plain words."
            autoFocus
          />
          <div className="intent-correction-actions">
            <button
              type="button"
              className="btn"
              disabled={!correctionDraft.trim()}
              onClick={onSubmitCorrection}
            >
              Apply correction
            </button>
            {onCancelCorrection && (
              <button type="button" className="btn ghost" onClick={onCancelCorrection}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

