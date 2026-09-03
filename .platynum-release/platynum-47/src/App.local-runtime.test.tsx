/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"http://127.0.0.1:5173/"} */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./runtime.ts", () => ({
  getRuntimeStatus: vi.fn().mockRejectedValue(new Error("Local worker is starting.")),
}));

vi.mock("./RuntimeWorkspace.tsx", () => ({
  RuntimeWorkspace: ({ initialIdea = "" }: { initialIdea?: string }) => (
    <div data-testid="local-runtime">Local runtime: {initialIdea}</div>
  ),
}));

import { App } from "./App.tsx";

beforeEach(() => {
  localStorage.clear();
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

describe("local Platynum route", () => {
  it("keeps a local start in the runtime even while the status check is unavailable", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("What are you trying to make?"), {
      target: { value: "Finish my real project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start with my idea" }));

    expect(await screen.findByTestId("local-runtime")).toHaveTextContent("Finish my real project");
    expect(screen.queryByRole("button", { name: "Build" })).not.toBeInTheDocument();
  });

  it("discards a legacy GitHub callback instead of opening the old browser shell", async () => {
    window.history.replaceState({}, "", "/#gh_token=legacy-token");
    render(<App />);

    expect(await screen.findByLabelText("What are you trying to make?")).toBeVisible();
    expect(localStorage.getItem("platynum47:github:token:v1")).toBeNull();
    expect(screen.queryByRole("button", { name: "GitHub" })).not.toBeInTheDocument();
  });
});
