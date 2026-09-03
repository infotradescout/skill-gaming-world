/**
 * Work-day schedule + yesterday-audit morning brief.
 *
 * Every scheduled workday must open with a complete brief of the prior work
 * window (shipped / missed / broken / still open) so the person starts from
 * that audit instead of rediscovering it mid-day.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduleAdherence =
  | "on_time"
  | "early"
  | "late"
  | "catch_up"
  | "off_schedule_overtime"
  | "outside_workday";

export type WorkLogKind = "shipped" | "missed" | "broken" | "open" | "note" | "schedule_miss";

export interface WorkDaySettings {
  enabled: boolean;
  /** IANA timezone; empty means use the browser local zone. */
  timezone: string;
  /** Days the person intends to work (0=Sun … 6=Sat). */
  workDays: Weekday[];
  /** Local HH:MM when the workday starts. */
  dayStart: string;
  /** Local HH:MM when the workday should stop. */
  dayEnd: string;
  /** Local HH:MM when they intend to sleep / hard-stop. */
  sleepAt: string;
  /** Minutes before dayStart when the overnight brief should be ready. */
  briefLeadMinutes: number;
}

export interface WorkLogEntry {
  id: string;
  at: string;
  kind: WorkLogKind;
  title: string;
  detail?: string;
  product?: string;
}

export interface MorningBrief {
  id: string;
  /** Calendar date (YYYY-MM-DD in settings timezone) this brief unlocks. */
  forDate: string;
  coverageFrom: string;
  coverageTo: string;
  preparedAt: string;
  adherence: ScheduleAdherence;
  scheduleNotes: string[];
  shipped: WorkLogEntry[];
  missed: WorkLogEntry[];
  broken: WorkLogEntry[];
  open: WorkLogEntry[];
  /** Full plain-language audit ready before the workday starts. */
  summary: string;
  acknowledgedAt?: string;
}

export interface WorkDayState {
  settings: WorkDaySettings;
  log: WorkLogEntry[];
  briefs: MorningBrief[];
  /** Last forDate the person acknowledged (YYYY-MM-DD). */
  lastAcknowledgedDate?: string;
}

export const WORK_DAY_STORAGE_KEY = "platynum47:work-day:v1";

export const DEFAULT_WORK_DAY_SETTINGS: WorkDaySettings = {
  enabled: true,
  timezone: "",
  workDays: [1, 2, 3, 4, 5],
  dayStart: "09:00",
  dayEnd: "17:00",
  sleepAt: "22:00",
  briefLeadMinutes: 30,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseHm(hm: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatHm(hours: number, minutes: number): string {
  return `${pad2(hours)}:${pad2(minutes)}`;
}

/** Resolve a Date into calendar parts in the configured timezone. */
export function zonedParts(
  when: Date,
  timezone: string,
): { year: number; month: number; day: number; weekday: Weekday; hours: number; minutes: number; dateKey: string } {
  const tz = timezone.trim() || undefined;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(when).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, Weekday> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    weekday: weekdayMap[parts.weekday ?? "Mon"] ?? 1,
    hours: Number(parts.hour),
    minutes: Number(parts.minute),
    dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

export function isWorkDay(settings: WorkDaySettings, when: Date): boolean {
  const { weekday } = zonedParts(when, settings.timezone);
  return settings.workDays.includes(weekday);
}

export function minutesSinceMidnight(when: Date, timezone: string): number {
  const { hours, minutes } = zonedParts(when, timezone);
  return hours * 60 + minutes;
}

export function hmToMinutes(hm: string): number {
  const parsed = parseHm(hm);
  if (!parsed) return 0;
  return parsed.hours * 60 + parsed.minutes;
}

export function defaultWorkDayState(): WorkDayState {
  return {
    settings: { ...DEFAULT_WORK_DAY_SETTINGS, workDays: [...DEFAULT_WORK_DAY_SETTINGS.workDays] },
    log: [],
    briefs: [],
  };
}

export function loadWorkDayState(): WorkDayState {
  try {
    const raw = localStorage.getItem(WORK_DAY_STORAGE_KEY);
    if (!raw) return defaultWorkDayState();
    const parsed = JSON.parse(raw) as Partial<WorkDayState>;
    const base = defaultWorkDayState();
    return {
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      log: Array.isArray(parsed.log) ? parsed.log : [],
      briefs: Array.isArray(parsed.briefs) ? parsed.briefs : [],
      lastAcknowledgedDate: parsed.lastAcknowledgedDate,
    };
  } catch {
    return defaultWorkDayState();
  }
}

export function saveWorkDayState(state: WorkDayState): void {
  try {
    localStorage.setItem(WORK_DAY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Session still works without persistence.
  }
}

export function recordWorkLog(
  state: WorkDayState,
  entry: Omit<WorkLogEntry, "id" | "at"> & { id?: string; at?: string },
): WorkDayState {
  const next: WorkLogEntry = {
    id: entry.id ?? `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry.at ?? new Date().toISOString(),
    kind: entry.kind,
    title: entry.title,
    detail: entry.detail,
    product: entry.product,
  };
  return { ...state, log: [...state.log, next] };
}

/** Previous calendar date key relative to dateKey (YYYY-MM-DD). */
export function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!, 12, 0, 0);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** Walk backward to the prior scheduled workday date key. */
export function previousWorkDateKey(settings: WorkDaySettings, fromDateKey: string): string {
  let key = previousDateKey(fromDateKey);
  for (let i = 0; i < 14; i++) {
    const [y, m, d] = key.split("-").map(Number);
    const probe = new Date(y!, m! - 1, d!, 12, 0, 0);
    if (isWorkDay(settings, probe)) return key;
    key = previousDateKey(key);
  }
  return previousDateKey(fromDateKey);
}

export function entriesInRange(log: WorkLogEntry[], fromIso: string, toIso: string): WorkLogEntry[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return log.filter((e) => {
    const t = Date.parse(e.at);
    return Number.isFinite(t) && t >= from && t <= to;
  });
}

function bucket(entries: WorkLogEntry[], kind: WorkLogKind): WorkLogEntry[] {
  return entries.filter((e) => e.kind === kind);
}

function lineList(label: string, items: WorkLogEntry[]): string {
  if (items.length === 0) return `${label}: none recorded.`;
  return `${label}:\n${items.map((e) => `- ${e.title}${e.detail ? ` — ${e.detail}` : ""}`).join("\n")}`;
}

export function assessAdherence(
  settings: WorkDaySettings,
  when: Date,
  unacknowledgedWorkDates: string[],
): { adherence: ScheduleAdherence; notes: string[] } {
  const notes: string[] = [];
  const parts = zonedParts(when, settings.timezone);
  const nowMin = parts.hours * 60 + parts.minutes;
  const startMin = hmToMinutes(settings.dayStart);
  const endMin = hmToMinutes(settings.dayEnd);
  const sleepMin = hmToMinutes(settings.sleepAt);

  if (!settings.enabled) {
    return { adherence: "outside_workday", notes: ["Work-day schedule is disabled."] };
  }

  if (unacknowledgedWorkDates.length > 1) {
    notes.push(
      `Catch-up: ${unacknowledgedWorkDates.length} workdays need a brief before new work (missed schedule windows).`,
    );
    return { adherence: "catch_up", notes };
  }

  if (!isWorkDay(settings, when)) {
    notes.push("Today is outside the configured workdays. Brief still available if you open work early.");
    return { adherence: "outside_workday", notes };
  }

  if (nowMin > sleepMin || (sleepMin < startMin && nowMin < startMin && nowMin > endMin)) {
    notes.push(`Past sleep/hard-stop (${settings.sleepAt}). Next brief will include this off-schedule work.`);
    return { adherence: "off_schedule_overtime", notes };
  }

  if (nowMin > endMin) {
    notes.push(`Past day end (${settings.dayEnd}). Working late — recorded as off-schedule overtime.`);
    return { adherence: "off_schedule_overtime", notes };
  }

  if (nowMin < startMin) {
    notes.push(`Early relative to day start (${settings.dayStart}). Brief is ready; schedule not yet started.`);
    return { adherence: "early", notes };
  }

  // Grace: within 15 minutes of start counts as on time.
  if (nowMin - startMin > 15) {
    notes.push(`Late start — scheduled ${settings.dayStart}, opened after that.`);
    return { adherence: "late", notes };
  }

  notes.push(`On schedule for ${settings.dayStart}–${settings.dayEnd}.`);
  return { adherence: "on_time", notes };
}

/**
 * Build (or refresh) the morning audit for the workday that `when` belongs to.
 * Coverage is the prior workday window so the brief exists before today's start.
 */
export function prepareMorningBrief(state: WorkDayState, when: Date = new Date()): MorningBrief {
  const { settings, log } = state;
  const today = zonedParts(when, settings.timezone);
  const priorWorkDate = previousWorkDateKey(settings, today.dateKey);

  // Coverage: prior workday dayStart → today brief-ready moment (dayStart - lead).
  const coverageFrom = `${priorWorkDate}T${settings.dayStart}:00`;
  const coverageTo = when.toISOString();

  const rangeEntries = log.filter((e) => {
    const key = zonedParts(new Date(e.at), settings.timezone).dateKey;
    return key === priorWorkDate || (key < today.dateKey && key >= priorWorkDate);
  });

  // Also include any still-open items regardless of day, so nothing is lost.
  const openStill = log.filter((e) => e.kind === "open" && !e.detail?.includes("[closed]"));

  const shipped = bucket(rangeEntries, "shipped");
  const missed = [...bucket(rangeEntries, "missed"), ...bucket(rangeEntries, "schedule_miss")];
  const broken = bucket(rangeEntries, "broken");
  const open = [...bucket(rangeEntries, "open"), ...openStill.filter((o) => !rangeEntries.includes(o))];

  const unacked = unacknowledgedWorkDates(state, when);
  const { adherence, notes } = assessAdherence(settings, when, unacked);

  const summary = [
    `Yesterday audit for workday ${today.dateKey} (covering ${priorWorkDate}).`,
    `Schedule: ${adherence.replaceAll("_", " ")}.`,
    ...notes,
    "",
    lineList("Shipped", shipped),
    "",
    lineList("Missed", missed),
    "",
    lineList("Broken", broken),
    "",
    lineList("Still open", open),
    "",
    "Start today from this audit — do not rediscover yesterday mid-day.",
  ].join("\n");

  return {
    id: `brief-${today.dateKey}`,
    forDate: today.dateKey,
    coverageFrom,
    coverageTo,
    preparedAt: when.toISOString(),
    adherence,
    scheduleNotes: notes,
    shipped,
    missed,
    broken,
    open,
    summary,
  };
}

export function unacknowledgedWorkDates(state: WorkDayState, when: Date = new Date()): string[] {
  const { settings, lastAcknowledgedDate } = state;
  const today = zonedParts(when, settings.timezone).dateKey;
  const prior = previousWorkDateKey(settings, today);

  // First-ever open: only the immediate prior workday — not a fake multi-week backlog.
  if (!lastAcknowledgedDate) {
    return [prior];
  }

  const dates: string[] = [];
  let key = prior;
  for (let i = 0; i < 10; i++) {
    if (key <= lastAcknowledgedDate) break;
    dates.push(key);
    key = previousWorkDateKey(settings, key);
  }
  return dates.reverse();
}

/**
 * True when Platynum must show the morning brief before productive work.
 * Brief is required on enabled workdays until today's brief is acknowledged.
 * Off-schedule opens (early / late / catch-up / weekend work) still require it
 * when there is an unacknowledged prior window or today's brief is pending.
 */
export function morningBriefRequired(state: WorkDayState, when: Date = new Date()): boolean {
  if (!state.settings.enabled) return false;
  const today = zonedParts(when, state.settings.timezone).dateKey;
  if (state.lastAcknowledgedDate === today) return false;

  const existing = state.briefs.find((b) => b.forDate === today && b.acknowledgedAt);
  if (existing) return false;

  // Require brief on workdays, or whenever catching up missed days, or when
  // opening work outside the schedule with a pending prior window.
  if (isWorkDay(state.settings, when)) return true;
  return unacknowledgedWorkDates(state, when).length > 0;
}

/**
 * Whether the overnight brief should already be prepared (dayStart - lead).
 */
export function briefShouldBeReady(settings: WorkDaySettings, when: Date = new Date()): boolean {
  if (!settings.enabled || !isWorkDay(settings, when)) return false;
  const nowMin = minutesSinceMidnight(when, settings.timezone);
  const readyMin = hmToMinutes(settings.dayStart) - Math.max(0, settings.briefLeadMinutes);
  return nowMin >= readyMin;
}

export function upsertBrief(state: WorkDayState, brief: MorningBrief): WorkDayState {
  const others = state.briefs.filter((b) => b.forDate !== brief.forDate);
  return { ...state, briefs: [...others, brief] };
}

export function acknowledgeBrief(state: WorkDayState, forDate: string, when: Date = new Date()): WorkDayState {
  const briefs = state.briefs.map((b) =>
    b.forDate === forDate ? { ...b, acknowledgedAt: when.toISOString() } : b,
  );
  return { ...state, briefs, lastAcknowledgedDate: forDate };
}

export function ensureTodayBrief(state: WorkDayState, when: Date = new Date()): WorkDayState {
  const today = zonedParts(when, state.settings.timezone).dateKey;
  const existing = state.briefs.find((b) => b.forDate === today);
  if (existing && !morningBriefRequired(state, when)) return state;
  const brief = prepareMorningBrief(state, when);
  // Preserve acknowledgment if somehow already set.
  if (existing?.acknowledgedAt) {
    brief.acknowledgedAt = existing.acknowledgedAt;
  }
  return upsertBrief(state, brief);
}

