import type { MorningBrief } from "./workDay.ts";

interface MorningBriefPanelProps {
  brief: MorningBrief;
  onAcknowledge: () => void;
  onOpenSettings: () => void;
}

function Section({ title, items }: { title: string; items: { id: string; title: string; detail?: string }[] }) {
  return (
    <section className="brief-section">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="brief-empty">None recorded.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              {item.detail ? <span> — {item.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MorningBriefPanel({ brief, onAcknowledge, onOpenSettings }: MorningBriefPanelProps) {
  const adherenceLabel = brief.adherence.replaceAll("_", " ");

  return (
    <div className="modal-backdrop morning-brief-backdrop" role="presentation">
      <div className="modal morning-brief-modal" role="dialog" aria-labelledby="morning-brief-title">
        <header className="modal-head">
          <div>
            <p className="journey-kicker">Start of day</p>
            <h2 id="morning-brief-title">Yesterday’s audit</h2>
          </div>
          <button type="button" className="btn ghost" onClick={onOpenSettings}>
            Schedule
          </button>
        </header>

        <p className="brief-lede">
          This brief was prepared for <strong>{brief.forDate}</strong> before work begins. Begin from
          what was missed, broken, or left open — do not re-review everything mid-day.
        </p>

        <p className={`brief-adherence is-${brief.adherence}`} data-adherence={brief.adherence}>
          Schedule: <strong>{adherenceLabel}</strong>
        </p>
        {brief.scheduleNotes.length > 0 && (
          <ul className="brief-notes">
            {brief.scheduleNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        <Section title="Shipped" items={brief.shipped} />
        <Section title="Missed" items={brief.missed} />
        <Section title="Broken" items={brief.broken} />
        <Section title="Still open" items={brief.open} />

        <pre className="brief-summary">{brief.summary}</pre>

        <div className="modal-actions">
          <button type="button" className="btn build-btn" onClick={onAcknowledge}>
            Begin workday from this audit
          </button>
        </div>
      </div>
    </div>
  );
}

