/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORK_DAY_SETTINGS,
  acknowledgeBrief,
  assessAdherence,
  briefShouldBeReady,
  defaultWorkDayState,
  ensureTodayBrief,
  morningBriefRequired,
  prepareMorningBrief,
  previousWorkDateKey,
  recordWorkLog,
  type WorkDayState,
} from "./workDay.ts";

function atLocal(isoLocal: string): Date {
  // Treat as local wall time for deterministic tests (no TZ string).
  return new Date(isoLocal);
}

function mondayMorning(): Date {
  // 2026-07-20 is a Monday.
  return atLocal("2026-07-20T09:05:00");
}

describe("work day schedule + morning brief", () => {
  it("defaults to weekday start/stop/sleep with brief lead time", () => {
    expect(DEFAULT_WORK_DAY_SETTINGS.workDays).toEqual([1, 2, 3, 4, 5]);
    expect(DEFAULT_WORK_DAY_SETTINGS.dayStart).toBe("09:00");
    expect(DEFAULT_WORK_DAY_SETTINGS.dayEnd).toBe("17:00");
    expect(DEFAULT_WORK_DAY_SETTINGS.sleepAt).toBe("22:00");
    expect(DEFAULT_WORK_DAY_SETTINGS.briefLeadMinutes).toBe(30);
  });

  it("previous work date skips weekend", () => {
    const settings = { ...DEFAULT_WORK_DAY_SETTINGS, timezone: "" };
    // Monday → prior Friday
    expect(previousWorkDateKey(settings, "2026-07-20")).toBe("2026-07-17");
  });

  it("builds a complete yesterday audit before the workday starts", () => {
    let state = defaultWorkDayState();
    state = recordWorkLog(state, {
      kind: "shipped",
      title: "Merged SI PR #5",
      at: "2026-07-17T14:00:00.000Z",
      product: "SI",
    });
    state = recordWorkLog(state, {
      kind: "broken",
      title: "ISSA hero seam",
      detail: "dual poster/video layer",
      at: "2026-07-17T16:00:00.000Z",
      product: "TradeScout",
    });
    state = recordWorkLog(state, {
      kind: "missed",
      title: "Ops 5–7 not started",
      at: "2026-07-17T17:30:00.000Z",
    });
    state = recordWorkLog(state, {
      kind: "open",
      title: "Portrait hero asset for mobile",
      at: "2026-07-17T18:00:00.000Z",
    });

    const brief = prepareMorningBrief(state, mondayMorning());
    expect(brief.forDate).toBe("2026-07-20");
    expect(brief.shipped.map((e) => e.title)).toContain("Merged SI PR #5");
    expect(brief.broken.map((e) => e.title)).toContain("ISSA hero seam");
    expect(brief.missed.map((e) => e.title)).toContain("Ops 5–7 not started");
    expect(brief.open.map((e) => e.title)).toContain("Portrait hero asset for mobile");
    expect(brief.summary).toMatch(/Yesterday audit/i);
    expect(brief.summary).toMatch(/Start today from this audit/i);
  });

  it("requires morning brief until acknowledged on a workday", () => {
    let state = defaultWorkDayState();
    const when = mondayMorning();
    expect(morningBriefRequired(state, when)).toBe(true);

    state = ensureTodayBrief(state, when);
    state = acknowledgeBrief(state, "2026-07-20", when);
    expect(morningBriefRequired(state, when)).toBe(false);
  });

  it("marks late starts and still requires the brief", () => {
    const state = defaultWorkDayState();
    const late = atLocal("2026-07-20T11:00:00");
    const { adherence, notes } = assessAdherence(state.settings, late, []);
    expect(adherence).toBe("late");
    expect(notes.join(" ")).toMatch(/Late start/i);
    expect(morningBriefRequired(state, late)).toBe(true);
  });

  it("marks early opens before day start", () => {
    const state = defaultWorkDayState();
    const early = atLocal("2026-07-20T07:30:00");
    const { adherence } = assessAdherence(state.settings, early, []);
    expect(adherence).toBe("early");
  });

  it("catch-up when multiple workdays were missed", () => {
    const state: WorkDayState = {
      ...defaultWorkDayState(),
      lastAcknowledgedDate: "2026-07-13",
    };
    const when = mondayMorning();
    const { adherence, notes } = assessAdherence(state.settings, when, ["2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"]);
    expect(adherence).toBe("catch_up");
    expect(notes.join(" ")).toMatch(/Catch-up/i);
  });

  it("records overtime past day end / sleep", () => {
    const state = defaultWorkDayState();
    const overtime = atLocal("2026-07-20T23:10:00");
    const { adherence } = assessAdherence(state.settings, overtime, []);
    expect(adherence).toBe("off_schedule_overtime");
  });

  it("brief is ready briefLeadMinutes before day start", () => {
    const settings = DEFAULT_WORK_DAY_SETTINGS;
    expect(briefShouldBeReady(settings, atLocal("2026-07-20T08:30:00"))).toBe(true);
    expect(briefShouldBeReady(settings, atLocal("2026-07-20T08:20:00"))).toBe(false);
  });

  it("does not require brief when schedule disabled", () => {
    const state: WorkDayState = {
      ...defaultWorkDayState(),
      settings: { ...DEFAULT_WORK_DAY_SETTINGS, enabled: false },
    };
    expect(morningBriefRequired(state, mondayMorning())).toBe(false);
  });
});

