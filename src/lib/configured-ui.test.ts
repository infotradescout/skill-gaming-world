import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WalletSandbox } from "@/components/player-panels";

describe("configured player UI boundaries", () => {
  it("renders a configured wallet without actionable sandbox package controls", () => {
    const markup = renderToStaticMarkup(
      createElement(WalletSandbox, {
        initialBalance: 0,
        initialEntries: [],
        sandboxPackagesEnabled: false,
      }),
    );

    expect(markup).toContain("Packages unavailable");
    expect(markup).not.toContain("Run sandbox adapter");
    expect(markup).not.toContain("package-card");
  });

  it("routes competition and practice pages through runtime-backed services", () => {
    const paths = [
      "src/app/app/monetaire/page.tsx",
      "src/app/app/monetaire/competitions/page.tsx",
      "src/app/(marketing)/monetaire/competitions/page.tsx",
    ];
    for (const path of paths) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).toContain("runtimeCompetitionSnapshot");
      expect(source).not.toContain("publicCompetitionSnapshotIfAvailable");
    }

    const practice = readFileSync(
      resolve(process.cwd(), "src/app/app/monetaire/practice/page.tsx"),
      "utf8",
    );
    expect(practice).toContain("runtimeEligibilitySnapshot");
    expect(practice).not.toContain('user.status !== "ACTIVE"');
  });

  it("keeps the usable Monetaire control and resume paths wired", () => {
    const board = readFileSync(
      resolve(process.cwd(), "src/components/solitaire-board.tsx"),
      "utf8",
    );
    expect(board).toContain("sessionHint(session)");
    expect(board).toContain("onDoubleClick={moveWasteToFoundation}");
    expect(board).toContain("onDragStart");
    expect(board).toContain("resumeSessionId");

    const dashboard = readFileSync(
      resolve(process.cwd(), "src/app/app/page.tsx"),
      "utf8",
    );
    expect(dashboard).toContain(
      "/app/monetaire/practice?session=${encodeURIComponent(session.id)}",
    );
  });
});
