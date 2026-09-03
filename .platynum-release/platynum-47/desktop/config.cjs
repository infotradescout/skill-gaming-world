const path = require("node:path");

const CODEX_EXECUTABLE_PARTS = [
  "node_modules",
  "@openai",
  "codex-win32-x64",
  "vendor",
  "x86_64-pc-windows-msvc",
  "bin",
  "codex.exe",
];
const NPM_CLI_PARTS = ["node_modules", "npm", "bin", "npm-cli.js"];

function localOrigin(port) {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("Platynum needs a valid local port.");
  }
  return `http://127.0.0.1:${parsed}`;
}

function unpackedAppPath({ appPath, resourcesPath, isPackaged }) {
  if (!isPackaged) return appPath;
  return path.join(resourcesPath, "app.asar.unpacked");
}

function bundledCodexPath(paths) {
  return path.join(unpackedAppPath(paths), ...CODEX_EXECUTABLE_PARTS);
}

function bundledNpmCliPath(paths) {
  if (paths.isPackaged) return path.join(paths.resourcesPath, "project-runner", "npm", "bin", "npm-cli.js");
  return path.join(unpackedAppPath(paths), ...NPM_CLI_PARTS);
}

function runtimeNodeDirectory(paths) {
  if (paths.isPackaged) return path.join(paths.resourcesPath, "project-runner");
  return path.join(unpackedAppPath(paths), "desktop");
}

function projectRoots({ home, documents, desktop }) {
  return [
    documents,
    desktop,
    path.join(home, "projects"),
    path.join(home, "code"),
    path.join(home, "source"),
  ].filter(Boolean);
}

function desktopRuntimeEnvironment({ port, codexHome, recordDir, projectRoots: roots, nodeBin = process.execPath, ...paths }) {
  const environment = {
    P47_LOCAL_RUNTIME: "1",
    P47_DESKTOP_RUNTIME: "1",
    PORT: String(port),
    P47_CODEX_BIN: bundledCodexPath(paths),
    P47_NPM_CLI: bundledNpmCliPath(paths),
    P47_NODE_BIN: nodeBin,
    P47_RUNTIME_NODE_DIR: runtimeNodeDirectory(paths),
    CODEX_HOME: codexHome,
    P47_PROJECT_ROOTS: roots.join(path.delimiter),
  };
  if (recordDir) environment.P47_RUNTIME_RECORD_DIR = recordDir;
  return environment;
}

function isRuntimeUrl(value, origin) {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = {
  bundledCodexPath,
  bundledNpmCliPath,
  desktopRuntimeEnvironment,
  isRuntimeUrl,
  isSafeExternalUrl,
  localOrigin,
  projectRoots,
  runtimeNodeDirectory,
  unpackedAppPath,
};
