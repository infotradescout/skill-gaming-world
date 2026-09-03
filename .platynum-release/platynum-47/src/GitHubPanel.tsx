import { useEffect, useState } from "react";
import {
  getFile,
  listBranches,
  listDir,
  listRepos,
  loadToken,
  oauthConfigured,
  saveToken,
  validateToken,
  type GitHubEntry,
  type GitHubRepo,
} from "./github.ts";

interface GitHubPanelProps {
  onClose: () => void;
  onOpenFile: (fullName: string, branch: string, path: string, content: string, sha: string) => void;
}

export function GitHubPanel({ onClose, onOpenFile }: GitHubPanelProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [devFallback, setDevFallback] = useState<boolean>(false);
  const [token, setToken] = useState<string>(() => loadToken());
  const [login, setLogin] = useState<string>("");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState<string>("");
  const [dir, setDir] = useState<string>("");
  const [entries, setEntries] = useState<GitHubEntry[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const connect = (t: string) =>
    run(async () => {
      const user = await validateToken(t);
      saveToken(t);
      setLogin(user);
      setRepos(await listRepos(t));
    });

  // On open: learn whether one-click is configured, and if a token is already held
  // (from a prior one-click authorize), connect straight through.
  useEffect(() => {
    oauthConfigured().then(setConfigured);
    const existing = loadToken();
    if (existing) connect(existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickRepo = (fullName: string) =>
    run(async () => {
      const r = repos.find((x) => x.full_name === fullName) ?? null;
      setRepo(r);
      if (!r) return;
      const bs = await listBranches(token, r.full_name);
      setBranches(bs);
      const b = bs.includes(r.default_branch) ? r.default_branch : (bs[0] ?? r.default_branch);
      setBranch(b);
      setDir("");
      setEntries(await listDir(token, r.full_name, b, ""));
    });

  const pickBranch = (b: string) =>
    run(async () => {
      if (!repo) return;
      setBranch(b);
      setDir("");
      setEntries(await listDir(token, repo.full_name, b, ""));
    });

  const openDir = (path: string) =>
    run(async () => {
      if (!repo) return;
      setDir(path);
      setEntries(await listDir(token, repo.full_name, branch, path));
    });

  const openParent = () => openDir(dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "");

  const openFile = (path: string) =>
    run(async () => {
      if (!repo) return;
      const file = await getFile(token, repo.full_name, branch, path);
      onOpenFile(repo.full_name, branch, file.path, file.content, file.sha);
    });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <strong>GitHub</strong>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {!login ? (
          <div className="panel-body">
            {configured === null && <div className="muted small">Checking connection…</div>}

            {configured === true && (
              <>
                <p className="muted small">Connect your GitHub in one click — no token, no setup.</p>
                <a className="btn connect-btn" href="/api/github/oauth/start">
                  Connect GitHub
                </a>
              </>
            )}

            {configured === false && (
              <div className="panel-note">
                One-click GitHub connect isn't set up on this deployment yet. Whoever hosts this
                Platynum-47 registers a GitHub OAuth app and sets two values once (see the README) —
                then this becomes a single button for everyone.
              </div>
            )}

            {configured !== null && (
              <button className="link-btn" onClick={() => setDevFallback((v) => !v)}>
                {devFallback ? "Hide developer fallback" : "Developer fallback (paste a token)"}
              </button>
            )}

            {devFallback && (
              <>
                <input
                  className="field"
                  type="password"
                  placeholder="ghp_… personal access token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                />
                <button className="btn" disabled={busy || !token} onClick={() => connect(token)}>
                  {busy ? "Connecting…" : "Connect with token"}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="panel-body">
            <div className="muted small">Signed in as {login}</div>
            <select className="field" value={repo?.full_name ?? ""} onChange={(e) => pickRepo(e.target.value)}>
              <option value="">Select a repository…</option>
              {repos.map((r) => (
                <option key={r.full_name} value={r.full_name}>
                  {r.full_name}
                  {r.private ? " (private)" : ""}
                </option>
              ))}
            </select>

            {repo && (
              <>
                <select className="field" value={branch} onChange={(e) => pickBranch(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                <div className="gh-path muted small">/{dir}</div>
                <div className="gh-list">
                  {dir && (
                    <button className="gh-entry" onClick={openParent}>
                      ⬆ ..
                    </button>
                  )}
                  {entries.map((e) => (
                    <button
                      key={e.path}
                      className="gh-entry"
                      onClick={() => (e.type === "dir" ? openDir(e.path) : openFile(e.path))}
                    >
                      {e.type === "dir" ? "📁" : "📄"} {e.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {busy && <div className="muted small">Loading…</div>}
          </div>
        )}

        {error && <div className="panel-error">{error}</div>}
      </div>
    </div>
  );
}

