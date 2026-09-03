/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { WORK_DAY_STORAGE_KEY, type WorkDayState } from "./workDay.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function seed(state: WorkDayState) {
  localStorage.setItem(WORK_DAY_STORAGE_KEY, JSON.stringify(state));
}

describe("morning brief gate", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("blocks Start with my idea until yesterday’s audit is acknowledged", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // Fixed Monday and Sunday log entry keep the prior-workday audit deterministic.
    seed({
      settings: {
        enabled: true,
        timezone: "",
        workDays: [0, 1, 2, 3, 4, 5, 6],
        dayStart: "00:00",
        dayEnd: "23:59",
        sleepAt: "23:59",
        briefLeadMinutes: 0,
      },
      log: [
        {
          id: "1",
          at: "2026-08-30T18:00:00.000Z",
          kind: "broken",
          title: "Hero seam still wrong",
        },
      ],
      briefs: [],
    });

    render(<App />);

    expect(screen.getByRole("heading", { name: /Yesterday’s audit/i })).toBeVisible();
    expect(screen.getAllByText(/Hero seam still wrong/i).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("What are you trying to make?"), {
      target: { value: "A pantry board" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start with my idea" }));
    // Build panel must not open while brief is pending.
    expect(screen.queryByText(/What I understand you want/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Begin workday from this audit/i }));
    expect(screen.queryByRole("heading", { name: /Yesterday’s audit/i })).not.toBeInTheDocument();
  });
});
