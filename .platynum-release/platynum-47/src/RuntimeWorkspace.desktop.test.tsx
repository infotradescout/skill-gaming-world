/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"http://127.0.0.1:5173/"} */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectedProject = { id: "picked", name: "picked-project", root: "C:\\Work\\picked-project", kind: "git" as const, branch: "main", dirty: false, changedFiles: 0, scripts: [] };
  const runtime = {
    getRuntimeStatus: vi.fn(async () => ({ enabled: true, host: "127.0.0.1", codex: { installed: true, signedIn: true, command: "codex.exe" }, projects: [] })),
    discoverRuntimeProjects: vi.fn(async () => ({ projects: [], entries: [] })),
    getRuntimeAuthStatus: vi.fn(async () => ({ installed: true, signedIn: true, command: "codex.exe", state: "idle", message: "" })),
    openRuntimeProject: vi.fn(async () => selectedProject),
    getRuntimeProject: vi.fn(async () => ({ ...selectedProject, files: [], readme: null, previewUrl: null })),
    listRuntimeJobs: vi.fn(async () => ({ jobs: [] })),
    browseRuntimeFolders: vi.fn(async () => ({ path: "", entries: [] })),
    cancelRuntimeJob: vi.fn(),
    getRuntimeJob: vi.fn(),
    readRuntimeFile: vi.fn(),
    resumeRuntimeJob: vi.fn(),
    saveRuntimeFile: vi.fn(),
    setRuntimePreview: vi.fn(),
    startRuntimeAuth: vi.fn(),
    startRuntimeBuild: vi.fn(),
    startRuntimeCheck: vi.fn(),
    startRuntimeUnderstanding: vi.fn(),
  };
  return { selectedProject, runtime };
});
const { selectedProject, runtime } = mocks;

vi.mock("./runtime.ts", () => mocks.runtime);

import { RuntimeWorkspace } from "./RuntimeWorkspace.tsx";

beforeEach(() => {
  runtime.openRuntimeProject.mockClear();
  runtime.getRuntimeProject.mockClear();
  window.platynumDesktop = { chooseProjectFolder: vi.fn(async () => selectedProject) };
});

afterEach(() => {
  cleanup();
  delete window.platynumDesktop;
});

describe("desktop project picker", () => {
  it("uses the native bridge instead of asking the renderer for a filesystem path", async () => {
    render(<RuntimeWorkspace onClose={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: "Choose a folder" }));

    await waitFor(() => expect(window.platynumDesktop?.chooseProjectFolder).toHaveBeenCalledOnce());
    await waitFor(() => expect(runtime.openRuntimeProject).toHaveBeenCalledWith(selectedProject.root));
    expect(await screen.findByRole("heading", { name: selectedProject.name })).toBeVisible();
  });
});
