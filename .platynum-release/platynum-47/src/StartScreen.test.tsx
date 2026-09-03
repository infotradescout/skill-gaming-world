/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartScreen } from "./StartScreen.tsx";

afterEach(cleanup);

describe("StartScreen", () => {
  it("puts the idea-first positioning and beginner journey before advanced controls", () => {
    render(<StartScreen onStart={vi.fn()} onOpenWorkspace={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /Cursor starts with code\. Platynum starts with you\./i })).toBeVisible();
    expect(
      screen.getByText(
        "Cursor helps developers code faster. Platynum helps anyone turn an idea into a finished product.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("What are you trying to make?")).toHaveAttribute("placeholder", "Describe your idea");

    for (const label of [
      "Your idea",
      "What SI understands",
      "Three recommendations",
      "Consensus",
      "Wildcard",
      "Progress",
      "Preview",
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }

    expect(screen.queryByRole("button", { name: "GitHub" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Code" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the optional advanced workspace" })).toBeVisible();
  });

  it("passes a plain-language idea into the managed flow", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onOpenWorkspace={vi.fn()} />);

    const start = screen.getByRole("button", { name: "Start with my idea" });
    expect(start).toBeDisabled();

    fireEvent.change(screen.getByLabelText("What are you trying to make?"), {
      target: { value: "  A neighborhood tool library  " },
    });
    fireEvent.click(start);

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith("A neighborhood tool library");
  });
});

