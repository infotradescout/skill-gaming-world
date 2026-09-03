// The in-browser workspace: a small set of files, persisted to localStorage.
// Everything runs on the device — no backend, no network. This is the MVP's
// device-first compute: the preview executes in a sandboxed iframe on the phone.

export type Language = "html" | "css" | "javascript" | "text";

export interface GitHubMeta {
  fullName: string; // owner/repo
  branch: string;
  path: string;
  sha: string;
}

export interface WorkspaceFile {
  name: string;
  language: Language;
  content: string;
  github?: GitHubMeta; // present when the file was opened from a GitHub repo
}

export type Workspace = Record<string, WorkspaceFile>;

// The three demo files that always exist and drive the live preview.
export const DEMO_FILES = ["index.html", "style.css", "script.js"] as const;

export function languageFromFilename(name: string): Language {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "css") return "css";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "ts" || ext === "tsx") return "javascript";
  return "text";
}

export function githubKey(fullName: string, branch: string, path: string): string {
  return `gh:${fullName}@${branch}:${path}`;
}

const STORAGE_KEY = "platynum47:workspace:v1";

const DEFAULT_HTML = `<h1>Hello from Platynum-47</h1>
<p>Edit the files, watch the preview update.</p>
<button id="tap">Tap me</button>
`;

const DEFAULT_CSS = `body {
  font-family: system-ui, sans-serif;
  margin: 2rem;
  color: #0b0d10;
  background: #f5f7fa;
}
button {
  font-size: 1rem;
  padding: 0.6rem 1rem;
  border: 0;
  border-radius: 8px;
  background: #3a86ff;
  color: white;
}
`;

const DEFAULT_JS = `const btn = document.getElementById("tap");
let n = 0;
btn?.addEventListener("click", () => {
  n += 1;
  btn.textContent = "Tapped " + n + "x";
});
`;

export function defaultWorkspace(): Workspace {
  return {
    "index.html": { name: "index.html", language: "html", content: DEFAULT_HTML },
    "style.css": { name: "style.css", language: "css", content: DEFAULT_CSS },
    "script.js": { name: "script.js", language: "javascript", content: DEFAULT_JS },
  };
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace();
    const parsed = JSON.parse(raw) as Workspace;
    // Basic shape check; fall back to defaults if anything is off.
    if (parsed["index.html"] && parsed["style.css"] && parsed["script.js"]) {
      return parsed;
    }
    return defaultWorkspace();
  } catch {
    return defaultWorkspace();
  }
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  } catch {
    // Storage full or unavailable — the editor still works for the session.
  }
}

// Compose the three files into one self-contained HTML document for the
// preview iframe. CSS and JS are inlined so nothing needs to be fetched.
export function buildPreviewDoc(ws: Workspace): string {
  const html = ws["index.html"]?.content ?? "";
  const css = ws["style.css"]?.content ?? "";
  const js = ws["script.js"]?.content ?? "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
${css}
</style>
</head>
<body>
${html}
<script>
${js}
<\/script>
</body>
</html>`;
}

