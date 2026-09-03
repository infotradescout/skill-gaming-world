import { useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./Editor.tsx";
import { BuildPanel } from "./BuildPanel.tsx";
import { GitHubPanel } from "./GitHubPanel.tsx";
import { PairPanel } from "./PairPanel.tsx";
import { StartScreen } from "./StartScreen.tsx";
import { MorningBriefPanel } from "./MorningBriefPanel.tsx";
import { WorkDaySettingsPanel } from "./WorkDaySettingsPanel.tsx";
import { buildHandoffMarkdown, copyText, downloadText } from "./handoff.ts";
import { captureOAuthToken, commitFile, loadToken } from "./github.ts";
import { type BuildResponse } from "./build.ts";
import { pairDeviceId, type PairSession, pullPairPreview, pullPairWorkspace, pairHeartbeat, sendPairPreview, sendPairWorkspace, createPairing, joinPairing, leavePairing, getPairStatus, type PairFilePayload } from "./pair.ts";
import {
  buildPreviewDoc,
  DEMO_FILES,
  defaultWorkspace,
  githubKey,
  languageFromFilename,
  loadWorkspace,
  saveWorkspace,
  type Workspace,
} from "./workspace.ts";
import {
  acknowledgeBrief,
  ensureTodayBrief,
  loadWorkDayState,
  morningBriefRequired,
  recordWorkLog,
  saveWorkDayState,
  type WorkDaySettings,
  type WorkDayState,
  zonedParts,
} from "./workDay.ts";
import { ConceptRescuePanel } from "./ConceptRescuePanel.tsx";
import { RuntimeWorkspace } from "./RuntimeWorkspace.tsx";
import { getRuntimeStatus, type RuntimeStatus } from "./runtime.ts";
import {
  CONCEPT_RESCUE_FIXTURE_ARTIFACT,
} from "./conceptRescue.fixture.ts";
import {
  isConceptRescueIntent,
  markLocalFlowProven,
  runConceptRescue,
  type ConceptRescueResult,
} from "./conceptRescue.ts";

type MobileView = "code" | "preview";

const EXPERIENCE_STORAGE_KEY = "platynum47:advanced-workspace:v1";

function hasOpenedWorkspace(): boolean {
  try {
    return localStorage.getItem(EXPERIENCE_STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

function rememberOpenWorkspace(): void {
  try {
    localStorage.setItem(EXPERIENCE_STORAGE_KEY, "open");
  } catch {
    // The current session still works when storage is unavailable.
  }
}

function isLoopbackHost(): boolean {
  if (typeof window === "undefined") return false;
  // The Windows launcher always uses this exact origin. Keep ordinary Vite
  // development on localhost available for the hosted-fallback UI.
  return window.location.hostname === "127.0.0.1";
}

export function App() {
  const [ws, setWs] = useState<Workspace>(() => loadWorkspace());
  const [active, setActive] = useState<string>("index.html");
  const [mobileView, setMobileView] = useState<MobileView>("code");
  const [previewDoc, setPreviewDoc] = useState<string>(() => buildPreviewDoc(loadWorkspace()));
  const [workspaceOpen, setWorkspaceOpen] = useState<boolean>(() => hasOpenedWorkspace() && !isLoopbackHost());
  const [showRuntime, setShowRuntime] = useState<boolean>(() => hasOpenedWorkspace() && isLoopbackHost());
  const [runtimeIdea, setRuntimeIdea] = useState<string>("");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [initialIdea, setInitialIdea] = useState<string>("");
  const [showGitHub, setShowGitHub] = useState<boolean>(false);
  const [showBuild, setShowBuild] = useState<boolean>(false);
  const [showPair, setShowPair] = useState<boolean>(false);
  const [showWorkDaySettings, setShowWorkDaySettings] = useState<boolean>(false);
  const [conceptRescue, setConceptRescue] = useState<ConceptRescueResult | null>(null);
  const [workDay, setWorkDay] = useState<WorkDayState>(() => ensureTodayBrief(loadWorkDayState()));
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [pairSession, setPairSession] = useState<PairSession | null>(null);
  const [pairBusy, setPairBusy] = useState<boolean>(false);
  const [pairError, setPairError] = useState<string>("");
  const [pairedPreview, setPairedPreview] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const previewTimer = useRef<number | undefined>(undefined);
  const pairPushTimer = useRef<number | undefined>(undefined);
  const pairPollTimer = useRef<number | undefined>(undefined);
  const pairPreviewPushTimer = useRef<number | undefined>(undefined);
  const pairWorkspaceSignature = useRef<string>("");
  const pairPreviewSignature = useRef<string>("");
  const deviceId = useRef<string>(pairDeviceId());

  // The local workspace does not use the browser-side GitHub token flow. A
  // loopback callback is discarded rather than opening the legacy demo shell.
  useEffect(() => {
    if (isLoopbackHost()) {
      if (window.location.hash.includes("gh_token=")) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      return;
    }
    if (captureOAuthToken()) {
      rememberOpenWorkspace();
      setWorkspaceOpen(true);
      setShowGitHub(true);
    }
  }, []);

  // A local launcher exposes the real project runtime on loopback. Hosted
  // surfaces stay on the browser-safe fallback until their controller is wired.
  useEffect(() => {
    getRuntimeStatus()
      .then((status) => setRuntimeStatus(status))
      .catch(() => setRuntimeStatus(null));
  }, []);

  // Refresh schedule adherence periodically and keep today's brief prepared.
  useEffect(() => {
    const refresh = () => {
      setNowTick(Date.now());
      setWorkDay((prev) => {
        const next = ensureTodayBrief(prev, new Date());
        saveWorkDayState(next);
        return next;
      });
    };
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const briefRequired = morningBriefRequired(workDay, new Date(nowTick));
  const todayKey = zonedParts(new Date(nowTick), workDay.settings.timezone).dateKey;
  const todayBrief = workDay.briefs.find((b) => b.forDate === todayKey);

  const persistWorkDay = (next: WorkDayState) => {
    saveWorkDayState(next);
    setWorkDay(next);
  };

  const saveSchedule = (settings: WorkDaySettings) => {
    const next = ensureTodayBrief({ ...workDay, settings }, new Date());
    persistWorkDay(next);
  };

  const acknowledgeMorningBrief = () => {
    if (!todayBrief) return;
    const next = acknowledgeBrief(workDay, todayBrief.forDate, new Date());
    persistWorkDay(next);
  };

  const gateForWork = (action: () => void) => {
    if (morningBriefRequired(workDay, new Date())) {
      const prepared = ensureTodayBrief(workDay, new Date());
      persistWorkDay(prepared);
      return;
    }
    action();
  };

  const startFromIdea = async (idea: string) => {
    if (isConceptRescueIntent(idea)) {
      const diagnosed = markLocalFlowProven(
        runConceptRescue({
          userText: idea,
          artifactText: idea.includes("---")
            ? idea.split("---").slice(1).join("---").trim() || CONCEPT_RESCUE_FIXTURE_ARTIFACT
            : CONCEPT_RESCUE_FIXTURE_ARTIFACT,
          interpretationApproved: false,
        }),
      );
      setConceptRescue(diagnosed);
      setShowBuild(false);
      return;
    }
    if (isLoopbackHost()) {
      setRuntimeIdea(idea);
      setShowRuntime(true);
      return;
    }
    let status = runtimeStatus;
    if (!status) {
      status = await getRuntimeStatus().catch(() => null);
      if (status) setRuntimeStatus(status);
    }
    if (status?.enabled) {
      setRuntimeIdea(idea);
      setShowRuntime(true);
      return;
    }
    setInitialIdea(idea);
    setShowBuild(true);
  };

  // Debounced persist + preview rebuild so typing stays smooth on a phone.
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveWorkspace(ws), 400);
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreviewDoc(buildPreviewDoc(ws)), 250);
    if (pairSession && pairSession.role === "controller") {
      window.clearTimeout(pairPushTimer.current);
      pairPushTimer.current = window.setTimeout(() => {
        sendPairWorkspace(pairSession.pairCode, pairSession.role, deviceId.current, demoWorkspace()).catch(() => undefined);
      }, 700);
    }
    if (pairSession && pairSession.role === "runner") {
      window.clearTimeout(pairPreviewPushTimer.current);
      pairPreviewPushTimer.current = window.setTimeout(() => {
        sendPairPreview(pairSession.pairCode, pairSession.role, deviceId.current, buildPreviewDoc(ws)).catch(() => undefined);
      }, 900);
    }
    return () => {
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(previewTimer.current);
      window.clearTimeout(pairPushTimer.current);
      window.clearTimeout(pairPreviewPushTimer.current);
    };
  }, [ws, pairSession]);

  const activeFile = ws[active];
  const runPreview = () => setPreviewDoc(buildPreviewDoc(ws));
  const openWorkspace = () => {
    if (isLoopbackHost()) {
      setRuntimeIdea("");
      setShowRuntime(true);
      return;
    }
    rememberOpenWorkspace();
    setWorkspaceOpen(true);
  };

  const openProjectWorkspace = async () => {
    if (isLoopbackHost()) {
      setRuntimeIdea("");
      setShowRuntime(true);
      return;
    }
    let status = runtimeStatus;
    if (!status) {
      status = await getRuntimeStatus().catch(() => null);
      if (status) setRuntimeStatus(status);
    }
    if (status?.enabled) {
      setRuntimeIdea("");
      setShowRuntime(true);
      return;
    }
    openWorkspace();
  };

  const createPairSession = async () => {
    setPairBusy(true);
    setPairError("");
    try {
      const next = await createPairing(deviceId.current);
      pairWorkspaceSignature.current = "";
      pairPreviewSignature.current = "";
      setPairedPreview(null);
      setPairSession({
        pairCode: next.pairCode,
        role: next.role,
        paired: next.paired,
        controllerConnected: next.controllerConnected,
        runnerConnected: next.runnerConnected,
      });
      setShowPair(true);
    } catch (e) {
      setPairError(e instanceof Error ? e.message : String(e));
    } finally {
      setPairBusy(false);
    }
  };

  const joinPairSession = async (pairCode: string) => {
    setPairBusy(true);
    setPairError("");
    try {
      const next = await joinPairing(pairCode.trim().toUpperCase(), deviceId.current);
      pairWorkspaceSignature.current = "";
      pairPreviewSignature.current = "";
      setPairedPreview(null);
      setPairSession({
        pairCode: next.pairCode,
        role: next.role,
        paired: next.paired,
        controllerConnected: next.controllerConnected,
        runnerConnected: next.runnerConnected,
      });
      setShowPair(true);
    } catch (e) {
      setPairError(e instanceof Error ? e.message : String(e));
    } finally {
      setPairBusy(false);
    }
  };

  const leavePairSession = async () => {
    if (!pairSession) return;
    setPairBusy(true);
    setPairError("");
    try {
      await leavePairing(pairSession.pairCode, pairSession.role, deviceId.current);
    } catch {
      // best-effort
    } finally {
      setPairSession(null);
      setPairedPreview(null);
      pairWorkspaceSignature.current = "";
      pairPreviewSignature.current = "";
      setPairBusy(false);
      setShowPair(false);
    }
  };

  const demoWorkspace = (): PairFilePayload => {
    const snapshot: PairFilePayload = {};
    for (const file of DEMO_FILES) {
      const content = ws[file]?.content;
      if (typeof content === "string") snapshot[file] = content;
    }
    return snapshot;
  };

  const previewSource = pairSession?.role === "controller" && pairedPreview ? pairedPreview : previewDoc;

  useEffect(() => {
    if (!pairSession) {
      setPairedPreview(null);
      return;
    }

    const sync = async () => {
      if (!pairSession) return;
      try {
        await pairHeartbeat(pairSession.pairCode, pairSession.role, deviceId.current);
        const status = await getPairStatus(pairSession.pairCode, pairSession.role);
        setPairSession((current) => (current ? { ...current, ...status } : current));

        if (pairSession.role === "runner") {
          const workspace = await pullPairWorkspace(pairSession.pairCode, pairSession.role, deviceId.current);
          const signature = JSON.stringify(workspace);
          if (signature !== pairWorkspaceSignature.current && status.controllerConnected) {
            pairWorkspaceSignature.current = signature;
            setWs((prev) => {
              const next = { ...prev };
              for (const file of DEMO_FILES) {
                if (typeof workspace[file] === "string") {
                  next[file] = { name: file, language: languageFromFilename(file), content: workspace[file] };
                }
              }
              setActive("index.html");
              return next;
            });
          }
        } else {
          const preview = await pullPairPreview(pairSession.pairCode, pairSession.role, deviceId.current);
          if (preview && preview !== pairPreviewSignature.current) {
            pairPreviewSignature.current = preview;
            setPairedPreview(preview);
          }
          if (!preview) {
            setPairedPreview(null);
          }
        }
      } catch {
        // pair not ready or temporary network issue; keep running on local mode.
      }
    };

    window.clearInterval(pairPollTimer.current);
    sync();
    pairPollTimer.current = window.setInterval(sync, 1500);
    return () => {
      window.clearInterval(pairPollTimer.current);
    };
  }, [pairSession]);

  const updateActive = (content: string) => {
    setWs((prev) => ({ ...prev, [active]: { ...prev[active], content } }));
  };

  const resetWorkspace = () => {
    if (!window.confirm("Reset the demo files to the starter template? (GitHub files stay open.)")) return;
    const fresh = defaultWorkspace();
    setWs((prev) => ({ ...prev, ...fresh }));
    setActive("index.html");
    setPreviewDoc(buildPreviewDoc(fresh));
  };

  const exportHandoff = async () => {
    const project = window.prompt("Project name for the handoff package?", "") ?? "";
    const intent = window.prompt("One line: what outcome is this project for?", "") ?? "";
    const md = buildHandoffMarkdown(ws, { project, intent });
    downloadText("platynum47-handoff.md", md);
    const copied = await copyText(md);
    window.alert(
      copied
        ? "Handoff package downloaded and copied to clipboard — paste it into any LLM or share with a dev."
        : "Handoff package downloaded — open it to hand off to any LLM or dev.",
    );
  };

  const openGitHubFile = (
    fullName: string,
    branch: string,
    path: string,
    content: string,
    sha: string,
  ) => {
    const key = githubKey(fullName, branch, path);
    const name = path.split("/").pop() || path;
    setWs((prev) => ({
      ...prev,
      [key]: { name, language: languageFromFilename(name), content, github: { fullName, branch, path, sha } },
    }));
    setActive(key);
    setShowGitHub(false);
    setMobileView("code");
  };

  const commitActive = async () => {
    const file = ws[active];
    if (!file?.github) return;
    const message = window.prompt("Commit message?", `Update ${file.name} via Platynum-47`);
    if (!message) return;
    try {
      const newSha = await commitFile(
        loadToken(),
        file.github.fullName,
        file.github.branch,
        file.github.path,
        file.content,
        file.github.sha,
        message,
      );
      setWs((prev) => ({
        ...prev,
        [active]: { ...prev[active], github: { ...prev[active].github!, sha: newSha } },
      }));
      window.alert(`Committed to ${file.github.fullName} (${file.github.branch}).`);
    } catch (e) {
      window.alert(`Commit failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const applyBuild = (result: BuildResponse) => {
    const next: Workspace = { ...ws };
    const nextFiles = result.files ?? {};
    for (const file of DEMO_FILES) {
      const content = nextFiles[file];
      if (typeof content === "string") {
        next[file] = { name: file, language: languageFromFilename(file), content };
      }
    }
    if (!next["index.html"]) {
      next["index.html"] = defaultWorkspace()["index.html"];
    }
    if (!next["style.css"]) {
      next["style.css"] = defaultWorkspace()["style.css"];
    }
    if (!next["script.js"]) {
      next["script.js"] = defaultWorkspace()["script.js"];
    }
    setWs(next);
    setActive("index.html");
    setPreviewDoc(buildPreviewDoc(next));
    openWorkspace();
    setShowBuild(false);
    setMobileView("preview");
    persistWorkDay(
      recordWorkLog(workDay, {
        kind: "shipped",
        title: result.note?.trim() || "Applied a Platynum build",
        detail: result.model ? `Model: ${result.model}` : undefined,
        product: "Platynum-47",
      }),
    );
  };

  const fileKeys = useMemo(() => {
    const demo = DEMO_FILES.filter((k) => ws[k]);
    const gh = Object.keys(ws).filter((k) => k.startsWith("gh:"));
    return [...demo, ...gh];
  }, [ws]);

  const rootClass = useMemo(() => `app view-${mobileView}`, [mobileView]);

  const workDayOverlays = (
    <>
      {briefRequired && todayBrief && (
        <MorningBriefPanel
          brief={todayBrief}
          onAcknowledge={acknowledgeMorningBrief}
          onOpenSettings={() => setShowWorkDaySettings(true)}
        />
      )}
      {showWorkDaySettings && (
        <WorkDaySettingsPanel
          settings={workDay.settings}
          onSave={saveSchedule}
          onClose={() => setShowWorkDaySettings(false)}
        />
      )}
    </>
  );

  if (showRuntime) {
    return (
      <>
        <RuntimeWorkspace
          initialIdea={runtimeIdea}
          onClose={() => setShowRuntime(false)}
          onWorkComplete={(summary) =>
            persistWorkDay(
              recordWorkLog(workDay, {
                kind: "shipped",
                title: summary,
                product: "Platynum-47",
              }),
            )
          }
        />
        {workDayOverlays}
      </>
    );
  }

  if (!workspaceOpen) {
    return (
      <>
        <StartScreen
          onStart={(idea) => {
            gateForWork(() => {
              void startFromIdea(idea);
            });
          }}
          onOpenWorkspace={() => gateForWork(() => {
            void openProjectWorkspace();
          })}
          onOpenWorkDaySettings={() => setShowWorkDaySettings(true)}
        />
        {showBuild && !briefRequired && !conceptRescue && !isLoopbackHost() && (
          <BuildPanel initialIdea={initialIdea} onClose={() => setShowBuild(false)} onApplyBuild={applyBuild} />
        )}
        {conceptRescue && (
          <ConceptRescuePanel result={conceptRescue} onClose={() => setConceptRescue(null)} />
        )}
        {workDayOverlays}
      </>
    );
  }

  return (
    <div className={rootClass}>
      <header className="topbar">
        <div className="brand">
          Platynum<span className="brand-accent">-47</span>
        </div>
        <div className="modes" role="tablist" aria-label="View">
          <button
            className={mobileView === "code" ? "seg active" : "seg"}
            onClick={() => setMobileView("code")}
          >
            Code
          </button>
          <button
            className={mobileView === "preview" ? "seg active" : "seg"}
            onClick={() => {
              runPreview();
              setMobileView("preview");
            }}
          >
            Preview
          </button>
        </div>
        <div className="actions">
          <button
            className="btn"
            onClick={() => setShowWorkDaySettings(true)}
            title="Work day start/stop/sleep schedule and morning audit"
          >
            Schedule
          </button>
          {!isLoopbackHost() && (
            <button
              className="btn build-btn"
              onClick={() => {
                gateForWork(() => {
                  setInitialIdea("");
                  setShowBuild(true);
                });
              }}
              title="Describe what to build and get a 1-2-3 plan"
            >
              Build
            </button>
          )}
          <button className="btn" onClick={() => void openProjectWorkspace()} title="Open a real local project">
            Projects
          </button>
          <button className="btn" onClick={() => setShowPair(true)} title="Pair an editor and preview device">
            {pairSession ? "Pairing" : "Pair"}
          </button>
          <button className="btn" onClick={runPreview} title="Re-run preview">
            Run
          </button>
          <button className="btn" onClick={() => setShowGitHub(true)} title="Open a file from GitHub">
            GitHub
          </button>
          {activeFile?.github && (
            <button className="btn" onClick={commitActive} title="Commit this file to GitHub">
              Commit
            </button>
          )}
          <button className="btn" onClick={exportHandoff} title="Export handoff package for another LLM/dev">
            Handoff
          </button>
          <button className="btn ghost" onClick={resetWorkspace} title="Reset demo files">
            Reset
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Files">
        {fileKeys.map((key) => (
          <button
            key={key}
            className={key === active ? "tab active" : "tab"}
            onClick={() => setActive(key)}
            title={ws[key].github ? `${ws[key].github!.fullName} @ ${ws[key].github!.branch}` : undefined}
          >
            {ws[key].github ? "⌥ " : ""}
            {ws[key].name}
          </button>
        ))}
      </div>

      <main className="panes">
        <section className="editor-pane">
          {activeFile && (
            <Editor
              fileName={active}
              language={activeFile.language}
              value={activeFile.content}
              onChange={updateActive}
            />
          )}
        </section>
        <section className="preview-pane">
          <iframe
            title="preview"
            className="preview-frame"
            sandbox="allow-scripts allow-modals"
            srcDoc={previewSource}
          />
        </section>
      </main>

      <footer className="statusbar">
        <span>
          {pairSession?.paired
            ? `${pairSession.role === "runner" ? "Runner" : "Controller"} paired (${pairSession.pairCode})`
            : "Runs on this device · saved locally"}
        </span>
        <span className="muted">self-hosted · open on your phone</span>
      </footer>

      {showGitHub && <GitHubPanel onClose={() => setShowGitHub(false)} onOpenFile={openGitHubFile} />}
      {showBuild && !briefRequired && !isLoopbackHost() && (
        <BuildPanel initialIdea={initialIdea} onClose={() => setShowBuild(false)} onApplyBuild={applyBuild} />
      )}
      {showPair && (
        <PairPanel
          onClose={() => setShowPair(false)}
          pairSession={pairSession}
          onCreate={createPairSession}
          onJoin={joinPairSession}
          onLeave={leavePairSession}
          busy={pairBusy}
          error={pairError}
        />
      )}
      {workDayOverlays}
    </div>
  );
}
