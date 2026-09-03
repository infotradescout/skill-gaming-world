import { useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./Editor.tsx";
import { getDesktopBridge } from "./desktopBridge.ts";
import { languageFromFilename } from "./workspace.ts";
import {
  browseRuntimeFolders,
  cancelRuntimeJob,
  discoverRuntimeProjects,
  getRuntimeAuthStatus,
  getRuntimeJob,
  getRuntimeProject,
  listRuntimeJobs,
  getRuntimeStatus,
  openRuntimeProject,
  readRuntimeFile,
  resumeRuntimeJob,
  saveRuntimeFile,
  setRuntimePreview,
  startRuntimeAuth,
  startRuntimeBuild,
  startRuntimeCheck,
  startRuntimeUnderstanding,
  type RuntimeAuthStatus,
  type RuntimeBrowseEntry,
  type RuntimeCheckpoint,
  type RuntimeFile,
  type RuntimeFileEntry,
  type RuntimeJob,
  type RuntimeProject,
  type RuntimeProjectSnapshot,
  type RuntimeStatus,
} from "./runtime.ts";

interface RuntimeWorkspaceProps {
  initialIdea?: string;
  onClose: () => void;
  onWorkComplete?: (summary: string) => void;
}

type RuntimeSurface = "files" | "preview";

function terminalJob(job: RuntimeJob | null): boolean {
  return Boolean(job && ["completed", "failed", "cancelled"].includes(job.status));
}

function displayPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-3).join("/") || normalized;
}

function checkpointFromJob(job: RuntimeJob | null): RuntimeCheckpoint | null {
  if (!job?.checkpoint) return null;
  const candidate = job.checkpoint;
  return {
    title: "What I understand you want",
    understanding: candidate.understanding?.trim() || "I understand the project direction and will inspect it before editing.",
    recommendations: Array.isArray(candidate.recommendations)
      ? candidate.recommendations.filter((item): item is string => typeof item === "string").slice(0, 3)
      : [],
    consensus: candidate.consensus?.trim() || "The strongest path is to make the smallest safe change that proves this outcome.",
    wildcard: candidate.wildcard?.trim() || "I’ll surface a useful alternative if the project evidence supports one.",
    acceptance: Array.isArray(candidate.acceptance)
      ? candidate.acceptance.filter((item): item is string => typeof item === "string")
      : [],
    humanActions: Array.isArray(candidate.humanActions)
      ? candidate.humanActions.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function fileLabel(entry: RuntimeFileEntry): string {
  return entry.kind === "directory" ? `▸ ${entry.name}` : entry.name;
}

function authMessage(auth: RuntimeAuthStatus | null, status: RuntimeStatus | null): string {
  if (!status?.codex.installed) return "The local worker is not included on this machine yet.";
  if (auth?.state === "running") return auth.message || "A browser sign-in window should be open.";
  if (!status.codex.signedIn && auth?.message) return auth.message;
  return "Connect your ChatGPT account once. Platynum keeps the sign-in on this computer.";
}

export function RuntimeWorkspace({ initialIdea = "", onClose, onWorkComplete }: RuntimeWorkspaceProps) {
  const desktop = getDesktopBridge();
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [statusError, setStatusError] = useState<string>("");
  const [projects, setProjects] = useState<RuntimeProject[]>([]);
  const [entries, setEntries] = useState<RuntimeBrowseEntry[]>([]);
  const [browsePath, setBrowsePath] = useState<string>("");
  const [pickerBusy, setPickerBusy] = useState<boolean>(false);
  const [project, setProject] = useState<RuntimeProjectSnapshot | null>(null);
  const [projectError, setProjectError] = useState<string>("");
  const [activePath, setActivePath] = useState<string>("");
  const [activeFile, setActiveFile] = useState<RuntimeFile | null>(null);
  const [fileBusy, setFileBusy] = useState<boolean>(false);
  const [fileDirty, setFileDirty] = useState<boolean>(false);
  const [fileSaveState, setFileSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [surface, setSurface] = useState<RuntimeSurface>("files");
  const [task, setTask] = useState<string>(initialIdea);
  const [checkpoint, setCheckpoint] = useState<RuntimeCheckpoint | null>(null);
  const [correction, setCorrection] = useState<string>("");
  const [job, setJob] = useState<RuntimeJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string>("");
  const [auth, setAuth] = useState<RuntimeAuthStatus | null>(null);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "starting" | "running" | "stopped" | "failed">("idle");
  const [previewMessage, setPreviewMessage] = useState<string>("");
  const [previewBusy, setPreviewBusy] = useState<boolean>(false);
  const [lastBuild, setLastBuild] = useState<RuntimeJob | null>(null);
  const [recoveryJobs, setRecoveryJobs] = useState<RuntimeJob[]>([]);
  const pollRef = useRef<number | undefined>(undefined);
  const authPollRef = useRef<number | undefined>(undefined);

  const refreshStatus = async () => {
    try {
      const next = await getRuntimeStatus();
      setStatus(next);
      setProjects(next.projects || []);
      setStatusError("");
      if (!next.codex.signedIn) {
        const authState = await getRuntimeAuthStatus().catch(() => null);
        if (authState) setAuth(authState);
      }
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : String(error));
      setStatus({
        enabled: false,
        host: "loopback",
        codex: { installed: false, signedIn: false, command: null },
        projects: [],
      });
    }
  };

  useEffect(() => {
    refreshStatus().catch(() => undefined);
    return () => {
      window.clearInterval(pollRef.current);
      window.clearInterval(authPollRef.current);
    };
  }, []);

  const refreshProjects = async () => {
    setPickerBusy(true);
    try {
      const next = await discoverRuntimeProjects();
      setProjects(next.projects || []);
      setEntries(next.entries || []);
      setBrowsePath("");
      setProjectError("");
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      setPickerBusy(false);
    }
  };

  useEffect(() => {
    refreshProjects().catch(() => undefined);
  }, []);

  const openFolderBrowser = async (nextPath = "") => {
    setPickerBusy(true);
    try {
      const result = await browseRuntimeFolders(nextPath);
      setBrowsePath(result.path);
      setEntries(result.entries || []);
      setProjectError("");
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      setPickerBusy(false);
    }
  };

  const chooseDesktopProject = async () => {
    if (!desktop) return;
    setPickerBusy(true);
    setProjectError("");
    try {
      const selected = await desktop.chooseProjectFolder();
      if (!selected) return;
      setProjects((current) => [selected, ...current.filter((item) => item.id !== selected.id)]);
      await loadProject(selected.root);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      setPickerBusy(false);
    }
  };

  const loadProject = async (root: string) => {
    setPickerBusy(true);
    setProjectError("");
    try {
      const opened = await openRuntimeProject(root);
      const snapshot = await getRuntimeProject(opened.id);
      const recovery = await listRuntimeJobs(opened.id).catch(() => ({ jobs: [] }));
      setProject(snapshot);
      setRecoveryJobs((recovery.jobs || []).filter((item) => item.resumeAvailable).slice(0, 3));
      setPreviewUrl(snapshot.previewUrl || null);
      setPreviewState(snapshot.previewUrl ? "running" : "idle");
      setActivePath("");
      setActiveFile(null);
      setFileDirty(false);
      setLastBuild(null);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      setPickerBusy(false);
    }
  };

  const refreshProject = async () => {
    if (!project) return;
    try {
      const snapshot = await getRuntimeProject(project.id);
      setProject(snapshot);
      setPreviewUrl(snapshot.previewUrl || null);
      if (activePath && !snapshot.files.some((entry) => entry.kind === "file" && entry.path === activePath)) {
        setActivePath("");
        setActiveFile(null);
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    }
  };

  const openFile = async (entry: RuntimeFileEntry) => {
    if (entry.kind !== "file" || !project) return;
    setFileBusy(true);
    setProjectError("");
    try {
      const file = await readRuntimeFile(project.id, entry.path);
      setActivePath(entry.path);
      setActiveFile({ ...file, language: file.language || languageFromFilename(entry.name) });
      setFileDirty(false);
      setFileSaveState("saved");
      setSurface("files");
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      setFileBusy(false);
    }
  };

  useEffect(() => {
    if (!project || !activeFile || !activePath || !fileDirty) return;
    setFileSaveState("saving");
    const timer = window.setTimeout(() => {
      saveRuntimeFile(project.id, activePath, activeFile.content, activeFile.sha256)
        .then((saved) => {
          setActiveFile((current) => (current ? { ...current, sha256: saved.sha256 } : current));
          setFileDirty(false);
          setFileSaveState("saved");
          refreshProject().catch(() => undefined);
        })
        .catch((error) => {
          setFileSaveState("error");
          setProjectError(error instanceof Error ? error.message : String(error));
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeFile?.content, activePath, fileDirty, project?.id]);

  const pollJob = async (id: string) => {
    try {
      const next = await getRuntimeJob(id);
      setJob(next);
      setJobError(next.error || "");
      if (terminalJob(next)) {
        window.clearInterval(pollRef.current);
        setJobId(null);
        if (next.kind === "understand" && next.status === "completed") {
          setCheckpoint(checkpointFromJob(next));
        }
        if (next.kind === "build") {
          setLastBuild(next);
          if (next.status === "completed") {
            setCheckpoint(null);
            setSurface("preview");
            if (next.result?.previewUrl) {
              setPreviewUrl(next.result.previewUrl);
              setPreviewState("running");
            }
            onWorkComplete?.(next.result?.summary || "Platynum finished a project pass.");
            refreshProject().catch(() => undefined);
          }
        }
      }
    } catch (error) {
      setJobError(error instanceof Error ? error.message : String(error));
      window.clearInterval(pollRef.current);
      setJobId(null);
    }
  };

  useEffect(() => {
    window.clearInterval(pollRef.current);
    if (!jobId) return;
    pollJob(jobId).catch(() => undefined);
    pollRef.current = window.setInterval(() => pollJob(jobId).catch(() => undefined), 900);
    return () => window.clearInterval(pollRef.current);
  }, [jobId]);

  const startJob = async (kind: "understand" | "build" | "check", checkKind?: string) => {
    if (!project) return;
    setJobError("");
    setJob(null);
    try {
      const next =
        kind === "understand"
          ? await startRuntimeUnderstanding(project.id, task.trim())
          : kind === "build" && checkpoint
            ? await startRuntimeBuild(project.id, task.trim(), checkpoint)
            : await startRuntimeCheck(project.id, checkKind || "test");
      setJobId(next.jobId);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : String(error));
    }
  };

  const cancelJob = async () => {
    if (!jobId) return;
    try {
      await cancelRuntimeJob(jobId);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : String(error));
    }
  };

  const resumeJob = async () => {
    if (!job || !job.resumeAvailable) return;
    setJobError("");
    try {
      const next = await resumeRuntimeJob(job.id);
      setJobId(next.jobId);
      setJob(null);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : String(error));
    }
  };

  const resumeRecoveryJob = async (previous: RuntimeJob) => {
    try {
      const next = await resumeRuntimeJob(previous.id);
      setRecoveryJobs((items) => items.filter((item) => item.id !== previous.id));
      setJob(null);
      setJobId(next.jobId);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : String(error));
    }
  };

  const startAuth = async () => {
    setAuthBusy(true);
    setJobError("");
    try {
      const started = await startRuntimeAuth();
      setAuth({
        installed: true,
        signedIn: false,
        command: status?.codex.command || null,
        state: "running",
        message: started.message,
      });
      window.clearInterval(authPollRef.current);
      authPollRef.current = window.setInterval(async () => {
        const next = await getRuntimeAuthStatus(started.jobId).catch(() => null);
        if (!next) return;
        setAuth(next);
        if (next.signedIn || next.state === "failed" || next.state === "completed") {
          window.clearInterval(authPollRef.current);
          setAuthBusy(false);
          refreshStatus().catch(() => undefined);
        }
      }, 1200);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : String(error));
      setAuthBusy(false);
    }
  };

  const togglePreview = async () => {
    if (!project) return;
    setPreviewBusy(true);
    setPreviewState("starting");
    setPreviewMessage("");
    try {
      const next = await setRuntimePreview(project.id, previewUrl ? "stop" : "start");
      setPreviewUrl(next.previewUrl);
      setPreviewState(next.status);
      setPreviewMessage(next.message || "");
    } catch (error) {
      setPreviewState("failed");
      setPreviewMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewBusy(false);
    }
  };

  const submitCorrection = async () => {
    const nextCorrection = correction.trim();
    if (!nextCorrection || !project) return;
    if (jobId) await cancelJob();
    const nextTask = `${task.trim()}\n\nCorrection from me: ${nextCorrection}`.trim();
    setTask(nextTask);
    setCorrection("");
    setCheckpoint(null);
    setLastBuild(null);
    try {
      const next = await startRuntimeUnderstanding(project.id, nextTask);
      setJobId(next.jobId);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : String(error));
    }
  };

  const fileEntries = useMemo(
    () => (project?.files || []).filter((entry) => entry.kind === "file" || entry.kind === "directory"),
    [project?.files],
  );

  const jobActive = Boolean(jobId && job && !terminalJob(job));
  const checkpointReady = Boolean(checkpoint && !jobActive);
  const workerReady = Boolean(status?.enabled && status.codex.installed && status.codex.signedIn);

  if (!project) {
    return (
      <div className="runtime-shell runtime-picker-shell">
        <header className="runtime-head">
          <div>
            <p className="runtime-kicker">Platynum-47 local workspace</p>
            <h1>Choose the project you want to work on</h1>
            <p className="muted">Platynum opens the real folder on this computer. Nothing is published from here.</p>
          </div>
          <button className="btn ghost" type="button" onClick={onClose}>Close</button>
        </header>

        {statusError && <div className="panel-error">{statusError}</div>}

        {status && (!status.enabled || !status.codex.installed || !status.codex.signedIn) && (
          <section className="runtime-setup-card" aria-live="polite">
            <div>
              <strong>{status.codex.installed ? "Connect your ChatGPT account" : "The local worker is not ready"}</strong>
              <p className="muted small">{authMessage(auth, status)}</p>
            </div>
            {status.codex.installed && !status.codex.signedIn ? (
              <button className="btn build-btn" type="button" onClick={startAuth} disabled={authBusy}>
                {authBusy ? "Waiting for sign-in…" : "Connect ChatGPT"}
              </button>
            ) : !status.codex.installed && !desktop ? (
              <a className="btn build-btn" href="https://learn.chatgpt.com/docs/codex/cli" target="_blank" rel="noreferrer">Get Codex</a>
            ) : null}
          </section>
        )}

        <section className="runtime-picker-card">
          <div className="runtime-section-head">
            <div>
              <h2>Recent projects</h2>
              <p className="muted small">Pick one to open its real files and continue where you left off.</p>
            </div>
            <div className="runtime-section-actions">
              {desktop && <button className="btn build-btn" type="button" onClick={chooseDesktopProject} disabled={pickerBusy}>Choose a folder</button>}
              <button className="btn" type="button" onClick={refreshProjects} disabled={pickerBusy}>Refresh</button>
            </div>
          </div>
          {projects.length > 0 ? (
            <div className="runtime-project-list">
              {projects.map((item) => (
                <button className="runtime-project-card" type="button" key={item.id} onClick={() => loadProject(item.root)}>
                  <span className="runtime-project-icon">{item.kind === "git" ? "◆" : "□"}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.branch ? `${item.branch} · ` : ""}{item.dirty ? `${item.changedFiles} changed` : "Clean"}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="runtime-empty">No recent projects yet. Browse to a folder below.</p>
          )}
        </section>

        <section className="runtime-picker-card">
          <div className="runtime-section-head">
            <div>
              <h2>Browse folders</h2>
              <p className="muted small">Open a Git project or an empty folder for a new one.</p>
            </div>
            <button className="btn" type="button" onClick={() => openFolderBrowser("")} disabled={pickerBusy}>
              {browsePath ? "Home" : "Browse"}
            </button>
          </div>
          {browsePath && (
            <div className="runtime-breadcrumb">
              <span title={browsePath}>{displayPath(browsePath)}</span>
              <button className="link-btn" type="button" onClick={() => openFolderBrowser("")}>Start over</button>
            </div>
          )}
          {entries.length > 0 && (
            <div className="runtime-folder-list">
              {entries.map((entry) => (
                <button
                  className="runtime-folder-entry"
                  type="button"
                  key={entry.path}
                  onClick={() => (entry.kind === "project" && entry.project ? loadProject(entry.project.root) : openFolderBrowser(entry.path))}
                >
                  <span>{entry.kind === "project" ? "◆" : "📁"}</span>
                  <span>{entry.name}</span>
                  {entry.kind === "project" && <small>Open project</small>}
                </button>
              ))}
            </div>
          )}
          {browsePath && (
            <button className="btn build-btn runtime-use-folder" type="button" onClick={() => loadProject(browsePath)} disabled={pickerBusy}>
              Use this folder
            </button>
          )}
        </section>

        {projectError && <div className="panel-error">{projectError}</div>}
        <p className="runtime-safety-note">Local-only guard: edits stay inside the folder you choose. Push, merge, deployment, and credentials are separate actions.</p>
      </div>
    );
  }

  return (
    <div className="runtime-shell">
      <header className="runtime-head runtime-head-workspace">
        <div className="runtime-project-heading">
          <button className="btn ghost" type="button" onClick={() => setProject(null)}>Projects</button>
          <div>
            <p className="runtime-kicker">Working locally</p>
            <h1>{project.name}</h1>
            <p className="muted small">{project.branch ? `${project.branch} · ` : ""}{project.dirty ? `${project.changedFiles} changed files` : "No uncommitted changes"}</p>
          </div>
        </div>
        <div className="runtime-head-actions">
          <span className="runtime-local-badge">Local only</span>
          <button className="btn ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </header>

      <div className="runtime-toolbar">
        <div className="runtime-surface-tabs" role="tablist" aria-label="Project surface">
          <button className={surface === "files" ? "seg active" : "seg"} type="button" onClick={() => setSurface("files")}>Files</button>
          <button className={surface === "preview" ? "seg active" : "seg"} type="button" onClick={() => setSurface("preview")}>Preview</button>
        </div>
        <div className="runtime-toolbar-actions">
          <button className="btn" type="button" onClick={() => startJob("check", "test")} disabled={jobActive || !status?.enabled}>Check project</button>
          <button className="btn" type="button" onClick={togglePreview} disabled={previewBusy}>
            {previewBusy ? "Starting…" : previewUrl ? "Stop preview" : previewState === "failed" ? "Retry preview" : "Start preview"}
          </button>
          <button className="btn build-btn" type="button" onClick={() => setSurface("preview")} disabled={!previewUrl}>Open preview</button>
        </div>
      </div>

      <main className="runtime-layout">
        <aside className="runtime-files" aria-label="Project files">
          <div className="runtime-section-head compact">
            <div><h2>Project files</h2><span className="muted small">{fileEntries.filter((entry) => entry.kind === "file").length} files</span></div>
            <button className="link-btn" type="button" onClick={refreshProject}>Refresh</button>
          </div>
          <div className="runtime-file-list">
            {fileEntries.map((entry) => (
              <button
                className={entry.path === activePath ? "runtime-file-entry active" : "runtime-file-entry"}
                type="button"
                key={entry.path}
                onClick={() => openFile(entry)}
                title={entry.path}
              >
                <span>{fileLabel(entry)}</span>
                {entry.kind === "file" && entry.size !== undefined && <small>{entry.size > 1024 ? `${Math.round(entry.size / 1024)}k` : `${entry.size}b`}</small>}
              </button>
            ))}
          </div>
          {fileBusy && <p className="muted small runtime-file-status">Opening file…</p>}
        </aside>

        <section className="runtime-editor-area">
          {surface === "preview" ? (
            <div className="runtime-preview-area">
              {previewUrl ? (
                <iframe className="runtime-preview-frame" title={`${project.name} preview`} src={previewUrl} />
              ) : (
                <div className="runtime-empty runtime-empty-large">
                  <strong>No preview is running yet.</strong>
                  <p className="muted">Start a preview when this project has a development command, or ask Platynum to set one up.</p>
                  <button className="btn build-btn" type="button" onClick={togglePreview} disabled={previewBusy}>{previewBusy ? "Starting…" : "Start preview"}</button>
                  {previewMessage && <p className="panel-error">{previewMessage}</p>}
                </div>
              )}
            </div>
          ) : activeFile ? (
            <div className="runtime-editor-wrap">
              <div className="runtime-editor-head">
                <span className="runtime-editor-name">{activePath}</span>
                <span className={`runtime-save-state ${fileSaveState}`}>{fileSaveState === "saving" ? "Saving…" : fileSaveState === "error" ? "Could not save" : "Saved"}</span>
              </div>
              <Editor
                fileName={activePath}
                language={activeFile.language}
                value={activeFile.content}
                onChange={(content) => {
                  setActiveFile((current) => (current ? { ...current, content } : current));
                  setFileDirty(true);
                }}
              />
            </div>
          ) : (
            <div className="runtime-empty runtime-empty-large">
              <strong>Choose a file to start.</strong>
              <p className="muted">Your changes save back to the project automatically.</p>
            </div>
          )}
        </section>

        <aside className="runtime-agent" aria-label="Platynum worker">
          <div className="runtime-agent-head">
            <div>
              <p className="runtime-kicker">Managed work</p>
              <h2>Work with Platynum</h2>
            </div>
            <span className={workerReady ? "runtime-dot ready" : "runtime-dot"} title={workerReady ? "Worker ready" : "Worker not connected"} />
          </div>
          {!workerReady && (
            <div className="runtime-setup-inline">
              <p className="muted small">{authMessage(auth, status)}</p>
              {status?.codex.installed && !status.codex.signedIn ? <button className="btn" type="button" onClick={startAuth} disabled={authBusy}>{authBusy ? "Waiting…" : "Connect ChatGPT"}</button> : !status?.codex.installed && !desktop ? <a className="btn" href="https://learn.chatgpt.com/docs/codex/cli" target="_blank" rel="noreferrer">Get Codex</a> : null}
            </div>
          )}
          {recoveryJobs.length > 0 && (
            <section className="runtime-recovery-card" aria-live="polite">
              <strong>Pick up a previous run</strong>
              {recoveryJobs.map((previous) => (
                <button className="runtime-recovery-entry" type="button" key={previous.id} onClick={() => resumeRecoveryJob(previous)}>
                  <span>{previous.kind === "understand" ? "Understanding" : "Build"}</span>
                  <small>{previous.status === "cancelled" ? "Stopped" : "Needs another pass"}</small>
                </button>
              ))}
            </section>
          )}
          <label className="runtime-task-label" htmlFor="runtime-task">What should happen in this project?</label>
          <textarea id="runtime-task" className="field runtime-task" value={task} onChange={(event) => setTask(event.target.value)} placeholder="Describe the result in plain language." rows={5} disabled={jobActive} />
          <p className="muted tiny">Platynum will inspect the project first. It will not edit until you approve its understanding.</p>
          <button className="btn build-btn runtime-understand" type="button" onClick={() => startJob("understand")} disabled={!task.trim() || jobActive || !workerReady}>
            {jobActive && job?.kind === "understand" ? "Understanding…" : "Understand this project"}
          </button>

          {job && (
            <section className="runtime-job-card" aria-live="polite">
              <div className="runtime-section-head compact">
                <strong>{job.kind === "understand" ? "Understanding" : job.kind === "build" ? "Building" : "Checking"}</strong>
                <span className={`runtime-job-status ${job.status}`}>{job.status}</span>
              </div>
              <p className="muted small">{job.stage}</p>
              {job.events.length > 0 && <ul className="runtime-events">{job.events.slice(-7).map((event, index) => <li key={`${event}-${index}`}>{event}</li>)}</ul>}
              {job.kind === "check" && job.check?.checks && job.check.checks.length > 0 && (
                <div className="runtime-check-results">{job.check.checks.map((check) => <span className={check.passed ? "check-pass" : "check-fail"} key={`${check.name}-${check.command}`}>{check.passed ? "✓" : "!"} {check.name}</span>)}</div>
              )}
              {jobActive && <button className="btn ghost" type="button" onClick={cancelJob}>Stop this run</button>}
              {!jobActive && job.resumeAvailable && <button className="btn" type="button" onClick={resumeJob}>Resume this run</button>}
            </section>
          )}

          {checkpoint && (
            <section className="runtime-checkpoint" aria-live="polite">
              <div className="runtime-checkpoint-title"><span className="runtime-kicker">Intent checkpoint</span><span className="runtime-checkpoint-lock">Edit gate closed</span></div>
              <h3>{checkpoint.title}</h3>
              <p>{checkpoint.understanding}</p>
              {checkpoint.recommendations.length > 0 && (
                <>
                  <h4>Three recommendations</h4>
                  <ol>{checkpoint.recommendations.map((item) => <li key={item}>{item}</li>)}</ol>
                </>
              )}
              <h4>Consensus</h4><p>{checkpoint.consensus}</p>
              <h4>Wildcard</h4><p>{checkpoint.wildcard}</p>
              {checkpoint.acceptance.length > 0 && <><h4>How it will be checked</h4><ul>{checkpoint.acceptance.map((item) => <li key={item}>{item}</li>)}</ul></>}
              <div className="runtime-checkpoint-actions">
                <button className="btn build-btn" type="button" onClick={() => startJob("build")} disabled={!checkpointReady || !workerReady}>Approve and build</button>
                <button className="btn ghost" type="button" onClick={() => setCorrection((value) => value || "")}>Correct</button>
              </div>
              <div className="runtime-correction">
                <label htmlFor="runtime-correction">Need a different direction?</label>
                <textarea id="runtime-correction" className="field" rows={2} value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="Say what you actually want." />
                <button className="btn" type="button" onClick={submitCorrection} disabled={!correction.trim()}>Apply correction and re-check</button>
              </div>
            </section>
          )}

          {lastBuild?.result && (
            <section className="runtime-result-card" aria-live="polite">
              <h3>What changed</h3>
              <p>{lastBuild.result.summary}</p>
              {lastBuild.result.changedFiles.length > 0 && <ul>{lastBuild.result.changedFiles.slice(0, 12).map((file) => <li key={file}>{file}</li>)}</ul>}
              {lastBuild.result.checks.length > 0 && <div className="runtime-check-results">{lastBuild.result.checks.map((check) => <span className={check.passed ? "check-pass" : "check-fail"} key={`${check.name}-${check.command}`}>{check.passed ? "✓" : "!"} {check.name}</span>)}</div>}
              {lastBuild.result.remaining.length > 0 && <p className="muted small"><strong>Still needs you:</strong> {lastBuild.result.remaining.join(" ")}</p>}
            </section>
          )}

          {(jobError || projectError) && <div className="panel-error">{jobError || projectError}</div>}
          <p className="runtime-safety-note">This screen can change local files and run project checks. Publishing, pushing, merging, and deployment stay locked until you explicitly choose them later.</p>
        </aside>
      </main>

      <footer className="runtime-statusbar">
        <span>{project.branch ? `Branch: ${project.branch}` : "Folder project"}</span>
        <span>{fileSaveState === "saving" ? "Saving local changes…" : previewUrl ? "Preview running" : previewState === "failed" ? "Preview needs attention" : "Local project · no publication"}</span>
      </footer>
    </div>
  );
}
