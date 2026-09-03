/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntentCheckpointCard } from "./IntentCheckpointCard.tsx";
import { FIRST_INTENT_TITLE, type IntentCheckpoint } from "./steering.ts";

afterEach(cleanup);

function baseCheckpoint(overrides: Partial<IntentCheckpoint> = {}): IntentCheckpoint {
  return {
    id: "cp-1",
    kind: "intent_understanding",
    title: FIRST_INTENT_TITLE,
    summary: "I understand that you want all ISSA work halted.",
    status: "pending",
    createdAt: "2026-07-24T12:00:00.000Z",
    ...overrides,
  };
}

describe("IntentCheckpointCard", () => {
  it("renders the first intent title with approve and correct controls", () => {
    render(
      <IntentCheckpointCard
        checkpoint={baseCheckpoint()}
        correcting={false}
        correctionDraft=""
        onCorrectionDraftChange={vi.fn()}
        onApprove={vi.fn()}
        onDislike={vi.fn()}
        onSubmitCorrection={vi.fn()}
      />,
    );

    expect(screen.getByRole("article", { name: FIRST_INTENT_TITLE })).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Correct" })).toBeVisible();
  });

  it("opens inline correction on dislike and submits a revision path", () => {
    const onDislike = vi.fn();
    const onSubmit = vi.fn();
    const onDraft = vi.fn();

    const { rerender } = render(
      <IntentCheckpointCard
        checkpoint={baseCheckpoint()}
        correcting={false}
        correctionDraft=""
        onCorrectionDraftChange={onDraft}
        onApprove={vi.fn()}
        onDislike={onDislike}
        onSubmitCorrection={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Correct" }));
    expect(onDislike).toHaveBeenCalledOnce();

    rerender(
      <IntentCheckpointCard
        checkpoint={baseCheckpoint({ status: "awaiting_correction" })}
        correcting={true}
        correctionDraft="Continue the existing ISSA own-shell fix only."
        onCorrectionDraftChange={onDraft}
        onApprove={vi.fn()}
        onDislike={onDislike}
        onSubmitCorrection={onSubmit}
      />,
    );

    expect(screen.getByLabelText("What should SI do instead?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Apply correction" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("marks a rejected checkpoint and shows the revised understanding line", () => {
    render(
      <IntentCheckpointCard
        checkpoint={baseCheckpoint({
          status: "rejected",
          correction: "Continue the existing ISSA own-shell fix only.",
          revisedSummary:
            "Revised understanding: continue the existing ISSA own-shell fix only.",
        })}
        correcting={false}
        correctionDraft=""
        onCorrectionDraftChange={vi.fn()}
        onApprove={vi.fn()}
        onDislike={vi.fn()}
        onSubmitCorrection={vi.fn()}
      />,
    );

    expect(screen.getByText("Rejected")).toBeVisible();
    expect(
      screen.getByText("Revised understanding: continue the existing ISSA own-shell fix only."),
    ).toBeVisible();
  });
});

