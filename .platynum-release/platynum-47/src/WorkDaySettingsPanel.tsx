import { useState, type FormEvent } from "react";
import {
  DEFAULT_WORK_DAY_SETTINGS,
  type Weekday,
  type WorkDaySettings,
} from "./workDay.ts";

const DAY_LABELS: { day: Weekday; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

interface WorkDaySettingsPanelProps {
  settings: WorkDaySettings;
  onSave: (next: WorkDaySettings) => void;
  onClose: () => void;
}

export function WorkDaySettingsPanel({ settings, onSave, onClose }: WorkDaySettingsPanelProps) {
  const [draft, setDraft] = useState<WorkDaySettings>({
    ...settings,
    workDays: [...settings.workDays],
  });

  const toggleDay = (day: Weekday) => {
    setDraft((prev) => {
      const has = prev.workDays.includes(day);
      const workDays = has ? prev.workDays.filter((d) => d !== day) : [...prev.workDays, day].sort();
      return { ...prev, workDays: workDays as Weekday[] };
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      ...draft,
      workDays: draft.workDays.length ? draft.workDays : [...DEFAULT_WORK_DAY_SETTINGS.workDays],
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal work-day-modal"
        role="dialog"
        aria-labelledby="work-day-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="work-day-title">Work day settings</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <form className="work-day-form" onSubmit={submit}>
          <label className="work-day-toggle">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft((p) => ({ ...p, enabled: e.target.checked }))}
            />
            <span>Use a work-day schedule</span>
          </label>
          <p className="work-day-help">
            Every workday starts with a complete brief of yesterday — shipped, missed, broken, and
            still open — prepared before you begin so you do not rediscover it mid-day.
          </p>

          <fieldset disabled={!draft.enabled}>
            <legend>Schedule</legend>
            <div className="work-day-days" role="group" aria-label="Workdays">
              {DAY_LABELS.map(({ day, label }) => (
                <label key={day} className={draft.workDays.includes(day) ? "day on" : "day"}>
                  <input
                    type="checkbox"
                    checked={draft.workDays.includes(day)}
                    onChange={() => toggleDay(day)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="work-day-times">
              <label>
                Start
                <input
                  type="time"
                  value={draft.dayStart}
                  onChange={(e) => setDraft((p) => ({ ...p, dayStart: e.target.value }))}
                  required
                />
              </label>
              <label>
                Stop
                <input
                  type="time"
                  value={draft.dayEnd}
                  onChange={(e) => setDraft((p) => ({ ...p, dayEnd: e.target.value }))}
                  required
                />
              </label>
              <label>
                Sleep / hard stop
                <input
                  type="time"
                  value={draft.sleepAt}
                  onChange={(e) => setDraft((p) => ({ ...p, sleepAt: e.target.value }))}
                  required
                />
              </label>
              <label>
                Brief ready (minutes before start)
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={draft.briefLeadMinutes}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, briefLeadMinutes: Number(e.target.value) || 0 }))
                  }
                />
              </label>
            </div>

            <label>
              Timezone (optional IANA, blank = this device)
              <input
                type="text"
                value={draft.timezone}
                placeholder="America/Chicago"
                onChange={(e) => setDraft((p) => ({ ...p, timezone: e.target.value }))}
              />
            </label>
          </fieldset>

          <p className="work-day-help">
            If you start early, late, skip days, or work past stop/sleep, Platynum still opens with
            the audit and marks the schedule miss (early / late / catch-up / overtime) so the next
            brief stays honest.
          </p>

          <div className="modal-actions">
            <button type="submit" className="btn build-btn">
              Save schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

