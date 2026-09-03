/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.tsx";

beforeEach(() => {
  localStorage.clear();
  // First-run tests assert the idea surface; disable schedule gate for that path.
  localStorage.setItem(
    "platynum47:work-day:v1",
    JSON.stringify({
      settings: {
        enabled: false,
        timezone: "",
        workDays: [1, 2, 3, 4, 5],
        dayStart: "09:00",
        dayEnd: "17:00",
        sleepAt: "22:00",
        briefLeadMinutes: 30,
      },
      log: [],
      briefs: [],
    }),
  );
  window.history.replaceState({}, "", "/");
});

afterEach(cleanup);

describe("App first run", () => {
  it("opens with the person's idea before loading the advanced workspace", () => {
    render(<App />);

    expect(screen.getByLabelText("What are you trying to make?")).toBeVisible();
    expect(screen.queryByRole("button", { name: "GitHub" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Code" })).not.toBeInTheDocument();
  });
});

